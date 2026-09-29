import { createRequire } from "module";
import { getOpenWaFetchTimeoutMs } from "../lib/fetch-timeout";
import { pollOpenWaInbox } from "../lib/openwa-inbox-poll";
import { openWaHeaders } from "../lib/openwa-session";
import { getSettings } from "../lib/settings";
import { prisma } from "../lib/prisma";

const require = createRequire(import.meta.url);
require("./load-env.cjs").loadEnv();

async function preflightOpenWa(settings: Awaited<ReturnType<typeof getSettings>>) {
  const base = (settings.whatsappOpenWaUrl || "http://localhost:2785").replace(/\/$/, "");
  const apiKey = settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const timeoutMs = Math.min(getOpenWaFetchTimeoutMs(), 10_000);
  console.log("OpenWA URL:", base);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/health`, {
      headers: openWaHeaders(apiKey),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`preflight: /api/health HTTP ${res.status}`);
    } else {
      console.log("preflight: OpenWA responde OK");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`preflight: no se pudo contactar OpenWA (${msg})`);
    console.error("→ Revise: docker ps | grep -i openwa");
    console.error(`→ curl -m 5 ${base}/api/health`);
    console.error("→ Configuración → URL OpenWA debe ser http://localhost:2785 desde la VM");
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("mode: direct (BD + OpenWA, sin HTTP a la app)");
  const settings = await getSettings();
  await preflightOpenWa(settings);
  const result = await pollOpenWaInbox(settings);
  console.log(JSON.stringify(result, null, 2));
  if (result.error) {
    console.error("error:", result.error);
    const fatal = /no configurado|database|ECONNREFUSED|connect|tiempo de espera|timeout/i.test(
      result.error,
    );
    if (fatal) process.exit(1);
  }
  if ("warnings" in result && result.warnings?.length) {
    console.error("warnings:", result.warnings.join("; "));
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
