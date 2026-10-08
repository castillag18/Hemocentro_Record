import { getOpenWaFetchTimeoutMs } from "./fetch-timeout";
import { openWaFetchQueued } from "./openwa-queue";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function openWaFetch(input: RequestInfo | URL, init?: RequestInit) {
  return openWaFetchQueued(input, { ...init, timeoutMs: getOpenWaFetchTimeoutMs() });
}

export type OpenWaSessionSummary = {
  id: string;
  name: string;
  status?: string;
  phone?: string | null;
  pushName?: string | null;
};

export function openWaHeaders(apiKey: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

export function isOpenWaSessionUuid(value: string) {
  return UUID_RE.test(value.trim());
}

export function normalizeOpenWaSessionName(sessionId: string) {
  const raw = sessionId.trim() || "default";
  if (isOpenWaSessionUuid(raw)) return "default";
  const sanitized = raw.replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  if (sanitized.length < 3) return "default";
  return sanitized.slice(0, 50);
}

async function parseOpenWaError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  throw new Error(data.message ?? data.error ?? fallback);
}

export async function listOpenWaSessions(options: { baseUrl: string; apiKey: string }) {
  const base = options.baseUrl.replace(/\/$/, "");
  const res = await openWaFetch(`${base}/api/sessions`, { headers: openWaHeaders(options.apiKey) });
  if (!res.ok) await parseOpenWaError(res, "No se pudo listar sesiones OpenWA");
  const data = (await res.json()) as OpenWaSessionSummary[];
  return Array.isArray(data) ? data : [];
}

async function openWaSessionExists(
  options: { baseUrl: string; apiKey: string },
  uuid: string,
) {
  const base = options.baseUrl.replace(/\/$/, "");
  const res = await openWaFetch(`${base}/api/sessions/${encodeURIComponent(uuid)}`, {
    headers: openWaHeaders(options.apiKey),
  });
  return res.ok;
}

const UUID_CACHE_MS = 5 * 60 * 1000;

function sessionCacheKey(options: { baseUrl: string; sessionId: string }) {
  return `${options.baseUrl.replace(/\/$/, "")}|${options.sessionId.trim() || "default"}`;
}

const uuidCache = new Map<string, { uuid: string; expires: number }>();

export function clearOpenWaSessionUuidCache() {
  uuidCache.clear();
}

export async function resolveOpenWaSessionUuid(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}) {
  const cacheKey = sessionCacheKey(options);
  const cached = uuidCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.uuid;
  }

  const raw = options.sessionId?.trim() || "default";
  if (isOpenWaSessionUuid(raw)) {
    const exists = await openWaSessionExists(options, raw);
    if (exists) {
      uuidCache.set(cacheKey, { uuid: raw, expires: Date.now() + UUID_CACHE_MS });
      return raw;
    }
  }

  const name = normalizeOpenWaSessionName(
    isOpenWaSessionUuid(raw) ? "default" : raw,
  );
  const sessions = await listOpenWaSessions(options);
  const existing = sessions.find((s) => s.name === name);
  if (existing?.id) {
    uuidCache.set(cacheKey, { uuid: existing.id, expires: Date.now() + UUID_CACHE_MS });
    return existing.id;
  }

  const base = options.baseUrl.replace(/\/$/, "");
  const res = await openWaFetch(`${base}/api/sessions`, {
    method: "POST",
    headers: openWaHeaders(options.apiKey),
    body: JSON.stringify({ name }),
  });

  const data = (await res.json().catch(() => ({}))) as OpenWaSessionSummary & {
    message?: string;
    error?: string;
  };

  if (res.status === 409) {
    const again = await listOpenWaSessions(options);
    const found = again.find((s) => s.name === name);
    if (found?.id) {
      uuidCache.set(cacheKey, { uuid: found.id, expires: Date.now() + UUID_CACHE_MS });
      return found.id;
    }
  }

  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? "No se pudo crear la sesión OpenWA");
  }

  if (!data.id) {
    throw new Error("OpenWA no devolvió el UUID de la sesión");
  }

  uuidCache.set(cacheKey, { uuid: data.id, expires: Date.now() + UUID_CACHE_MS });
  return data.id;
}
