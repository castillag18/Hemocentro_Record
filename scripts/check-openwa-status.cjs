/**
 * Estado de OpenWA (health + sesión WhatsApp).
 * Uso: npm run openwa:check
 */
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");

const TIMEOUT_MS = Number(process.env.OPENWA_FETCH_TIMEOUT_MS) || 10_000;

async function fetchOpenWa(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const p = new PrismaClient();
  try {
    const s = await p.settings.findUnique({ where: { id: "default" } });
    if (!s) {
      console.error("❌ No hay Settings en la BD");
      process.exit(1);
    }

    const base = (s.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(
      /\/$/,
      "",
    );
    const uuid = s.whatsappOpenWaSessionId;
    const key = s.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
    const headers = { "Content-Type": "application/json" };
    if (key) headers["X-API-Key"] = key;

    console.log("OpenWA URL:", base);
    console.log("API key:", key ? "configurada" : "FALTA");

    const health = await fetchOpenWa(`${base}/api/health`, headers);
    if (!health.ok) {
      console.error("\n❌ OpenWA no responde en", base);
      console.error(" ", health.error || `HTTP ${health.status}`);
      console.error("\n→ docker ps | grep -i openwa");
      console.error(`→ curl -m 5 ${base}/api/health`);
      console.error("→ Si el contenedor está caído: docker start <contenedor-openwa>");
      process.exit(1);
    }
    console.log("\n✓ /api/health OK");

    if (uuid) {
      const session = await fetchOpenWa(`${base}/api/sessions/${encodeURIComponent(uuid)}`, headers);
      const status = session.data?.status ?? session.data?.state ?? "(desconocido)";
      const phone = session.data?.phone ?? "(sin teléfono)";
      console.log(`✓ Sesión ${uuid.slice(0, 8)}… estado: ${status}, tel: ${phone}`);
      if (status !== "ready" && status !== "CONNECTED" && status !== "connected") {
        console.warn("\n⚠ Sesión no está lista. Configuración → Generar QR y escanear.");
      }
    } else {
      console.warn("\n⚠ Sin whatsappOpenWaSessionId en Settings");
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
