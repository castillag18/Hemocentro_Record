/** Timeout OpenWA (ms). En servidor lento o Docker: OPENWA_FETCH_TIMEOUT_MS=20000 */
export function getOpenWaFetchTimeoutMs() {
  const raw = process.env.OPENWA_FETCH_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000;
}

/** fetch con límite de tiempo para no bloquear la app si OpenWA o la red tardan. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 8000;
  const { timeoutMs: _drop, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Tiempo de espera agotado (${timeoutMs} ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
