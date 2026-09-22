import { prisma } from "./prisma";
import { endOfToday, startOfToday } from "./reminders";

export async function getWhatsappSentTodayCount() {
  const count = await prisma.reminderLog.count({
    where: {
      channel: "whatsapp",
      status: "enviado",
      sentAt: { gte: startOfToday(), lte: endOfToday() },
    },
  });
  return count;
}

export async function getWhatsappDailyRemaining(limit: number) {
  const sent = await getWhatsappSentTodayCount();
  return Math.max(0, limit - sent);
}

export async function assertWhatsappDailyLimit(limit: number, batchSize = 1) {
  const sent = await getWhatsappSentTodayCount();
  if (sent + batchSize > limit) {
    throw new Error(
      `Límite diario de WhatsApp alcanzado (${limit}/día). Enviados hoy: ${sent}.`,
    );
  }
  return { sent, remaining: limit - sent };
}
