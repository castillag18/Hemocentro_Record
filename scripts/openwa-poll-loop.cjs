/**
 * Sondeo OpenWA en bucle (para PM2 cuando cron no está disponible).
 * Backoff si la sesión no está «ready» (reduce presión sobre Chromium/OpenWA).
 * Uso: pm2 start scripts/openwa-poll-loop.cjs --name openwa-poll
 */
require("./load-env.cjs").loadEnv();

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const pollScript = path.join(__dirname, "run-openwa-inbox-poll.cjs");
const baseIntervalMs = Number(process.env.OPENWA_POLL_INTERVAL_MS) || 90_000;
const maxBackoffMs = Number(process.env.OPENWA_POLL_MAX_BACKOFF_MS) || 300_000;

let nextDelayMs = baseIntervalMs;
let sessionFailStreak = 0;

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

  const openWaUnreachable = /no se pudo contactar OpenWA|operation was aborted/i.test(out);
  const sessionNotReady =
    /estado sesión: (failed|initializing|authenticating|connecting|qr_ready)/i.test(out) &&
    result.status !== 0;

  if (openWaUnreachable) {
    sessionFailStreak = Math.min(sessionFailStreak + 1, 6);
    nextDelayMs = Math.min(baseIntervalMs * 2 ** sessionFailStreak, maxBackoffMs);
    console.warn(
      `[${ts}] OpenWA lento/caído (¿RAM?) — próximo intento en ${Math.round(nextDelayMs / 1000)}s`,
    );
  } else if (sessionNotReady) {
    sessionFailStreak = Math.min(sessionFailStreak + 1, 6);
    nextDelayMs = Math.min(baseIntervalMs * 2 ** sessionFailStreak, maxBackoffMs);
    console.warn(
      `[${ts}] Sesión no ready — próximo intento en ${Math.round(nextDelayMs / 1000)}s (backoff)`,
    );
  } else if (result.status !== 0) {
    console.warn(`[${ts}] poll terminó con código ${result.status}`);
    nextDelayMs = baseIntervalMs;
    sessionFailStreak = 0;
  } else {
    nextDelayMs = baseIntervalMs;
    sessionFailStreak = 0;
  }

  setTimeout(runOnce, nextDelayMs);
}

console.log(`OpenWA poll loop — base ${baseIntervalMs / 1000}s, backoff hasta ${maxBackoffMs / 1000}s`);
runOnce();
