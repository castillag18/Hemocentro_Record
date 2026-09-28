/**
 * Crea la base de datos MySQL si no existe (según .env).
 * Uso: node scripts/ensure-mysql-database.cjs
 */
const { loadEnv } = require("./load-env.cjs");

let mysql;
try {
  mysql = require("mysql2/promise");
} catch {
  console.error("❌ Falta el paquete mysql2. Ejecute primero: npm install");
  process.exit(1);
}

loadEnv();

function parseMysqlUrl(url) {
  if (!url) return null;
  try {
    const normalized = url.replace(/^mysql:\/\//, "http://");
    const parsed = new URL(normalized);
    const database = parsed.pathname.replace(/^\//, "").split("?")[0];
    return {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      database,
    };
  } catch {
    return null;
  }
}

function resolveDbConfig() {
  const passwordFallback = process.env.HUAV_DB_PASSWORD || "";
  const fromUrl = parseMysqlUrl(process.env.DATABASE_URL);
  if (fromUrl?.database) {
    return {
      ...fromUrl,
      password: fromUrl.password || passwordFallback,
    };
  }

  const host = process.env.HUAV_DB_HOST || "localhost";
  const port = Number(process.env.HUAV_DB_PORT || 3306);
  const database = process.env.APP_DB_NAME || "hemocentro_app";
  const user = process.env.HUAV_DB_USER || "root";
  const password = passwordFallback;

  return { host, port, database, user, password };
}

async function databaseExists(connection, name) {
  const [rows] = await connection.query(
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1",
    [name],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const cfg = resolveDbConfig();
  if (!cfg.database) {
    console.error("❌ No se pudo determinar el nombre de la base de datos (DATABASE_URL / HUAV_DB_NAME).");
    process.exit(1);
  }

  const masked = `mysql://${cfg.user}:****@${cfg.host}:${cfg.port}/${cfg.database}`;
  console.log("Verificando base de datos:", masked);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      multipleStatements: true,
    });

    const exists = await databaseExists(connection, cfg.database);
    if (exists) {
      console.log(`✓ La base de datos «${cfg.database}» ya existe`);
    } else {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${cfg.database.replace(/`/g, "")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      console.log(`✓ Base de datos «${cfg.database}» creada`);
    }

    await connection.end();
    connection = null;
    const scoped = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
    });
    await scoped.query("SELECT 1");
    await scoped.end();
    console.log(`✓ Conexión OK a «${cfg.database}»`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/access denied/i.test(msg)) {
      console.warn(`⚠ Sin permiso CREATE DATABASE. Verifique que «${cfg.database}» exista en el servidor MySQL.`);
      try {
        const direct = await mysql.createConnection({ ...cfg, database: cfg.database });
        await direct.query("SELECT 1");
        await direct.end();
        console.log(`✓ Conexión OK a «${cfg.database}» (existente)`);
        return;
      } catch (inner) {
        console.error("❌", inner instanceof Error ? inner.message : inner);
        process.exit(1);
      }
    }
    if (/ECONNREFUSED|Can't reach database/i.test(msg)) {
      console.error("❌ No se pudo conectar a MySQL en", `${cfg.host}:${cfg.port}`);
      console.error("");
      console.error("  Si la BD está en Windows Server (192.168.1.4) y la app en VM Linux:");
      console.error("    HUAV_DB_HOST=\"192.168.1.4\"");
      console.error("    DATABASE_URL=\"mysql://usuario:pass@192.168.1.4:3306/huav\"");
      console.error("");
      console.error("  Pruebe desde la VM:");
      console.error(`    nc -zv ${cfg.host} ${cfg.port}`);
      console.error(`    mysql -h ${cfg.host} -u ${cfg.user} -p ${cfg.database} -e "SELECT 1;"`);
      console.error("");
      console.error("  En Windows Server: MySQL escuchando en 0.0.0.0, firewall puerto 3306,");
      console.error("  usuario MySQL con permiso desde la IP de la VM (192.168.1.112).");
    } else {
      console.error("❌", msg);
    }
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();
