/**
 * Crea la base de datos MySQL si no existe (según .env).
 * Uso: node scripts/ensure-mysql-database.cjs
 */
const mysql = require("mysql2/promise");
const { loadEnv } = require("./load-env.cjs");

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
  const fromUrl = parseMysqlUrl(process.env.DATABASE_URL);
  if (fromUrl?.database) return fromUrl;

  const host = process.env.HUAV_DB_HOST || "localhost";
  const port = Number(process.env.HUAV_DB_PORT || 3306);
  const database = process.env.HUAV_DB_NAME || "huav";
  const user = process.env.HUAV_DB_USER || "root";
  const password = process.env.HUAV_DB_PASSWORD || "";

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

    await connection.changeUser({ database: cfg.database });
    await connection.query("SELECT 1");
    console.log(`✓ Conexión OK a «${cfg.database}»`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/access denied.*create/i.test(msg) || /privilege/i.test(msg)) {
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
    console.error("❌", msg);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();
