/**
 * Estado de OpenWA (health + sesión WhatsApp).
 * Uso: npm run openwa:check
 */
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");
const { fetchOpenWa, resolveSessionUuid } = require("./openwa-http.cjs");

const READY = new Set(["ready", "CONNECTED", "connected", "open"]);

async function main() {
  const p = new PrismaClient();
  try {
    const s = await p.settings.findUnique({ where: { id: "default" } });
    if (!s) {
      console.error("❌ No hay Settings en la BD");
      process.exit(1);
    }

    let base = (process.env.WHATSAPP_OPENWA_URL || s.whatsappOpenWaUrl || "http://127.0.0.1:2785").replace(
      /\/$/,
      "",
    );
    base = base.replace("://localhost", "://127.0.0.1");
    const storedSession = s.whatsappOpenWaSessionId || process.env.WHATSAPP_OPENWA_SESSION_ID || "default";
    const key = s.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";

    console.log("OpenWA URL:", base);
    console.log("API key:", key ? "configurada" : "FALTA");
    console.log("Sesión configurada:", storedSession);

    const health = await fetchOpenWa(`${base}/api/health`, key, 10_000);
    if (!health.ok) {
      console.error("\n❌ OpenWA no responde en", base);
      console.error(" ", health.error || `HTTP ${health.status}`);
      console.error("\n→ docker ps | grep openwa");
      console.error(`→ curl -m 5 ${base}/api/health`);
      process.exit(1);
    }
    console.log("\n✓ /api/health OK");

    let sessionUuid;
    try {
      sessionUuid = await resolveSessionUuid(base, key, storedSession);
    } catch (err) {
      console.error("\n❌", err instanceof Error ? err.message : err);
      console.error("\n→ docker restart openwa-api");
      console.error("→ npm run openwa:restart-session");
      process.exit(1);
    }

    const session = await fetchOpenWa(
      `${base}/api/sessions/${encodeURIComponent(sessionUuid)}`,
      key,
    );
    if (!session.ok) {
      console.error("\n❌ No se pudo leer la sesión", sessionUuid);
      console.error(" ", session.error || `HTTP ${session.status}`);
      process.exit(1);
    }

    const status = String(session.data?.status ?? session.data?.state ?? "desconocido");
    const phone = session.data?.phone ?? session.data?.me?.user ?? "(sin teléfono)";
    console.log(`✓ Sesión ${sessionUuid.slice(0, 8)}… (${session.data?.name ?? "?"})`);
    console.log(`  Estado: ${status}`);
    console.log(`  Teléfono: ${phone}`);

    if (!READY.has(status)) {
      console.warn("\n⚠ WhatsApp NO vinculado. Pasos:");
      console.warn("  1. Abra http://192.168.1.112:3000 → Configuración → Canales");
      console.warn("  2. Generar QR y escanee con el teléfono del banco de sangre");
      console.warn("  3. Si sigue fallando: npm run openwa:restart-session");
      process.exit(1);
    }

    console.log("\n✓ Sesión lista para enviar y recibir mensajes");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
