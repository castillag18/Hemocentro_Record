import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "./lib/constants";

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "hemocentro-dev-secret-change-in-production-2026");
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
const buckets = new Map<string, { count: number; start: number }>();
const blacklist = new Map<string, number>();

function getIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

function edgeRateLimit(ip: string): NextResponse | null {
  const blockedUntil = blacklist.get(ip);
  if (blockedUntil && blockedUntil > Date.now()) {
    return NextResponse.json(
      { error: "IP bloqueada por exceso de peticiones" },
      { status: 403 },
    );
  }
  if (blockedUntil) blacklist.delete(ip);

  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.start >= WINDOW_MS) {
    buckets.set(ip, { count: 1, start: now });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    blacklist.set(ip, now + 24 * 3600_000);
    return NextResponse.json(
      { error: "Demasiadas peticiones. Espere un minuto." },
      { status: 429 },
    );
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const limited = edgeRateLimit(getIp(request));
  if (limited) return limited;

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isPublicApi =
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/google/status" ||
    pathname === "/api/auth/google" ||
    pathname.startsWith("/api/auth/google/");
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, getSecret());
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (isPublicApi) return NextResponse.next();

  const isPublicWebhook =
    pathname === "/api/webhooks/openwa" ||
    pathname === "/api/cron/reminders" ||
    pathname === "/api/cron/openwa-inbox";
  if (isPublicWebhook) return NextResponse.next();

  if (isLogin) {
    if (valid) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!valid) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|logo.svg|uploads/|api/health).*)"],
};
