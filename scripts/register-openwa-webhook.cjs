const { PrismaClient } = require("@prisma/client");

const WEBHOOK_PATH = "/api/webhooks/openwa";

function isPrivateHost(host) {
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "host.docker.internal") return false;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function isAllowedWebhookUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "host.docker.internal") return true;
    return !isPrivateHost(host);
  } catch {
    return false;
  }
}

function resolveCandidates() {
  const port = process.env.PORT?.trim() || "3000";
  const explicit = process.env.OPENWA_WEBHOOK_URL?.trim();
  const openWaUrl = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").toLowerCase();
  const openWaOnLocalHost =
    openWaUrl.includes("localhost:2785") || openWaUrl.includes("127.0.0.1:2785");

  const docker = [
    `http://host.docker.internal:${port}${WEBHOOK_PATH}`,
    `http://172.17.0.1:${port}${WEBHOOK_PATH}`,
  ];

  let list = [];
  if (explicit) {
    list = isAllowedWebhookUrl(explicit) ? [explicit] : [...docker.filter(isAllowedWebhookUrl), explicit];
  } else if (openWaOnLocalHost) {
    list = docker;
  } else {
    const base = (process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
    list = [`${base}${WEBHOOK_PATH}`];
  }

  const seen = new Set();
  return list.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

async function registerOne(base, sessionId, key, secret, webhookUrl, headers) {
  const listRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, { headers });
  const existing = await listRes.json().catch(() => []);
  if (Array.isArray(existing)) {
    const already = existing.some((hook) => hook.url === webhookUrl && hook.active !== false);
    if (already) return { ok: true, status: 200, data: { message: "already registered" }, webhookUrl };
  }

  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: webhookUrl,
      events: ["message.received"],
      secret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, webhookUrl };
}

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  const base = (s?.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
  const key = s?.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const sessionId = s?.whatsappOpenWaSessionId;
  const secret = s?.openwaWebhookSecret || process.env.OPENWA_WEBHOOK_SECRET || "";
  const candidates = resolveCandidates();

  if (!key || !sessionId) {
    console.error("OpenWA no configurado (api key / session)");
    process.exit(1);
  }
  if (!secret || secret.length < 16) {
    console.error("OPENWA_WEBHOOK_SECRET debe tener al menos 16 caracteres");
    process.exit(1);
  }

  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  console.log("webhook_candidates:", candidates.join(", "));

  for (const webhookUrl of candidates) {
    const result = await registerOne(base, sessionId, key, secret, webhookUrl, headers);
    console.log("try:", webhookUrl, "status:", result.status, JSON.stringify(result.data).slice(0, 200));
    if (result.ok) {
      console.log("webhook_registered:", webhookUrl);
      await p.$disconnect();
      return;
    }
  }

  console.error("No se pudo registrar webhook con ninguna URL. Use sondeo de bandeja o configure SSRF_ALLOWED_HOSTS en OpenWA.");
  await p.$disconnect();
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
