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
