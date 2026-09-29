/**
 * Build de producción con memoria extendida (VMs con poca RAM).
 * Uso: npm run build
 */
const { spawnSync } = require("child_process");

const nodeOptions = process.env.NODE_OPTIONS || "--max-old-space-size=4096";
const env = { ...process.env, NODE_OPTIONS: nodeOptions };

function run(label, cmd, args) {
  console.log(`\n▶ ${label}…`);
  const result = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`\n❌ ${label} falló (código ${result.status ?? "?"})`);
    if (String(result.stderr || "").includes("heap") || label.includes("next build")) {
      console.error("\n→ Memoria insuficiente. En la VM:");
      console.error("  export NODE_OPTIONS=--max-old-space-size=4096");
      console.error("  npm run build");
      console.error("  O agregue swap: docs/INSTALACION-SERVIDOR.md sección 8");
    }
    process.exit(result.status ?? 1);
  }
}

run("prisma generate", "npx", ["prisma", "generate"]);
run("next build", "npx", ["next", "build"]);

console.log("\n✓ Build de producción completado");
