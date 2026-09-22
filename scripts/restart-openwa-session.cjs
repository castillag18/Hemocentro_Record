/**
 * Reinicia la sesión OpenWA (stop + start).
 * Si los mensajes salientes quedan en status "failed", ejecute esto y vuelva a escanear el QR.
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  const base = (s?.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(
    /\/$/,
    "",
  );
  const key = s?.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const sessionId = s?.whatsappOpenWaSessionId;
  const headers = { "Content-Type": "application/json", "X-API-Key": key };

  if (!key || !sessionId) {
    console.error("OpenWA no configurado");
    process.exit(1);
  }

  const kill = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/force-kill`, {
    method: "POST",
    headers,
  });
  console.log("force-kill:", kill.status, (await kill.text()).slice(0, 200));

  await new Promise((r) => setTimeout(r, 5000));

  const start = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/start`, {
    method: "POST",
    headers,
  });
  console.log("start:", start.status, (await start.text()).slice(0, 200));
  console.log("\nVaya a Configuración → WhatsApp → Generar QR y escanee de nuevo.");

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
