import { prisma } from "./prisma";

/** Comprueba que la BD responda antes de tocar OpenWA (evita envíos a medias si MySQL cae). */
export async function assertDatabaseReachable() {
  await prisma.$queryRaw`SELECT 1`;
}
