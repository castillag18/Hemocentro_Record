/**
 * Cron cada hora — dispara recordatorios cuando la hora en Colombia coincide con Configuración.
 * Uso: npm run cron:reminders:install-cron
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");

const root = process.cwd();
const logsDir = path.join(root, "logs");
const logFile = path.join(logsDir, "reminders-cron.log");
const cronScript = path.join(root, "scripts", "run-cron.cjs"); // delega en run-cron-direct.ts (tsx)
const nodeBin = path.dirname(process.execPath);
const force = process.argv.includes("--force");

const cronLine = `5 * * * * cd ${root} && PATH=${nodeBin}:$PATH ${process.execPath} ${cronScript} >> ${logFile} 2>&1`;

fs.mkdirSync(logsDir, { recursive: true });

let existing = "";
try {
  existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf8", shell: "/bin/bash" });
} catch {
  existing = "";
}

const marker = "scripts/run-cron.cjs";
if (existing.includes(marker) && !force) {
  console.log("✓ Cron de recordatorios (cada hora) ya configurado.");
  console.log(`  Log: ${logFile}`);
  console.log("  Active envíos automáticos y la hora en Configuración → General.");
  console.log("  Para reinstalar: npm run cron:reminders:install-cron -- --force");
  process.exit(0);
}

const cleaned = existing
  .split("\n")
  .filter((line) => !line.includes(marker))
  .join("\n")
  .trim();

const updated = `${cleaned}\n${cronLine}\n`.trim() + "\n";
const tmp = path.join(logsDir, "crontab-reminders.tmp");
fs.writeFileSync(tmp, updated);

const result = spawnSync("crontab", [tmp], { encoding: "utf8" });
fs.unlinkSync(tmp);

if (result.status !== 0) {
  console.error("❌ No se pudo instalar crontab:", result.stderr || result.stdout);
  console.error("\nAgregue manualmente con crontab -e:");
  console.error(cronLine);
  process.exit(1);
}

console.log("✓ Cron instalado — revisa recordatorios cada hora (minuto :05, hora Colombia en la app)");
console.log(cronLine);
console.log(`Log: ${logFile}`);
console.log("Prueba ahora: npm run cron:reminders");
console.log("Prueba sin esperar las 9:00: npm run cron:reminders:force");
