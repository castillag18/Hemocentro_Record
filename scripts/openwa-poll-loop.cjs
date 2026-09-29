/**
 * Sondeo OpenWA en bucle (para PM2 cuando cron no está disponible).
 * Uso: pm2 start scripts/openwa-poll-loop.cjs --name openwa-poll
 */
require("./load-env.cjs").loadEnv();

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const pollScript = path.join(__dirname, "run-openwa-inbox-poll.cjs");
const intervalMs = Number(process.env.OPENWA_POLL_INTERVAL_MS) || 30_000;

function runOnce() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] openwa:poll-inbox…`);
  const result = spawnSync(process.execPath, [pollScript], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  const out = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (out) console.log(out.slice(-1200));
  if (result.status !== 0) {
    console.warn(`[${ts}] poll terminó con código ${result.status}`);
  }
}

console.log(`OpenWA poll loop — cada ${intervalMs / 1000}s`);
runOnce();
setInterval(runOnce, intervalMs);
