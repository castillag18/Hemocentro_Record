/**
 * Recordatorios automáticos en el mismo proceso Node (sin HTTP → sin timeout con muchos envíos).
 */
import { createRequire } from "module";
import { prisma } from "../lib/prisma";
import { runAutoRemindersJob } from "../lib/cron-reminders";

const require = createRequire(import.meta.url);
require("./load-env.cjs").loadEnv();

async function main() {
  const force = process.argv.includes("--force");
  console.log(force ? "Modo: force (ignora hora programada)" : "Modo: hora Colombia en Configuración");
  const summary = await runAutoRemindersJob({ force });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
