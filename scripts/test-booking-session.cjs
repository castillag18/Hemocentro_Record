const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  try {
    const count = await p.whatsAppBookingSession.count();
    const created = await p.whatsAppBookingSession.create({
      data: {
        donorId: (await p.donor.findFirst({ select: { id: true } })).id,
        phone: "573000000000",
        status: "active",
        slotsJson: "[]",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await p.whatsAppBookingSession.delete({ where: { id: created.id } });
    console.log("booking_session_ok", count);
  } catch (e) {
    console.error("booking_session_fail", e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
}

main();
