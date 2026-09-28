/**
 * prisma db push con reintentos (MySQL remoto puede fallar intermitente).
 */
const { spawnSync } = require("node:child_process");
const { loadEnv } = require("./load-env.cjs");

loadEnv();

const guard = spawnSync("node", ["scripts/guard-app-database.cjs"], {
  stdio: "inherit",
  cwd: require("node:path").join(__dirname, ".."),
});
if (guard.status !== 0) process.exit(guard.status ?? 1);

const acceptLoss = process.argv.includes("--accept-data-loss");
const extraArgs = process.argv.slice(2).filter((a) => a !== "--accept-data-loss");
const args = ["db", "push", ...(acceptLoss ? ["--accept-data-loss"] : []), ...extraArgs];
const maxAttempts = Number(process.env.DB_PUSH_RETRIES || 5);
const delayMs = Number(process.env.DB_PUSH_RETRY_DELAY_MS || 4000);

function sleep(ms) {
  const { execSync } = require("node:child_process");
  execSync(`sleep ${Math.max(1, Math.ceil(ms / 1000))}`, { stdio: "ignore" });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`\n▶ prisma ${args.join(" ")} (intento ${attempt}/${maxAttempts})`);
  const result = spawnSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    shell: true,
    cwd: require("node:path").join(__dirname, ".."),
  });
  if (result.status === 0) {
    console.log("\n✓ Esquema Prisma aplicado");
    process.exit(0);
  }
  if (attempt < maxAttempts) {
    console.warn(`\n⚠ Falló conexión/esquema. Reintento en ${delayMs / 1000}s...`);
    sleep(delayMs);
  }
}

console.error("\n❌ prisma db push falló tras", maxAttempts, "intentos");
process.exit(1);
