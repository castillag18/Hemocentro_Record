/**
 * Guía rápida tras OOM (kernel mató node/chrome). No modifica el sistema; imprime pasos.
 */
require("./load-env.cjs").loadEnv();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const hasBuild = fs.existsSync(path.join(root, ".next", "BUILD_ID"));

console.log("══════════════════════════════════════════");
console.log(" Recuperación tras falta de memoria (OOM)");
console.log("══════════════════════════════════════════\n");

try {
  const mem = execSync("free -h | head -2", { encoding: "utf8" });
  console.log(mem);
} catch {
  console.log("(free -h no disponible)\n");
}

console.log(`Build producción (.next): ${hasBuild ? "✓ presente" : "❌ FALTA — npm run build"}\n`);

console.log("Orden recomendado (VM 4 GB RAM):\n");
console.log("  1. Reinicie la VM tras cambiar RAM (Hyper-V) para que el kernel vea 4 GB.");
console.log("  2. cd /opt/Hemocentro_Record");
console.log("  3. docker stop openwa-api    # libera ~500 MB–1 GB durante el build");
console.log("  4. export NODE_OPTIONS=--max-old-space-size=3072");
console.log("  5. git pull && npm run build");
console.log("  6. npm run server:pm2-start");
console.log("  7. docker start openwa-api");
console.log("  8. npm run openwa:pm2-start-poll");
console.log("  9. pm2 save && pm2 list\n");
console.log("Si el build sigue fallando, swap 2G: docs/INSTALACION-SERVIDOR.md §8\n");
console.log("Mientras no haya .next, use solo desarrollo (no producción):");
console.log("  npm run dev:fresh   # no requiere next build\n");
