import mysql from "mysql2/promise";

export class HuavConnectionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "HuavConnectionError";
    if (cause instanceof Error) this.cause = cause;
  }
}

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

function formatHuavConnectionError(err: unknown): HuavConnectionError {
  const msg = err instanceof Error ? err.message : String(err);
  const clientHost = process.env.SERVER_IP || "192.168.1.112";
  const user = process.env.HUAV_DB_USER || "He_mo_center";
  const host = process.env.HUAV_DB_HOST || "192.168.1.4";

  if (/access denied/i.test(msg)) {
    return new HuavConnectionError(
      `MySQL rechazó el acceso a «huav» desde esta VM. Solicite a TI: GRANT SELECT ON huav.* TO '${user}'@'${clientHost}'; FLUSH PRIVILEGES; (hemocentro_app puede conectar; falta permiso de lectura en la BD corporativa).`,
      err,
    );
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
    return new HuavConnectionError(
      `No se pudo conectar a MySQL HUAV en ${host}:3306. Verifique red y firewall.`,
      err,
    );
  }
  if (/unknown database/i.test(msg)) {
    return new HuavConnectionError(`La base «${process.env.HUAV_DB_NAME || "huav"}» no existe o el nombre es incorrecto.`, err);
  }
  return new HuavConnectionError(msg, err);
}

export async function withHuavConnection<T>(
  fn: (connection: mysql.Connection) => Promise<T>,
): Promise<T | null> {
  const url = buildHuavDatabaseUrl();
  if (!url) return null;

  let connection: mysql.Connection | undefined;
  try {
    connection = await mysql.createConnection(url);
    return await fn(connection);
  } catch (err) {
    throw formatHuavConnectionError(err);
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
