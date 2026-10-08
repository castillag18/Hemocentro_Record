/**
 * Vacía donantes y datos ligados (citas, recordatorios enviados, sesiones WhatsApp)
 * e importa de nuevo desde HUAV (donantes_info.sql, sin LIMIT).
 *
 * Uso: npm run import:donors:huav:repopulate -- --yes
 */
import { createRequire } from "module";
import { prisma } from "../lib/prisma";
import { importDonorsFromHuav } from "../lib/import-donors-huav";

const require = createRequire(import.meta.url);
require("./load-env.cjs").loadEnv();

function confirmed(): boolean {
  return process.argv.includes("--yes") || process.argv.includes("-y");
}

async function clearDonorData() {
  const [reminders, appointments, sessions, donors] = await prisma.$transaction([
    prisma.reminderLog.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.whatsAppBookingSession.deleteMany(),
    prisma.donor.deleteMany(),
  ]);
  return {
    reminderLogs: reminders.count,
    appointments: appointments.count,
    bookingSessions: sessions.count,
    donors: donors.count,
  };
}

async function main() {
  if (!confirmed()) {
    console.error(
      "Operación destructiva: borra TODOS los donantes y citas/recordatorios asociados.",
    );
    console.error("Confirme con: npm run import:donors:huav:repopulate -- --yes");
    process.exit(1);
  }

  console.log("Eliminando datos de donantes en la BD de la app...");
  const cleared = await clearDonorData();
  console.log(JSON.stringify({ cleared }, null, 2));

  console.log("Importación HUAV (modo full)...");
  const imported = await importDonorsFromHuav({ mode: "full" });
  console.log(JSON.stringify(imported, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
