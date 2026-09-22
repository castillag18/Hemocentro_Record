import { prisma } from "./prisma";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
const VIOLATION_WINDOW_MS = 10 * 60_000;
const MAX_VIOLATIONS = 3;
const BLACKLIST_HOURS = 24;

type Bucket = { count: number; windowStart: number };
type Violation = { count: number; firstAt: number };

const buckets = new Map<string, Bucket>();
const violations = new Map<string, Violation>();
const memoryBlacklist = new Map<string, number>();

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

async function isBlacklisted(ip: string): Promise<boolean> {
  const memExpiry = memoryBlacklist.get(ip);
  if (memExpiry && memExpiry > Date.now()) return true;
  if (memExpiry) memoryBlacklist.delete(ip);

  try {
    const row = await prisma.ipBlacklist.findUnique({ where: { ip } });
    if (!row) return false;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await prisma.ipBlacklist.delete({ where: { ip } }).catch(() => {});
      return false;
    }
    memoryBlacklist.set(ip, row.expiresAt?.getTime() ?? Date.now() + BLACKLIST_HOURS * 3600_000);
    return true;
  } catch {
    return false;
  }
}

async function addToBlacklist(ip: string, reason: string) {
  const expiresAt = new Date(Date.now() + BLACKLIST_HOURS * 3600_000);
  memoryBlacklist.set(ip, expiresAt.getTime());
  try {
    await prisma.ipBlacklist.upsert({
      where: { ip },
      create: { ip, reason, expiresAt },
      update: { reason, expiresAt },
    });
  } catch {
    /* persistencia opcional si la tabla aún no existe */
  }
}

function recordViolation(ip: string) {
  const now = Date.now();
  const current = violations.get(ip);
  if (!current || now - current.firstAt > VIOLATION_WINDOW_MS) {
    violations.set(ip, { count: 1, firstAt: now });
    return;
  }
  current.count += 1;
  if (current.count >= MAX_VIOLATIONS) {
    void addToBlacklist(ip, "Exceso repetido de peticiones (rate limit)");
    violations.delete(ip);
  }
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 403; message: string };

export async function checkRateLimit(request: Request): Promise<RateLimitResult> {
  const ip = getClientIp(request);

  if (await isBlacklisted(ip)) {
    return {
      allowed: false,
      status: 403,
      message: "Su IP ha sido bloqueada por actividad sospechosa. Contacte al administrador.",
    };
  }

  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    recordViolation(ip);
    return {
      allowed: false,
      status: 429,
      message: "Demasiadas peticiones. Espere un minuto e intente de nuevo.",
    };
  }

  return { allowed: true };
}

export function rateLimitResponse(result: Extract<RateLimitResult, { allowed: false }>) {
  return Response.json({ error: result.message }, { status: result.status });
}
