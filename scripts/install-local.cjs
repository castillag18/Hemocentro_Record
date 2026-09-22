/**
 * Instalación local completa — HUAV Recordatorio Hemocentro
 *
 * 1. Verifica Node.js
 * 2. Crea .env desde .env.example si no existe
 * 3. npm install
 * 4. Levanta MySQL con Docker (crea BD hemocentro)
 * 5. prisma generate + db push + seed
 */
const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const DEFAULT_DATABASE_URL = "mysql://root:password@localhost:3306/hemocentro";

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  execSync(command, {
    stdio: "inherit",
    shell: true,
    cwd: ROOT,
    ...options,
  });
}

function sleep(seconds) {
  if (process.platform === "win32") {
    execSync(`ping -n ${seconds + 1} 127.0.0.1 > nul`, { stdio: "ignore" });
  } else {
    execSync(`sleep ${seconds}`, { stdio: "ignore" });
  }
}

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    console.log("✓ Archivo .env encontrado");
    return;
  }

  if (!fs.existsSync(ENV_EXAMPLE)) {
    fs.writeFileSync(
      ENV_PATH,
      `DATABASE_URL="${DEFAULT_DATABASE_URL}"\nAUTH_SECRET="dev-secret-change-me"\nNEXT_PUBLIC_APP_URL="http://localhost:3000"\nCRON_SECRET="hemocentro-cron-dev"\n`,
      "utf8",
    );
    console.log("✓ .env creado con valores por defecto");
    return;
  }

  let content = fs.readFileSync(ENV_EXAMPLE, "utf8");
  if (!/^\s*DATABASE_URL=/m.test(content)) {
    content = `DATABASE_URL="${DEFAULT_DATABASE_URL}"\n${content}`;
  }
  content = content.replace(
    /DATABASE_URL="mysql:\/\/[^"]+"/,
    `DATABASE_URL="${DEFAULT_DATABASE_URL}"`,
  );
  fs.writeFileSync(ENV_PATH, content, "utf8");
  console.log("✓ .env creado desde .env.example");
}

function waitForMysql(maxAttempts = 30) {
  console.log("\nEsperando MySQL...");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "hemocentro-mysql",
        "mysqladmin",
        "ping",
        "-h",
        "127.0.0.1",
        "-uroot",
        "-ppassword",
      ],
      { stdio: "ignore", shell: process.platform === "win32" },
    );
    if (result.status === 0) {
      console.log("✓ MySQL listo");
      return true;
    }
    sleep(2);
  }
  return false;
}

function ensureDatabase() {
  run(
    'docker exec hemocentro-mysql mysql -uroot -ppassword -e "CREATE DATABASE IF NOT EXISTS hemocentro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"',
  );
  console.log("✓ Base de datos hemocentro verificada");
}

console.log("═══════════════════════════════════════════════════════");
console.log(" HUAV — Instalación local");
console.log("═══════════════════════════════════════════════════════\n");

const nodeVersion = process.version;
console.log(`Node.js: ${nodeVersion}`);
if (Number(process.version.slice(1).split(".")[0]) < 18) {
  console.error("Se requiere Node.js 18 o superior.");
  process.exit(1);
}

ensureEnvFile();

try {
  run("npm install");
} catch (error) {
  console.error("\nFalló npm install. Revise su conexión e intente de nuevo.");
  process.exit(1);
}

let dockerOk = false;
try {
  run("docker compose up -d");
  dockerOk = waitForMysql();
  if (dockerOk) ensureDatabase();
} catch {
  console.warn("\n⚠ Docker no disponible o falló.");
  console.warn("  Asegúrese de tener MySQL en localhost:3306 y la BD hemocentro creada.");
  console.warn(`  DATABASE_URL="${DEFAULT_DATABASE_URL}"\n`);
}

try {
  run("npx prisma generate");
  run("npx prisma db push --accept-data-loss");
  run("npx tsx prisma/seed.ts");
} catch (error) {
  console.error("\nFalló la configuración de la base de datos.");
  if (!dockerOk) {
    console.error("Inicie MySQL manualmente y ejecute: npm run db:setup");
  }
  process.exit(1);
}

console.log("\n═══════════════════════════════════════════════════════");
console.log(" Instalación completada");
console.log("═══════════════════════════════════════════════════════");
console.log("\n  npm run dev");
console.log("  http://localhost:3000/login");
console.log("  Usuario: admin@hemocentro.local / Admin123!\n");
