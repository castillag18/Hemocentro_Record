/**
 * Inicia el sondeo de respuestas WhatsApp con PM2 (recomendado en servidor).
 * Uso: cd /opt/Hemocentro_Record && npm run openwa:pm2-start-poll
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const loopScript = path.join(__dirname, "openwa-poll-loop.cjs");
const name = "openwa-poll";

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: false });
}

const existing = run("pm2", ["describe", name]);
if (existing.status === 0) {
  console.log(`Reiniciando proceso PM2 «${name}»…`);
  const r = run("pm2", ["restart", name]);
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  process.exit(r.status ?? 0);
}

console.log(`Iniciando «${name}» (sondeo cada ${process.env.OPENWA_POLL_INTERVAL_MS || 30000} ms)…`);
const start = run("pm2", ["start", loopScript, "--name", name]);
process.stdout.write(start.stdout || "");
process.stderr.write(start.stderr || "");
if (start.status !== 0) {
  console.error("\nInstale PM2: npm install -g pm2");
  process.exit(start.status ?? 1);
}
run("pm2", ["save"]);
console.log("\n✓ Activo. Ver log: pm2 logs openwa-poll");
console.log("  Detener: pm2 stop openwa-poll");
