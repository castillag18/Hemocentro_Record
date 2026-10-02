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
const watchPath = path.join(process.cwd(), "logs", "openwa-session-watch.log");

function append(message, data) {
  fs.mkdirSync(path.dirname(watchPath), { recursive: true });
  fs.appendFileSync(
    watchPath,
    `[${new Date().toISOString()}] ${message} ${JSON.stringify(data ?? {})}\n`,
  );
}

async function tick() {
  const base = (process.env.WHATSAPP_OPENWA_URL || "http://127.0.0.1:2785").replace(/\/$/, "");
  const key = process.env.WHATSAPP_OPENWA_API_KEY || "";
  const stored = process.env.WHATSAPP_OPENWA_SESSION_ID || "default";

  const health = await fetchOpenWa(`${base}/api/health`, key, 8_000);
  if (!health.ok) {
    append("health fail", { error: health.error });
    return;
  }

  let uuid;
  try {
    uuid = await resolveSessionUuid(base, key, stored);
  } catch (err) {
    append("resolve fail", { err: err instanceof Error ? err.message : String(err) });
    return;
  }

  const session = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(uuid)}`, key, 15_000);
  const status = session.data?.status ?? session.data?.state ?? "?";
  append("session status", {
    uuid: uuid.slice(0, 8),
    status,
    phone: session.data?.phone ? "set" : "none",
  });
}

console.log(`Monitoreo sesión OpenWA cada ${INTERVAL_MS / 1000}s`);
console.log(`Log: ${watchPath}`);
console.log("Ctrl+C para detener\n");

void tick();
setInterval(() => void tick(), INTERVAL_MS);
