/**
 * Diagnóstico rápido MySQL + OpenWA + sesión WhatsApp.
 * Uso: npm run server:recover
 */
require("./load-env.cjs").loadEnv();

const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const { fetchOpenWa, resolveSessionUuid } = require("./openwa-http.cjs");

async function main() {
  console.log("══════════════════════════════════════════");
  console.log(" Recuperación — MySQL + OpenWA");
  console.log("══════════════════════════════════════════\n");

  const host = process.env.HUAV_DB_HOST || "192.168.1.4";
  try {
    execSync(`nc -zv ${host} 3306`, { stdio: "inherit", timeout: 8000 });
    console.log(`\n✓ MySQL alcanzable en ${host}:3306\n`);
  } catch {
    console.error(`\n❌ MySQL NO alcanzable en ${host}:3306`);
    console.error("→ Verifique servicio MySQL en Windows Server");
    console.error("→ Firewall puerto 3306 desde 192.168.1.112\n");
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✓ Prisma / hemocentro_app conecta\n");
  } catch (err) {
    console.error("❌ Prisma no conecta:", err instanceof Error ? err.message.split("\n")[0] : err);
    console.error("→ Espere a que MySQL responda y reintente\n");
  }

  const base = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
  const key = process.env.WHATSAPP_OPENWA_API_KEY || "";
  const health = await fetchOpenWa(`${base}/api/health`, key, 10_000);
  if (!health.ok) {
    console.error("❌ OpenWA no responde:", health.error || health.status);
    console.error("→ docker restart openwa-api\n");
  } else {
    console.log("✓ OpenWA /api/health OK");
    try {
      const uuid = await resolveSessionUuid(base, key, process.env.WHATSAPP_OPENWA_SESSION_ID || "default");
      const session = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(uuid)}`, key);
      const status = session.data?.status ?? session.data?.state ?? "?";
      console.log(`  Sesión ${uuid.slice(0, 8)}… estado: ${status}`);
      if (status === "ready" || status === "CONNECTED" || status === "connected") {
        console.log("\n✓ Stack listo. Pruebe: npm run openwa:poll-inbox");
      } else {
        console.warn("\n⚠ Vincule WhatsApp: npm run openwa:restart-session → Generar QR");
      }
    } catch (err) {
      console.error("❌ Sesión OpenWA:", err instanceof Error ? err.message : err);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
