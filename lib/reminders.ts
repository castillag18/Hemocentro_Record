import { computeNextDonationDate, daysBetween, startOfDay } from "./dates";

export function isPastWaitPeriod(lastDonationDate: Date, reminderDays: number, now = new Date()) {
  return startOfDay(now).getTime() >= computeNextDonationDate(lastDonationDate, reminderDays).getTime();
}

export function isExactReminderDay(
  lastDonationDate: Date,
  reminderDays: number,
  now = new Date(),
) {
  return daysBetween(lastDonationDate, now) === reminderDays;
}

export function isAffirmativeReply(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return false;
  if (normalized === "si" || normalized === "s" || normalized === "yes") return true;
  const patterns = [
    /^si\b/,
    /^yes\b/,
    /^ok\b/,
    /^dale\b/,
    /^claro\b/,
    /^confirmo\b/,
    /^agendar\b/,
    /^me gustaria\b/,
    /^quiero agendar\b/,
    /^por supuesto\b/,
    /^de acuerdo\b/,
    /^listo\b/,
    /^bueno\b/,
    /^vale\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export function normalizeAccepted(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return false;
  return raw === "si" || raw === "yes" || raw === "s" || raw === "1" || raw === "true";
}

export function nextAppointmentSlot(from = new Date()): Date {
  const slot = new Date(from);
  slot.setDate(slot.getDate() + 1);
  slot.setHours(9, 0, 0, 0);
  while (slot.getDay() === 0 || slot.getDay() === 6) {
    slot.setDate(slot.getDate() + 1);
  }
  return slot;
}

export function startOfToday() {
  return startOfDay(new Date());
}

export function endOfToday() {
  const d = startOfDay(new Date());
  d.setHours(23, 59, 59, 999);
  return d;
}
