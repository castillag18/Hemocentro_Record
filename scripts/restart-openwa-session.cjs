/**
 * Reinicia la sesión OpenWA (force-kill + start).
 * Si el estado es «failed», escanee el QR de nuevo después.
 */
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");
const { resolveSessionUuid, fetchOpenWa } = require("./openwa-http.cjs");

async function main() {
  const p = new PrismaClient();
  try {
    const s = await p.settings.findUnique({ where: { id: "default" } });
    const base = (s?.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(
      /\/$/,
      "",
    );
    const key = s?.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
    const storedSession = s?.whatsappOpenWaSessionId || process.env.WHATSAPP_OPENWA_SESSION_ID || "default";

    if (!key) {
      console.error("❌ Falta WHATSAPP_OPENWA_API_KEY en .env / Settings");
      process.exit(1);
    }

    let sessionUuid;
    try {
      sessionUuid = await resolveSessionUuid(base, key, storedSession);
    } catch (err) {
      console.error("❌", err instanceof Error ? err.message : err);
      process.exit(1);
    }

    console.log("Sesión UUID:", sessionUuid);

    const kill = await fetchOpenWa(
      `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/force-kill`,
      key,
      30_000,
      { method: "POST" },
    );
    console.log("force-kill:", kill.status, JSON.stringify(kill.data).slice(0, 200));
    if (!kill.ok && kill.status !== 404) {
      console.warn("force-kill no OK — continúa con start si la sesión quedó colgada");
    }

    await new Promise((r) => setTimeout(r, 5000));

    const start = await fetchOpenWa(
      `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/start`,
      key,
      60_000,
      { method: "POST" },
    );
    console.log("start:", start.status, JSON.stringify(start.data).slice(0, 200));

    const status = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}`, key);
    const state = status.data?.status ?? status.data?.state ?? "?";
    console.log("Estado actual:", state);

    console.log("\n→ Configuración → Canales → Generar QR y escanear con WhatsApp");
    console.log("→ Luego: npm run openwa:check");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
