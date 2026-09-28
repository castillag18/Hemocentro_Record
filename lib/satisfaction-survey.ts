import { autoMessageDonorAsEligible } from "./auto-messages";
import { startOfBogotaDay } from "./hemocentro-hours";
import { findDonorsWithDonationOnDate } from "./huav-donations";
import { prisma } from "./prisma";

export function satisfactionReferenceKey(appointmentId: string) {
  return `satisfaction-appt-${appointmentId}`;
}

export async function getSatisfactionSurveyCandidates(today = new Date()) {
  const dayStart = startOfBogotaDay(today);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "confirmada",
      scheduledAt: { gte: dayStart, lt: dayEnd },
    },
    include: {
      donor: {
        select: {
          id: true,
          name: true,
          documentId: true,
          bloodType: true,
          lastDonationDate: true,
          phone: true,
          email: true,
          preferredChannel: true,
          active: true,
          accepted: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (!appointments.length) return [];

  const donorLookups = appointments.map((item) => ({
    documentId: item.donor.documentId,
    phone: item.donor.phone,
  }));

  const donatedToday = await findDonorsWithDonationOnDate(donorLookups, today);
  if (!donatedToday.size) return [];

  const eligible = appointments.filter(
    (item) =>
      item.donor.active &&
      item.donor.accepted &&
      item.donor.phone &&
      donatedToday.has(item.donor.documentId),
  );

  if (!eligible.length) return [];

  const sent = await prisma.reminderLog.findMany({
    where: {
      messageKind: "satisfaction",
      referenceKey: { in: eligible.map((item) => satisfactionReferenceKey(item.id)) },
      status: "enviado",
    },
    select: { referenceKey: true },
  });
  const sentKeys = new Set(sent.map((row) => row.referenceKey));

  return eligible
    .filter((item) => !sentKeys.has(satisfactionReferenceKey(item.id)))
    .map((item) => ({
      appointmentId: item.id,
      donor: autoMessageDonorAsEligible({
        id: item.donor.id,
        name: item.donor.name,
        documentId: item.donor.documentId,
        bloodType: item.donor.bloodType,
        lastDonationDate: item.donor.lastDonationDate,
        phone: item.donor.phone,
        email: item.donor.email,
        preferredChannel: item.donor.preferredChannel,
      }),
      referenceKey: satisfactionReferenceKey(item.id),
    }));
}
