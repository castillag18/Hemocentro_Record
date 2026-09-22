import { daysBetween, isSameDay } from "./dates";
import {
  computeNextDonationDateForDonor,
  describeReminderInterval,
  isExactReminderDayForDonor,
  isPastWaitPeriodForDonor,
  pickIntervalSettings,
  type ReminderIntervalSettings,
} from "./donation-intervals";
import { prisma } from "./prisma";

export { computeNextDonationDateForDonor as computeNextDonationDate } from "./donation-intervals";

export type EligibleDonor = {
  id: string;
  name: string;
  documentId: string;
  bloodType: string;
  gender: string | null;
  donationType: string;
  lastDonationDate: Date;
  nextDonationDate: Date;
  daysPassed: number;
  reminderIntervalLabel: string;
  phone: string | null;
  email: string | null;
  preferredChannel: string;
  accepted: boolean;
  reminderStatus: "pendiente" | "enviado" | "fallido";
};

export async function getReminderIntervalSettings(): Promise<ReminderIntervalSettings> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  return pickIntervalSettings({
    reminderDays: settings?.reminderDays ?? 90,
    femaleWholeBloodMonths: settings?.femaleWholeBloodMonths,
    femaleApheresisMonths: settings?.femaleApheresisMonths,
    maleWholeBloodMonths: settings?.maleWholeBloodMonths,
    maleApheresisMonths: settings?.maleApheresisMonths,
  });
}

/** @deprecated Use getReminderIntervalSettings() */
export async function getReminderDays() {
  const settings = await getReminderIntervalSettings();
  return settings.reminderDays;
}

export { isPastWaitPeriodForDonor as isPastWaitPeriod } from "./donation-intervals";

function deriveReminderStatus(
  logs: { channel: string; status: string }[],
  preferredChannel: string,
): EligibleDonor["reminderStatus"] {
  const whatsappSent = logs.some((log) => log.channel === "whatsapp" && log.status === "enviado");
  const emailSent = logs.some((log) => log.channel === "email" && log.status === "enviado");
  const whatsappFailed = logs.some((log) => log.channel === "whatsapp" && log.status === "fallido");
  const emailFailed = logs.some((log) => log.channel === "email" && log.status === "fallido");

  if (preferredChannel === "whatsapp") {
    if (whatsappSent) return "enviado";
    if (whatsappFailed) return "fallido";
    return "pendiente";
  }

  if (preferredChannel === "email") {
    if (emailSent) return "enviado";
    if (emailFailed) return "fallido";
    return "pendiente";
  }

  if (whatsappSent || emailSent) return "enviado";
  if (whatsappFailed && emailFailed) return "fallido";
  if (whatsappFailed || emailFailed) return "fallido";
  return "pendiente";
}

function buildEligibleDonor(
  donor: {
    id: string;
    name: string;
    documentId: string;
    bloodType: string;
    gender: string | null;
    donationType: string;
    lastDonationDate: Date;
    phone: string | null;
    email: string | null;
    preferredChannel: string;
    accepted: boolean;
    reminderLogs: {
      status: string;
      channel: string;
      messageKind?: string;
      donationDateRef: Date;
      sentAt: Date;
    }[];
  },
  intervalSettings: ReminderIntervalSettings,
  includeSent: boolean,
): EligibleDonor | null {
  if (!donor.accepted) return null;
  if (!isPastWaitPeriodForDonor(donor.lastDonationDate, donor, intervalSettings)) return null;

  const logsForDonation = donor.reminderLogs.filter(
    (log) =>
      isSameDay(log.donationDateRef, donor.lastDonationDate) &&
      (log.messageKind === "reminder" || !log.messageKind),
  );
  const hasSent = logsForDonation.some((log) => log.status === "enviado");

  if (hasSent && !includeSent) return null;

  const reminderStatus = deriveReminderStatus(logsForDonation, donor.preferredChannel);
  const nextDonationDate = computeNextDonationDateForDonor(
    donor.lastDonationDate,
    donor,
    intervalSettings,
  );

  return {
    id: donor.id,
    name: donor.name,
    documentId: donor.documentId,
    bloodType: donor.bloodType,
    gender: donor.gender,
    donationType: donor.donationType,
    lastDonationDate: donor.lastDonationDate,
    nextDonationDate,
    daysPassed: daysBetween(donor.lastDonationDate),
    reminderIntervalLabel: describeReminderInterval(donor, intervalSettings),
    phone: donor.phone,
    email: donor.email,
    preferredChannel: donor.preferredChannel,
    accepted: donor.accepted,
    reminderStatus,
  };
}

export async function getDonorsForManualSend(donorIds: string[]) {
  if (!donorIds.length) return [];

  const intervalSettings = await getReminderIntervalSettings();
  const donors = await prisma.donor.findMany({
    where: { id: { in: donorIds }, active: true, accepted: true },
    include: {
      reminderLogs: { orderBy: { sentAt: "desc" } },
    },
  });

  const byId = new Map<string, EligibleDonor>();
  for (const donor of donors) {
    const item = buildEligibleDonor(donor, intervalSettings, true);
    if (item) byId.set(donor.id, item);
  }

  return donorIds.map((id) => byId.get(id)).filter((d): d is EligibleDonor => Boolean(d));
}

export async function getEligibleDonors(options?: { includeSent?: boolean }) {
  const intervalSettings = await getReminderIntervalSettings();
  const donors = await prisma.donor.findMany({
    where: { active: true, accepted: true },
    include: {
      reminderLogs: { orderBy: { sentAt: "desc" } },
    },
    orderBy: { lastDonationDate: "asc" },
  });

  const eligible: EligibleDonor[] = [];
  for (const donor of donors) {
    const item = buildEligibleDonor(donor, intervalSettings, Boolean(options?.includeSent));
    if (item) eligible.push(item);
  }

  return { intervalSettings, reminderDays: intervalSettings.reminderDays, eligible };
}

export async function getAutoReminderDonors() {
  const intervalSettings = await getReminderIntervalSettings();
  const donors = await prisma.donor.findMany({
    where: { active: true, accepted: true },
    include: {
      reminderLogs: { orderBy: { sentAt: "desc" } },
    },
    orderBy: { lastDonationDate: "asc" },
  });

  const eligible: EligibleDonor[] = [];
  for (const donor of donors) {
    if (!isExactReminderDayForDonor(donor.lastDonationDate, donor, intervalSettings)) continue;
    const item = buildEligibleDonor(donor, intervalSettings, false);
    if (item && item.reminderStatus === "pendiente") eligible.push(item);
  }

  return { intervalSettings, reminderDays: intervalSettings.reminderDays, eligible };
}

export function serializeEligible(donor: EligibleDonor) {
  return {
    ...donor,
    lastDonationDate: donor.lastDonationDate.toISOString(),
    nextDonationDate: donor.nextDonationDate.toISOString(),
  };
}
