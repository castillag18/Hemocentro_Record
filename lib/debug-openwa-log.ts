import fs from "fs";
import path from "path";

const INGEST = "http://127.0.0.1:7337/ingest/480d9457-0d84-4217-82dc-239d47e97655";
const SESSION = "dc40f8";

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
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {});

  try {
    const dir = path.join(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "openwa-debug-dc40f8.ndjson"),
      `${JSON.stringify(payload)}\n`,
    );
    fs.appendFileSync(
      path.join(process.cwd(), "debug-dc40f8.log"),
      `${JSON.stringify(payload)}\n`,
    );
  } catch {
    /* ignore */
  }
  // #endregion
}
