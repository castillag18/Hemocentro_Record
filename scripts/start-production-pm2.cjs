/**
 * Arranca la app Next.js en PM2 (solo si existe build .next).
 * Uso: cd /opt/Hemocentro_Record && npm run server:pm2-start
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const buildId = path.join(root, ".next", "BUILD_ID");
const name = "huav";

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: false, env: process.env });
}

if (!fs.existsSync(buildId)) {
  console.error("❌ No hay build de producción (.next/BUILD_ID).");
  console.error("→ En la VM (libere RAM: docker stop openwa-api si hace falta):");
  console.error("  export NODE_OPTIONS=--max-old-space-size=3072");
  console.error("  npm run build");
  console.error("  npm run server:pm2-start");
  process.exit(1);
}

const existing = run("pm2", ["describe", name]);
if (existing.status === 0) {
  console.log(`Reiniciando PM2 «${name}»…`);
  const r = run("pm2", ["restart", name, "--update-env"]);
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
} else {
  console.log(`Iniciando PM2 «${name}» (next start)…`);
  const r = run("pm2", ["start", "npm", "--name", name, "--", "start"]);
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("pm2", ["save"]);
console.log("\n✓ App en PM2. Ver: pm2 logs huav");
console.log("  Sondeo WhatsApp: npm run openwa:pm2-start-poll");
