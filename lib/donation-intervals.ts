import type { DonationType, Gender } from "./constants";
import { addDays, addMonths, startOfDay } from "./dates";

export type ReminderIntervalSettings = {
  reminderDays: number;
  femaleWholeBloodMonths: number;
  femaleApheresisMonths: number;
  maleWholeBloodMonths: number;
  maleApheresisMonths: number;
};

export type DonorIntervalProfile = {
  gender?: string | null;
  donationType?: string | null;
};

export function normalizeGender(value: unknown): Gender | null {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return null;
  if (raw === "F" || raw === "FEMENINO" || raw === "MUJER" || raw === "FEMALE") return "F";
  if (raw === "M" || raw === "MASCULINO" || raw === "HOMBRE" || raw === "MALE") return "M";
  return null;
}

/** Códigos HUAV: A = aféresis; N/VRE/H y similares = sangre total. */
export function normalizeDonationType(value: unknown): DonationType {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "total";
  if (
    raw === "A" ||
    raw === "AFERESIS" ||
    raw.includes("AFER") ||
    raw === "PLAQUETAS" ||
    raw === "PLASMA"
  ) {
    return "aferesis";
  }
  return "total";
}

export function getApheresisReminderMonths(settings: ReminderIntervalSettings): number {
  return settings.femaleApheresisMonths;
}

export function getReminderMonthsForDonor(
  donor: DonorIntervalProfile,
  settings: ReminderIntervalSettings,
): number | null {
  if (normalizeDonationType(donor.donationType) === "aferesis") {
    return getApheresisReminderMonths(settings);
  }

  const gender = normalizeGender(donor.gender);
  if (!gender) return null;

  if (gender === "F") {
    return settings.femaleWholeBloodMonths;
  }
  return settings.maleWholeBloodMonths;
}

export function computeNextDonationDateForDonor(
  lastDonationDate: Date,
  donor: DonorIntervalProfile,
  settings: ReminderIntervalSettings,
): Date {
  const months = getReminderMonthsForDonor(donor, settings);
  if (months != null) {
    return addMonths(lastDonationDate, months);
  }
  return addDays(lastDonationDate, settings.reminderDays);
}

export function describeReminderInterval(
  donor: DonorIntervalProfile,
  settings: ReminderIntervalSettings,
): string {
  if (normalizeDonationType(donor.donationType) === "aferesis") {
    const months = getApheresisReminderMonths(settings);
    return months === 1 ? "1 mes (aféresis)" : `${months} meses (aféresis)`;
  }

  const months = getReminderMonthsForDonor(donor, settings);
  if (months != null) {
    return months === 1 ? "1 mes" : `${months} meses`;
  }
  return `${settings.reminderDays} días (respaldo)`;
}

export function isPastWaitPeriodForDonor(
  lastDonationDate: Date,
  donor: DonorIntervalProfile,
  settings: ReminderIntervalSettings,
  now = new Date(),
): boolean {
  const nextDate = computeNextDonationDateForDonor(lastDonationDate, donor, settings);
  return startOfDay(now).getTime() >= startOfDay(nextDate).getTime();
}

export function isExactReminderDayForDonor(
  lastDonationDate: Date,
  donor: DonorIntervalProfile,
  settings: ReminderIntervalSettings,
  now = new Date(),
): boolean {
  const nextDate = computeNextDonationDateForDonor(lastDonationDate, donor, settings);
  return startOfDay(now).getTime() === startOfDay(nextDate).getTime();
}

export function pickIntervalSettings(settings: {
  reminderDays: number;
  femaleWholeBloodMonths?: number | null;
  femaleApheresisMonths?: number | null;
  maleWholeBloodMonths?: number | null;
  maleApheresisMonths?: number | null;
}): ReminderIntervalSettings {
  return {
    reminderDays: settings.reminderDays,
    femaleWholeBloodMonths: settings.femaleWholeBloodMonths ?? 4,
    femaleApheresisMonths: settings.femaleApheresisMonths ?? 1,
    maleWholeBloodMonths: settings.maleWholeBloodMonths ?? 3,
    maleApheresisMonths: settings.maleApheresisMonths ?? 1,
  };
}
