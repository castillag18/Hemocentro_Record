/**
 * Utilidades HTTP para scripts OpenWA (timeout + resolver sesión por nombre).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function timeoutMs() {
  const raw = Number(process.env.OPENWA_FETCH_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20_000;
}

function openWaHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

async function fetchOpenWa(url, apiKey, ms = timeoutMs(), init = {}) {
  const method = init.method || "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      method,
      headers: openWaHeaders(apiKey),
      body: init.body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: {},
      error: timedOut ? `Tiempo de espera agotado (${ms} ms)` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSessionName(sessionId) {
  const raw = String(sessionId || "default").trim() || "default";
  if (UUID_RE.test(raw)) return "default";
  return raw.replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "default";
}

async function resolveSessionUuid(baseUrl, apiKey, sessionId) {
  const base = baseUrl.replace(/\/$/, "");
  const raw = String(sessionId || "default").trim() || "default";

  if (UUID_RE.test(raw)) {
    const probe = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(raw)}`, apiKey);
    if (probe.ok) return raw;
  }

  const list = await fetchOpenWa(`${base}/api/sessions`, apiKey);
  if (!list.ok) {
    throw new Error(
      list.error ||
        `No se pudo listar sesiones OpenWA (HTTP ${list.status}). Pruebe: docker restart openwa-api`,
    );
  }

  const sessions = Array.isArray(list.data) ? list.data : [];
  const name = normalizeSessionName(raw);
  const found = sessions.find((s) => s.name === name || s.id === raw);
  if (found?.id) return found.id;

  throw new Error(
    `Sesión «${name}» no encontrada en OpenWA. Vaya a Configuración → Generar QR.`,
  );
}

module.exports = {
  fetchOpenWa,
  resolveSessionUuid,
  openWaHeaders,
  timeoutMs,
  UUID_RE,
};
