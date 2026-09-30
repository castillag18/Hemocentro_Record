const INGEST = "http://127.0.0.1:7337/ingest/480d9457-0d84-4217-82dc-239d47e97655";
const SESSION = "dc40f8";

/** Solo fetch (sin fs) — seguro en cliente y en build sin bundlear Node. */
export function debugOpenWaLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "run1",
) {
  const payload = {
    sessionId: SESSION,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  // #region agent log
  if (typeof fetch === "function") {
    fetch(INGEST, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
  // #endregion
}
