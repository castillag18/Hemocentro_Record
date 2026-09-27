const { loadEnv } = require("./load-env.cjs");
loadEnv();

const STALE = "1e04954c-6722-487e-b418-44f563a925cd";

async function main() {
  const { ensureOpenWaQr } = await import("../lib/openwa.ts");
  const result = await ensureOpenWaQr({
    baseUrl: process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785",
    apiKey: process.env.WHATSAPP_OPENWA_API_KEY || "",
    sessionId: STALE,
  });
  console.log(
    JSON.stringify(
      {
        status: result.status,
        hasQr: Boolean(result.qrSrc),
        qrLength: result.qrSrc?.length ?? 0,
        sessionUuid: result.sessionUuid,
        alreadyLinked: result.alreadyLinked,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
