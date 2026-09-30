import { createRequire } from "module";
import { debugOpenWaLog } from "../lib/debug-openwa-log";
import { getOpenWaFetchTimeoutMs } from "../lib/fetch-timeout";
import { pollOpenWaInbox } from "../lib/openwa-inbox-poll";
import { openWaHeaders, resolveOpenWaSessionUuid } from "../lib/openwa-session";
import { getSettings } from "../lib/settings";
import { prisma } from "../lib/prisma";

const READY = new Set(["ready", "CONNECTED", "connected", "open"]);

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

  const ctx = {
    baseUrl: settings.whatsappOpenWaUrl,
    apiKey: settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "",
    sessionId: settings.whatsappOpenWaSessionId,
  };

  let sessionUuid: string;
  try {
    sessionUuid = await resolveOpenWaSessionUuid(ctx);
    console.log("preflight: sesión UUID", sessionUuid.slice(0, 8) + "…");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`preflight: no se pudo resolver sesión OpenWA (${msg})`);
    console.error("→ docker restart openwa-api");
    console.error("→ npm run openwa:restart-session");
    process.exit(1);
  }

  const sessionController = new AbortController();
  const sessionTimer = setTimeout(() => sessionController.abort(), timeoutMs);
  try {
    const sessionRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}`, {
      headers: openWaHeaders(apiKey),
      signal: sessionController.signal,
    });
    const sessionData = (await sessionRes.json().catch(() => ({}))) as {
      status?: string;
      state?: string;
      phone?: string | null;
    };
    const status = String(sessionData.status ?? sessionData.state ?? "desconocido");
    console.log("preflight: estado sesión:", status);
    debugOpenWaLog(
      "run-openwa-inbox-poll-direct.ts:preflight",
      "session preflight",
      {
        status,
        uuid: sessionUuid.slice(0, 8),
        ready: READY.has(status),
        cwd: process.cwd(),
      },
      "H1",
    );
    if (!READY.has(status)) {
      console.error(`\n❌ Sesión OpenWA en estado «${status}» (se requiere «ready»).`);
      console.error("→ docker restart openwa-api");
      console.error("→ npm run openwa:restart-session");
      console.error("→ Configuración → Canales → Generar QR y escanear");
      console.error("→ npm run openwa:check");
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`preflight: timeout al leer sesión (${msg})`);
    console.error("→ docker restart openwa-api");
    process.exit(1);
  } finally {
    clearTimeout(sessionTimer);
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
