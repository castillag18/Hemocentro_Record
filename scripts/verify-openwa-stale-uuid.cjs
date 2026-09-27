/**
 * Verifica recuperación ante UUID obsoleto (mismo error del QR).
 */
const { loadEnv } = require("./load-env.cjs");
loadEnv();

const STALE = "1e04954c-6722-487e-b418-44f563a925cd";

async function main() {
  const mod = await import("../lib/openwa-session.ts");
  const baseUrl = process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785";
  const apiKey = process.env.WHATSAPP_OPENWA_API_KEY || "";
  if (!apiKey) {
    console.error("Falta WHATSAPP_OPENWA_API_KEY");
    process.exit(1);
  }

  const uuid = await mod.resolveOpenWaSessionUuid({
    baseUrl,
    apiKey,
    sessionId: STALE,
  });

  console.log("Stale UUID input:", STALE);
  console.log("Resolved UUID:", uuid);

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/sessions/${encodeURIComponent(uuid)}`, {
    headers: { "X-API-Key": apiKey },
  });
  const data = await res.json().catch(() => ({}));
  console.log("Session check:", res.status, data.name ?? data.message ?? data.error);

  if (!res.ok) {
    process.exit(1);
  }
  console.log("\nOK — sesión recuperada; puede generar QR.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
