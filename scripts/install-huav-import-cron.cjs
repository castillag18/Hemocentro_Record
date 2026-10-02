/**
 * Cron diario 3:00 AM — sincronización incremental de donantes desde HUAV.
 * Uso: npm run import:donors:huav:install-cron
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");

const root = process.cwd();
const logsDir = path.join(root, "logs");
const logFile = path.join(logsDir, "huav-import.log");
const directScript = path.join(root, "scripts", "run-huav-import-direct.ts");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const nodeBin = path.dirname(process.execPath);

const force = process.argv.includes("--force");
const cronLine = `0 3 * * * cd ${root} && PATH=${nodeBin}:$PATH ${process.execPath} ${tsxCli} ${directScript} >> ${logFile} 2>&1`;

if (!fs.existsSync(tsxCli)) {
  console.error("❌ Falta tsx. Ejecute: npm install");
  process.exit(1);
}

fs.mkdirSync(logsDir, { recursive: true });

let existing = "";
try {
  existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf8", shell: "/bin/bash" });
} catch {
  existing = "";
}

const marker = "run-huav-import-direct.ts";
if (existing.includes(marker) && !force) {
  console.log("✓ Cron importación HUAV (3:00 AM) ya configurado.");
  console.log(`  Log: ${logFile}`);
  console.log("  Para reinstalar: npm run import:donors:huav:install-cron -- --force");
  process.exit(0);
}

const cleaned = existing
  .split("\n")
  .filter((line) => !line.includes(marker))
  .join("\n")
  .trim();

const updated = `${cleaned}\n${cronLine}\n`.trim() + "\n";
const tmp = path.join(logsDir, "crontab-huav-import.tmp");
fs.writeFileSync(tmp, updated);

const result = spawnSync("crontab", [tmp], { encoding: "utf8" });
fs.unlinkSync(tmp);

if (result.status !== 0) {
  console.error("❌ No se pudo instalar crontab:", result.stderr || result.stdout);
  console.error("\nAgregue manualmente con crontab -e:");
  console.error(cronLine);
  process.exit(1);
}

console.log("✓ Cron instalado — importación HUAV incremental todos los días a las 3:00 AM");
console.log(cronLine);
console.log(`Log: ${logFile}`);
console.log("Prueba manual: npm run import:donors:huav:nightly");
