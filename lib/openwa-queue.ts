import { fetchWithTimeout, getOpenWaFetchTimeoutMs } from "./fetch-timeout";

const DEFAULT_MIN_MS = 2000;

export function getOpenWaMinIntervalMs() {
  const raw = Number(process.env.OPENWA_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_MS;
}

export function getOpenWaSendPauseMs() {
  const raw = Number(process.env.OPENWA_SEND_PAUSE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : getOpenWaMinIntervalMs();
}

export function isOpenWaThrottleMessage(message: string, httpStatus?: number) {
  return (
    httpStatus === 429 ||
    /throttlerexception|throttler|too many requests|rate limit/i.test(message)
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

let chain: Promise<unknown> = Promise.resolve();
let lastFinishedAt = 0;

/** Una petición OpenWA a la vez, con pausa mínima entre llamadas (evita ThrottlerException). */
export function runOpenWaQueued<T>(fn: () => Promise<T>): Promise<T> {
  const task = chain.then(async () => {
    const gap = getOpenWaMinIntervalMs();
    const wait = Math.max(0, lastFinishedAt + gap - Date.now());
    if (wait > 0) await sleep(wait);
    const value = await fn();
    lastFinishedAt = Date.now();
    return value;
  });
  chain = task.catch(() => {});
  return task;
}

async function fetchOpenWaWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const gap = getOpenWaMinIntervalMs();
  let lastError = "OpenWA no respondió";

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetchWithTimeout(input, init);
    if (res.status !== 429) return res;

    const data = (await res.clone().json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    lastError = data.message ?? data.error ?? "ThrottlerException: Too Many Requests";
    if (attempt >= 4) break;
    await sleep(gap * attempt * 2);
  }

  throw new Error(
    isOpenWaThrottleMessage(lastError)
      ? "OpenWA limitó las peticiones (demasiadas a la vez). Espere 1–2 minutos; la sesión puede seguir conectada en el panel de OpenWA."
      : lastError,
  );
}

export async function openWaFetchQueued(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? getOpenWaFetchTimeoutMs();
  const { timeoutMs: _drop, ...rest } = init ?? {};
  return runOpenWaQueued(() => fetchOpenWaWithRetry(input, { ...rest, timeoutMs }));
}

/** Pausa extra tras cada envío de WhatsApp en lotes. */
export async function openWaAfterSendPause() {
  const ms = getOpenWaSendPauseMs();
  if (ms > 0) await sleep(ms);
}
