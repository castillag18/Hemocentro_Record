/**
 * Verifica conexión MySQL según DATABASE_URL (.env)
 * Uso: npm run db:check
 */
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();

const url = process.env.DATABASE_URL || "";
const masked = url.replace(/:([^:@/]+)@/, ":****@");

async function main() {
  console.log("DATABASE_URL:", masked || "(no definida)");

  const dbName = (() => {
    try {
      const normalized = url.replace(/^mysql:\/\//, "http://");
      return decodeURIComponent(new URL(normalized).pathname.replace(/^\//, "").split("?")[0]);
    } catch {
      return "";
    }
  })();
  const huavName = (process.env.HUAV_DB_NAME || "huav").toLowerCase();
  if (dbName && dbName.toLowerCase() === huavName) {
    console.error("\n❌ DATABASE_URL apunta a la BD corporativa «huav».");
    console.error("   Use hemocentro_app para Prisma. Ver docs/RECUPERACION-BD-HUAV.md");
    process.exit(1);
  }

  if (!url) {
    console.error("\n❌ Falta DATABASE_URL en .env");
    console.error('   Ejemplo Docker: mysql://root:password@localhost:3306/hemocentro');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const donors = await prisma.donor.count().catch(() => null);
    console.log("\n✓ Conexión OK");
    if (donors != null) console.log(`  Donantes en BD: ${donors}`);

    try {
      const settings = await prisma.settings.findUnique({ where: { id: "default" } });
      if (settings?.femaleWholeBloodMonths == null) {
        console.warn("\n⚠ Falta configuración de intervalos en Settings.");
        console.warn("  Ejecute: npm run db:push");
      } else if (settings.autoBirthdayEnabled == null) {
        console.warn("\n⚠ Falta esquema de mensajería automática (cumpleaños/fechas).");
        console.warn("  Ejecute: npm run db:sync");
      } else {
        console.log("  Esquema Settings: OK");
      }

      const template = await prisma.messageTemplate.findFirst({
        where: { channel: "whatsapp", kind: "reminder" },
      });
      if (!template) {
        console.warn("\n⚠ Plantillas de mensajería incompletas. Ejecute: npm run db:sync");
      }

      try {
        await prisma.whatsAppBookingSession.count();
        console.log("  Esquema WhatsAppBookingSession: OK");
      } catch {
        console.warn("\n⚠ Falta tabla WhatsAppBookingSession (agendamiento por WhatsApp).");
        console.warn("  Detenga el servidor dev y ejecute: npm run db:sync");
      }
    } catch (schemaError) {
      const msg = schemaError instanceof Error ? schemaError.message : String(schemaError);
      console.error("\n❌ Esquema desactualizado (Settings)");
      console.error(" ", msg.split("\n")[0]);
      console.error("\n→ Detenga el servidor dev y ejecute: npm run db:sync");
      process.exit(1);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ No se pudo conectar a MySQL");
    console.error(" ", msg.split("\n")[0]);

    if (msg.includes("Authentication failed")) {
      console.error("\n→ La contraseña de root en .env no coincide con MySQL en localhost:3306.");
      console.error("  Opción A: Inicie Docker Desktop y ejecute: npm run install:local");
      console.error("  Opción B: Actualice DATABASE_URL con la contraseña real de su MySQL local");
    } else if (msg.includes("Can't reach database")) {
      console.error("\n→ MySQL no está escuchando en localhost:3306.");
      console.error("  Ejecute: npm run db:up   (requiere Docker Desktop)");
    } else {
      console.error("\n→ Ejecute: npm run install:local");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
