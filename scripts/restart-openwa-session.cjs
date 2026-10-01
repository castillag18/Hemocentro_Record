/**
 * Reinicia la sesión OpenWA (force-kill solo si está activa + start).
 * Si el estado es «failed», no hace force-kill (OpenWA responde «not started»).
 */
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");
const { resolveSessionUuid, fetchOpenWa } = require("./openwa-http.cjs");

const ACTIVE = new Set([
  "ready",
  "initializing",
  "authenticating",
  "qr_ready",
  "connecting",
  "connected",
  "open",
]);

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

    const probe = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}`, key);
    const state = String(probe.data?.status ?? probe.data?.state ?? "unknown").toLowerCase();
    console.log("Estado antes:", state);

    if (ACTIVE.has(state)) {
      const kill = await fetchOpenWa(
        `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/force-kill`,
        key,
        30_000,
        { method: "POST" },
      );
      console.log("force-kill:", kill.status, JSON.stringify(kill.data).slice(0, 200));
      await new Promise((r) => setTimeout(r, 4000));
    } else {
      console.log("Omitiendo force-kill (sesión no activa — típico en «failed»).");
    }

    let startOk = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const start = await fetchOpenWa(
        `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/start`,
        key,
        90_000,
        { method: "POST" },
      );
      console.log(`start (intento ${attempt}):`, start.status, JSON.stringify(start.data).slice(0, 200));
      if (start.ok || start.status === 409) {
        startOk = true;
        break;
      }
      if (attempt < 2) {
        console.warn("Esperando 8 s antes de reintentar start…");
        await new Promise((r) => setTimeout(r, 8000));
      }
    }

    if (!startOk) {
      console.error("\n❌ OpenWA no pudo iniciar la sesión (error 500 u otro).");
      console.error("→ docker restart openwa-api");
      console.error("→ Espere 30 s → Configuración → Generar código QR");
      process.exit(1);
    }

    const status = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}`, key);
    const after = status.data?.status ?? status.data?.state ?? "?";
    console.log("Estado actual:", after);

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
