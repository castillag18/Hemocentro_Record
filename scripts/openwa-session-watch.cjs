/**
 * Registra cambios de estado de la sesión OpenWA (detectar desconexiones).
 * Uso: cd /opt/Hemocentro_Record && npm run openwa:session-watch
 * Deje corriendo 5–10 min mientras usa WhatsApp.
 */
require("./load-env.cjs").loadEnv();

const fs = require("fs");
const path = require("path");
const { fetchOpenWa, resolveSessionUuid } = require("./openwa-http.cjs");

const INTERVAL_MS = Number(process.env.OPENWA_WATCH_INTERVAL_MS) || 15_000;
const logPath = path.join(process.cwd(), "logs", "openwa-debug-dc40f8.ndjson");
const watchPath = path.join(process.cwd(), "logs", "openwa-session-watch.log");

function append(payload) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const line = `${JSON.stringify({ ...payload, timestamp: Date.now(), sessionId: "dc40f8" })}\n`;
  fs.appendFileSync(logPath, line);
  fs.appendFileSync(watchPath, `[${new Date().toISOString()}] ${payload.message} ${JSON.stringify(payload.data)}\n`);
}

async function tick() {
  const base = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
  const key = process.env.WHATSAPP_OPENWA_API_KEY || "";
  const stored = process.env.WHATSAPP_OPENWA_SESSION_ID || "default";

  const health = await fetchOpenWa(`${base}/api/health`, key, 8_000);
  if (!health.ok) {
    append({ hypothesisId: "H3", location: "session-watch", message: "health fail", data: { error: health.error } });
    return;
  }

  let uuid;
  try {
    uuid = await resolveSessionUuid(base, key, stored);
  } catch (err) {
    append({
      hypothesisId: "H2",
      location: "session-watch",
      message: "resolve fail",
      data: { err: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  const session = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(uuid)}`, key, 15_000);
  const status = session.data?.status ?? session.data?.state ?? "?";
  append({
    hypothesisId: "H1",
    location: "session-watch",
    message: "session status",
    data: { uuid: uuid.slice(0, 8), status, phone: session.data?.phone ? "set" : "none" },
  });
}

console.log(`Monitoreo sesión OpenWA cada ${INTERVAL_MS / 1000}s`);
console.log(`Log: ${watchPath}`);
console.log("Ctrl+C para detener\n");

void tick();
setInterval(() => void tick(), INTERVAL_MS);
