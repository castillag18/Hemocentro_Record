import fs from "fs";
import path from "path";

type DebugPayload = {
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

const LOG_PATHS = [
  path.join(process.cwd(), "debug-dc40f8.log"),
  path.join(process.cwd(), ".cursor", "debug-dc40f8.log"),
];
const INGEST_URL = "http://127.0.0.1:7337/ingest/480d9457-0d84-4217-82dc-239d47e97655";
const SESSION_ID = "dc40f8";

export function agentDebugLog(payload: DebugPayload) {
  const line = JSON.stringify({
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    ...payload,
  });

  for (const logPath of LOG_PATHS) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `${line}\n`, "utf8");
    } catch {
      /* ignore fs errors on read-only fs */
    }
  }

  fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: line,
  }).catch(() => {});
}
