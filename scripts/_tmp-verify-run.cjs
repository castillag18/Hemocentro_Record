const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  const base = s.whatsappOpenWaUrl.replace(/\/$/, "");
  const uuid = s.whatsappOpenWaSessionId;
  const key = s.whatsappOpenWaApiKey;
  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  const phone = "573042478186";

  const send = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}/messages/send-text`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chatId: `${phone}@c.us`, text: `Verificacion envio ${Date.now()}` }),
  });

  await new Promise((r) => setTimeout(r, 2500));

  const messages = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}/messages?limit=20`, {
    headers,
  }).then((r) => r.json());

  const outgoing = (messages.messages || []).filter((m) => m.direction === "outgoing");
  const byStatus = outgoing.reduce((acc, m) => {
    acc[m.status || "unknown"] = (acc[m.status || "unknown"] || 0) + 1;
    return acc;
  }, {});

  const donor = await p.donor.findFirst({
    where: { name: { contains: "Orlando Castilla" } },
    select: { id: true },
  });
  const appt = donor
    ? await p.appointment.findFirst({
        where: { donorId: donor.id, status: "confirmada" },
        orderBy: { scheduledAt: "desc" },
      })
    : null;
  const session = donor
    ? await p.whatsAppBookingSession.findFirst({
        where: { donorId: donor.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  console.log(
    JSON.stringify(
      {
        sendHttpStatus: send.status,
        sendBody: (await send.text()).slice(0, 120),
        outgoingByStatus: byStatus,
        recentOutgoing: outgoing.slice(0, 5).map((m) => ({
          status: m.status,
          chatId: m.chatId,
          body: String(m.body || "").slice(0, 60),
        })),
        latestAppointment: appt
          ? { scheduledAt: appt.scheduledAt, status: appt.status, source: appt.source }
          : null,
        latestBookingSession: session ? { status: session.status, createdAt: session.createdAt } : null,
      },
      null,
      2,
    ),
  );

  await p.$disconnect();
}

main().catch(console.error);
