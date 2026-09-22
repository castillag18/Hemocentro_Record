/**
 * Muestra el motor activo de OpenWA y el estado de la sesión.
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

async function main() {
  const base = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
  const key = process.env.WHATSAPP_OPENWA_API_KEY || "";
  const headers = { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) };

  const health = await fetch(`${base}/api/health`, { headers });
  console.log("health:", health.status, (await health.text()).slice(0, 300));

  const infra = await fetch(`${base}/api/infra/status`, { headers });
  const infraText = await infra.text();
  console.log("infra:", infra.status, infraText.slice(0, 800));

  const sessions = await fetch(`${base}/api/sessions`, { headers });
  const sessionsData = await sessions.json().catch(() => ({}));
  console.log("sessions:", sessions.status, JSON.stringify(sessionsData, null, 2).slice(0, 1200));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
