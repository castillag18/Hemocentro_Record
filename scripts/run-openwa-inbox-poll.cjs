/**
 * Sondeo de bandeja OpenWA para respuestas «Sí».
 * Por defecto ejecuta en modo directo (BD + OpenWA) — no requiere que Next.js esté corriendo.
 * Modo HTTP (opcional): CRON_USE_HTTP=1 npm run openwa:poll-inbox
 */
require("./load-env.cjs").loadEnv();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const directScript = path.join(__dirname, "run-openwa-inbox-poll-direct.ts");

function runDirect() {
  if (!fs.existsSync(tsxCli)) {
    console.error("No se encontró tsx. En el servidor ejecute: cd /opt/Hemocentro_Record && npm install");
    return false;
  }
  const result = spawnSync(process.execPath, [tsxCli, directScript], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
  if (result.error) {
    console.error("No se pudo ejecutar el sondeo directo:", result.error.message);
    return false;
  }
  process.exit(result.status ?? 1);
}

async function runHttp() {
  const { postCron } = require("./cron-fetch.cjs");
  await postCron("/api/cron/openwa-inbox");
}

if (process.env.CRON_USE_HTTP === "1") {
  runHttp().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  runDirect();
}
