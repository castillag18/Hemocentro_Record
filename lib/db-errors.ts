import { Prisma } from "@prisma/client";

export const DB_UNAVAILABLE_MESSAGE =
  "Base de datos no disponible. Inicie Docker Desktop y ejecute npm run install:local, o corrija DATABASE_URL en .env";

export const DB_SCHEMA_OUT_OF_SYNC_MESSAGE =
  "El esquema de la base de datos está desactualizado. Detenga el servidor, ejecute npm run db:push y reinicie con npm run dev:fresh";

export function isSchemaOutOfSync(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2022" || error.code === "P2021";
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist in the current database");
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P1000" || error.code === "P1001";
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Authentication failed against database server") ||
    message.includes("Can't reach database server") ||
    message.includes("ECONNREFUSED")
  );
}
