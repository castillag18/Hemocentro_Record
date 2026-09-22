const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const secret = settings?.openwaWebhookSecret || process.env.OPENWA_WEBHOOK_SECRET || "";
  const base = (settings?.whatsappOpenWaUrl || "http://localhost:2785").replace(/\/$/, "");
  const key = settings?.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const sessionId = settings?.whatsappOpenWaSessionId;

  console.log(JSON.stringify({ hasSecret: Boolean(secret), hasApiKey: Boolean(key), sessionIdPrefix: String(sessionId).slice(0, 8) }));

  if (key && sessionId) {
    const headers = { "Content-Type": "application/json", "X-API-Key": key };
    const list = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, { headers })
      .then((r) => r.json().catch(() => ({})))
      .catch((e) => ({ error: e.message }));
    console.log("registered_webhooks:", JSON.stringify(list).slice(0, 500));
  }

  const donor = await p.donor.findFirst({
    where: { active: true, accepted: true, phone: { not: null } },
    select: { id: true, phone: true, name: true },
  });

  if (donor?.id) {
    await p.whatsAppBookingSession.updateMany({
      where: { donorId: donor.id, status: "active" },
      data: { status: "cancelled" },
    });
  }

  const phone = (donor?.phone || "573001234567").replace(/\D/g, "");
  const chatFrom = `${phone}@c.us`;
  const payload = {
    event: "message.received",
    timestamp: new Date().toISOString(),
    sessionId: "test",
    idempotencyKey: "test-key",
    deliveryId: "test-delivery",
    data: {
      from: chatFrom,
      chatId: chatFrom,
      body: "Si",
      type: "text",
      fromMe: false,
      isGroup: false,
    },
  };

  const raw = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const wrongHeader = await fetch(`${appUrl}/api/webhooks/openwa`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: raw,
  }).then(async (r) => ({ status: r.status, body: await r.text() }));

  const correctHeader = await fetch(`${appUrl}/api/webhooks/openwa`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OpenWA-Signature": signature },
    body: raw,
  }).then(async (r) => ({ status: r.status, body: await r.text() }));

  console.log("wrong_header_x-webhook-secret:", wrongHeader);
  console.log("correct_header_X-OpenWA-Signature:", correctHeader);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
