/**
 * Permite reprocesar respuestas «Sí» (p. ej. tras reconectar WhatsApp).
 * Uso: node scripts/openwa-clear-processed.cjs [horas]
 * Default: borra registros de las últimas 48 h.
 */
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");

const hours = Math.max(1, Number(process.argv[2]) || 48);
const since = new Date(Date.now() - hours * 60 * 60 * 1000);

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.openWaProcessedMessage.deleteMany({
      where: { processedAt: { gte: since } },
    });
    console.log(`Eliminados ${result.count} mensajes procesados desde ${since.toISOString()}`);
    console.log("Ejecute: npm run openwa:poll-inbox");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
