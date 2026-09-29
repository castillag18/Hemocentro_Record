/**
 * Instala cron para sondeo OpenWA (respuestas «Sí» / agendamiento).
 * Uso: npm run openwa:install-cron
 */
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const logsDir = path.join(root, "logs");
const logFile = path.join(logsDir, "openwa-poll.log");

function which(cmd) {
  try {
    return execSync(`command -v ${cmd}`, { encoding: "utf8", shell: "/bin/bash" }).trim();
  } catch {
    return "";
  }
}

const npm = which("npm");
if (!npm) {
  console.error("❌ No se encontró npm en PATH. Cargue nvm: source ~/.nvm/nvm.sh");
  process.exit(1);
}

fs.mkdirSync(logsDir, { recursive: true });

const cronLine = `* * * * * cd ${root} && ${npm} run openwa:poll-inbox >> ${logFile} 2>&1`;

let existing = "";
try {
  existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf8", shell: "/bin/bash" });
} catch {
  existing = "";
}

if (existing.includes("openwa:poll-inbox")) {
  console.log("✓ Cron openwa:poll-inbox ya estaba configurado");
  console.log(existing.split("\n").filter((l) => l.includes("openwa:poll-inbox")).join("\n"));
  process.exit(0);
}

const updated = `${existing.trim()}\n${cronLine}\n`.trim() + "\n";
const tmp = path.join(logsDir, "crontab.tmp");
fs.writeFileSync(tmp, updated);

const result = spawnSync("crontab", [tmp], { encoding: "utf8" });
fs.unlinkSync(tmp);

if (result.status !== 0) {
  console.error("❌ No se pudo instalar crontab:", result.stderr || result.stdout);
  console.error("\nAgregue manualmente con crontab -e:");
  console.error(cronLine);
  process.exit(1);
}

console.log("✓ Cron instalado (cada minuto):");
console.log(cronLine);
console.log(`\nLog: tail -f ${logFile}`);
console.log("\nPrueba manual: npm run openwa:poll-inbox");
