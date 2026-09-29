/**
 * Carga variables desde .env (sin dependencia extra).
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

/** HUAV_DB_PASSWORD debe ser la contraseña real (H*3...), no la forma URL (%2A). */
function normalizeHuavPassword(pass) {
  if (!pass || !pass.includes("%")) return pass;
  try {
    const decoded = decodeURIComponent(pass);
    if (decoded !== pass) return decoded;
  } catch {
    /* ignore */
  }
  return pass;
}

function buildHuavDatabaseUrl() {
  if (process.env.HUAV_DATABASE_URL) return process.env.HUAV_DATABASE_URL;
  const host = process.env.HUAV_DB_HOST || "localhost";
  const port = process.env.HUAV_DB_PORT || "3306";
  const name = process.env.HUAV_DB_NAME || "huav";
  const user = process.env.HUAV_DB_USER || "";
  const pass = normalizeHuavPassword(process.env.HUAV_DB_PASSWORD || "");
  if (!user) return process.env.DATABASE_URL || "";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

module.exports = { loadEnv, buildHuavDatabaseUrl, normalizeHuavPassword };
