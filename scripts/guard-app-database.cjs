/**
 * Evita que Prisma modifique la base de datos corporativa HUAV.
 * Uso: node scripts/guard-app-database.cjs
 * Sale con código 1 si DATABASE_URL apunta a la misma BD que HUAV_DB_NAME (p. ej. huav).
 */
const { loadEnv } = require("./load-env.cjs");

loadEnv();

function dbNameFromUrl(url) {
  if (!url) return "";
  try {
    const normalized = url.replace(/^mysql:\/\//, "http://");
    return decodeURIComponent(new URL(normalized).pathname.replace(/^\//, "").split("?")[0]);
  } catch {
    return "";
  }
}

const appDb = dbNameFromUrl(process.env.DATABASE_URL);
const huavDb = (process.env.HUAV_DB_NAME || "huav").trim();
const allowOverride = process.env.ALLOW_PRISMA_ON_HUAV === "1";

if (!appDb) {
  console.error("❌ DATABASE_URL no definida o inválida.");
  process.exit(1);
}

const protectedNames = new Set(
  [huavDb, "huav", process.env.HUAV_PROTECTED_DB_NAME]
    .filter(Boolean)
    .map((n) => n.toLowerCase()),
);

if (protectedNames.has(appDb.toLowerCase()) && !allowOverride) {
  console.error("");
  console.error("══════════════════════════════════════════════════════════════");
  console.error(" BLOQUEADO: Prisma no puede ejecutarse sobre la BD corporativa");
  console.error("══════════════════════════════════════════════════════════════");
  console.error("");
  console.error(`  DATABASE_URL apunta a: «${appDb}»`);
  console.error(`  HUAV_DB_NAME (empresa): «${huavDb}»`);
  console.error("");
  console.error("  La app debe usar una base SEPARADA, por ejemplo:");
  console.error("    APP_DB_NAME=\"hemocentro_app\"");
  console.error("    DATABASE_URL=\"mysql://usuario:pass@192.168.1.4:3306/hemocentro_app\"");
  console.error("");
  console.error("  HUAV_DB_* sigue apuntando a «huav» solo para LECTURA (importar donantes).");
  console.error("");
  console.error("  Si realmente desea forzar (NO recomendado): ALLOW_PRISMA_ON_HUAV=1");
  console.error("");
  process.exit(1);
}

console.log(`✓ Base de datos de la app: «${appDb}» (separada de HUAV corporativa)`);
