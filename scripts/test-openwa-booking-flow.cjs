const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

async function postWebhook(secret, payload) {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(`${appUrl}/api/webhooks/openwa`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OpenWA-Signature": signature },
    body: raw,
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const secret = settings?.openwaWebhookSecret || process.env.OPENWA_WEBHOOK_SECRET || "";
  const donor = await p.donor.findFirst({
    where: { active: true, accepted: true, phone: { not: null } },
    select: { id: true, phone: true },
  });

  if (!donor) {
    console.error("no donor");
    process.exit(1);
  }

  await p.whatsAppBookingSession.updateMany({
    where: { donorId: donor.id, status: "active" },
    data: { status: "cancelled" },
  });
  await p.appointment.updateMany({
    where: { donorId: donor.id, status: "confirmada", scheduledAt: { gte: new Date() } },
    data: { status: "cancelada" },
  });

  const phone = donor.phone.replace(/\D/g, "");
  const chatFrom = `${phone}@c.us`;

  function payload(body) {
    return {
      event: "message.received",
      timestamp: new Date().toISOString(),
      sessionId: "test",
      idempotencyKey: `test-${Date.now()}-${body}`,
      deliveryId: `dlv-${Date.now()}-${body}`,
      data: { from: chatFrom, chatId: chatFrom, body, type: "text", fromMe: false, isGroup: false },
    };
  }

  const step1 = await postWebhook(secret, payload("Si"));
  const step2 = await postWebhook(secret, payload("Si"));
  const step3 = await postWebhook(secret, payload("1"));

  console.log(JSON.stringify({ step1, step2, step3 }, null, 2));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
