import mysql from "mysql2/promise";

export function buildHuavDatabaseUrl(): string | null {
  if (process.env.HUAV_DATABASE_URL?.trim()) {
    return process.env.HUAV_DATABASE_URL.trim();
  }

  const host = process.env.HUAV_DB_HOST || "localhost";
  const port = process.env.HUAV_DB_PORT || "3306";
  const name = process.env.HUAV_DB_NAME || "huav";
  const user = process.env.HUAV_DB_USER || "";
  const pass = process.env.HUAV_DB_PASSWORD || "";
  if (!user) return null;

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

export async function withHuavConnection<T>(
  fn: (connection: mysql.Connection) => Promise<T>,
): Promise<T | null> {
  const url = buildHuavDatabaseUrl();
  if (!url) return null;

  const connection = await mysql.createConnection(url);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}
