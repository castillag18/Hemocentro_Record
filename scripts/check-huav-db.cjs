/**
 * Verifica conexión de lectura a MySQL HUAV (importación de donantes).
 * Uso: npm run db:check:huav
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { loadEnv, buildHuavDatabaseUrl } = require("./load-env.cjs");

loadEnv();

function maskUrl(url) {
  return url.replace(/:([^:@/]+)@/, ":****@");
}

function suggestGrantFix(errMsg) {
  const host = process.env.HUAV_DB_HOST || "192.168.1.4";
  const user = process.env.HUAV_DB_USER || "He_mo_center";
  const clientHost = process.env.SERVER_IP || "192.168.1.112";
  console.error("\n→ Solicite a TI en MySQL (Windows Server) ejecutar:");
  console.error(`  GRANT SELECT ON huav.* TO '${user}'@'${clientHost}';`);
  console.error("  FLUSH PRIVILEGES;");
  console.error("\n  Nota: hemocentro_app puede conectar, pero huav requiere permiso SELECT aparte.");
  console.error(`  Host cliente detectado en docs: ${clientHost} (VM Linux con la app).`);
  if (/access denied/i.test(errMsg)) {
    console.error("\n  Causa probable: el usuario existe pero no tiene SELECT sobre la base «huav».");
  }
}

async function main() {
  const url = buildHuavDatabaseUrl();
  if (!url) {
    console.error("❌ Falta HUAV_DB_USER / HUAV_DB_PASSWORD en .env");
    process.exit(1);
  }

  const dbName = process.env.HUAV_DB_NAME || "huav";
  const sqlPath =
    process.env.HUAV_DONORS_SQL?.trim() ||
    path.join(process.cwd(), "donantes_info.sql");

  console.log("HUAV MySQL:", maskUrl(url));
  console.log("Base:", dbName);
  console.log("SQL:", sqlPath);

  if (!fs.existsSync(sqlPath)) {
    console.error(`\n❌ No se encontró ${sqlPath}`);
    console.error("→ Copie donantes_info.sql al directorio del proyecto.");
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(url);
    await connection.query("SELECT 1");
    console.log("\n✓ Conexión HUAV OK");

    let sql = fs.readFileSync(sqlPath, "utf8").trim();
    if (!sql.endsWith(";")) sql += ";";
    sql = sql.replace(/\bLIMIT\s+\d+\b/gi, "");

    const [rows] = await connection.query(sql);
    console.log(`✓ Query donantes_info.sql: ${rows.length} filas`);

    if (rows.length === 0) {
      console.warn("\n⚠ La consulta no devolvió filas. Revise donantes_info.sql o datos en HUAV.");
    } else {
      console.log("\nImportación HUAV debería funcionar. Ejecute: npm run import:donors:huav");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ No se pudo leer la BD HUAV");
    console.error(" ", msg.split("\n")[0]);

    if (/access denied/i.test(msg)) {
      suggestGrantFix(msg);
    } else if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
      console.error("\n→ Verifique red/firewall hacia MySQL:");
      console.error(`  nc -zv ${process.env.HUAV_DB_HOST || "192.168.1.4"} 3306`);
    } else if (/unknown database/i.test(msg)) {
      console.error("\n→ La base «huav» no existe o el nombre en HUAV_DB_NAME es incorrecto.");
    }

    process.exit(1);
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

main();
