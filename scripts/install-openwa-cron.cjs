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

const node =
  which("node") ||
  process.execPath ||
  (which("npm") ? path.join(path.dirname(which("npm")), "node") : "");

if (!node || !fs.existsSync(node)) {
  console.error("❌ No se encontró node. Ejecute: source ~/.nvm/nvm.sh && which node");
  process.exit(1);
}

fs.mkdirSync(logsDir, { recursive: true });

const pollScript = path.join(root, "scripts", "run-openwa-inbox-poll.cjs");
const nodeBin = path.dirname(node);
// Cron no carga nvm: invocar node directamente (npm run falla con «env: node not found»).
const cronLine = `* * * * * cd ${root} && PATH=${nodeBin}:$PATH ${node} ${pollScript} >> ${logFile} 2>&1`;

let existing = "";
try {
  existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf8", shell: "/bin/bash" });
} catch {
  existing = "";
}

function isOpenWaPollLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return false;
  return (
    t.includes("openwa:poll-inbox") ||
    t.includes("openwa-poll") ||
    t.includes("run-openwa-inbox-poll") ||
    t.includes("/ruta/completa/npm")
  );
}

const force = process.argv.includes("--force");
const hasPoll = existing.split("\n").some(isOpenWaPollLine);

if (hasPoll && !force) {
  console.log("✓ Cron openwa:poll-inbox ya configurado. Para reemplazar: npm run openwa:install-cron -- --force");
  console.log(existing.split("\n").filter(isOpenWaPollLine).join("\n"));
  process.exit(0);
}

const cleaned = existing
  .split("\n")
  .filter((line) => !isOpenWaPollLine(line))
  .join("\n")
  .trim();

const updated = `${cleaned}\n${cronLine}\n`.trim() + "\n";
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
console.log(`\nPrueba manual: ${node} ${pollScript}`);
console.log("Si el log mostraba «env: node not found», el cron anterior usaba npm — ya corregido.");
