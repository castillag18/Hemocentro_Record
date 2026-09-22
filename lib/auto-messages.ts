import {
  DEFAULT_SPECIAL_DATES,
  type SpecialDateEntry,
  type TemplateKind,
} from "./constants";
import { startOfDay } from "./dates";
import { prisma } from "./prisma";

export type AutoMessageDonor = {
  id: string;
  name: string;
  documentId: string;
  bloodType: string;
  lastDonationDate: Date;
  phone: string | null;
  email: string | null;
  preferredChannel: string;
  nextDonationDate?: Date;
};

export function parseSpecialDates(json: string | null | undefined): SpecialDateEntry[] {
  if (!json) return DEFAULT_SPECIAL_DATES;
  try {
    const parsed = JSON.parse(json) as SpecialDateEntry[];
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_SPECIAL_DATES;
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.month) &&
        Number.isFinite(item.day),
    );
  } catch {
    return DEFAULT_SPECIAL_DATES;
  }
}

export function getTodaySpecialDates(dates: SpecialDateEntry[], today = new Date()) {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return dates.filter((entry) => entry.month === month && entry.day === day);
}

export function birthdayReferenceKey(year = new Date().getFullYear()) {
  return `birthday-${year}`;
}

export function specialReferenceKey(specialId: string, year = new Date().getFullYear()) {
  return `special-${specialId}-${year}`;
}

async function filterNotYetSent(
  donors: AutoMessageDonor[],
  messageKind: TemplateKind,
  referenceKey: string,
) {
  if (!donors.length) return [];

  const sent = await prisma.reminderLog.findMany({
    where: {
      donorId: { in: donors.map((d) => d.id) },
      messageKind,
      referenceKey,
      status: "enviado",
    },
    select: { donorId: true },
  });
  const sentIds = new Set(sent.map((row) => row.donorId));
  return donors.filter((donor) => !sentIds.has(donor.id));
}

export async function getBirthdayDonorsToday(today = new Date()) {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const referenceKey = birthdayReferenceKey(today.getFullYear());

  const donors = await prisma.donor.findMany({
    where: {
      active: true,
      accepted: true,
      birthDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      documentId: true,
      bloodType: true,
      lastDonationDate: true,
      phone: true,
      email: true,
      preferredChannel: true,
      birthDate: true,
    },
  });

  const birthdayDonors = donors.filter((donor) => {
    if (!donor.birthDate) return false;
    return donor.birthDate.getMonth() + 1 === month && donor.birthDate.getDate() === day;
  });

  return filterNotYetSent(
    birthdayDonors.map((donor) => ({
      id: donor.id,
      name: donor.name,
      documentId: donor.documentId,
      bloodType: donor.bloodType,
      lastDonationDate: donor.lastDonationDate,
      phone: donor.phone,
      email: donor.email,
      preferredChannel: donor.preferredChannel,
    })),
    "birthday",
    referenceKey,
  );
}

export async function getSpecialDateDonorsToday(
  specialDatesJson: string | null | undefined,
  today = new Date(),
) {
  const matches = getTodaySpecialDates(parseSpecialDates(specialDatesJson), today);
  if (!matches.length) return [];

  const donors = await prisma.donor.findMany({
    where: { active: true, accepted: true },
    select: {
      id: true,
      name: true,
      documentId: true,
      bloodType: true,
      lastDonationDate: true,
      phone: true,
      email: true,
      preferredChannel: true,
    },
  });

  const batches: Array<{ special: SpecialDateEntry; donors: AutoMessageDonor[] }> = [];
  for (const special of matches) {
    const referenceKey = specialReferenceKey(special.id, today.getFullYear());
    const pending = await filterNotYetSent(donors, "special", referenceKey);
    if (pending.length) {
      batches.push({ special, donors: pending });
    }
  }
  return batches;
}

export function autoMessageDonorAsEligible(donor: AutoMessageDonor) {
  return {
    ...donor,
    gender: null,
    donationType: "total",
    nextDonationDate: donor.nextDonationDate ?? donor.lastDonationDate,
    daysPassed: 0,
    reminderIntervalLabel: "",
    accepted: true,
    reminderStatus: "pendiente" as const,
  };
}

export function donationDateRefForAutoMessage(kind: TemplateKind, today = new Date()) {
  return startOfDay(today);
}
