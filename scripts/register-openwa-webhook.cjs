const { PrismaClient } = require("@prisma/client");

function resolveOpenWaWebhookUrl() {
  const explicit = process.env.OPENWA_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const port = process.env.PORT?.trim() || "3000";
  const path = "/api/webhooks/openwa";
  const openWaUrl = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").toLowerCase();
  const openWaOnLocalHost =
    openWaUrl.includes("localhost:2785") || openWaUrl.includes("127.0.0.1:2785");

  if (openWaOnLocalHost && (process.platform === "win32" || process.platform === "darwin")) {
    return `http://host.docker.internal:${port}${path}`;
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
  return `${base}${path}`;
}

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  const base = (s?.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
  const key = s?.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const sessionId = s?.whatsappOpenWaSessionId;
  const secret = s?.openwaWebhookSecret || process.env.OPENWA_WEBHOOK_SECRET || "";
  const webhookUrl = resolveOpenWaWebhookUrl();

  if (!key || !sessionId) {
    console.error("OpenWA no configurado (api key / session)");
    process.exit(1);
  }
  if (!secret || secret.length < 16) {
    console.error("OPENWA_WEBHOOK_SECRET debe tener al menos 16 caracteres");
    process.exit(1);
  }

  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  const listRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, { headers });
  const existing = await listRes.json().catch(() => []);
  console.log("webhook_url:", webhookUrl);
  console.log("webhooks_before:", Array.isArray(existing) ? existing.length : existing);

  if (Array.isArray(existing)) {
    const alreadyRegistered = existing.some(
      (hook) => hook.url === webhookUrl && hook.active !== false,
    );
    if (alreadyRegistered) {
      console.log("webhook_already_registered:", webhookUrl);
      await p.$disconnect();
      return;
    }

    for (const hook of existing) {
      const stale = hook.url?.includes("localhost:3000") || hook.url?.includes("127.0.0.1:3000");
      if (stale && hook.id) {
        const del = await fetch(
          `${base}/api/sessions/${encodeURIComponent(sessionId)}/webhooks/${encodeURIComponent(hook.id)}`,
          { method: "DELETE", headers },
        );
        console.log("deleted_webhook:", hook.url, del.status);
      }
    }
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
  console.log("register_status:", res.status, JSON.stringify(data).slice(0, 400));

  const after = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, { headers }).then((r) =>
    r.json().catch(() => []),
  );
  console.log("webhooks_after:", Array.isArray(after) ? after.length : after);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
