export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = startOfDay(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.floor(ms / 86_400_000);
}

export function computeNextDonationDate(lastDonationDate: Date, reminderDays: number) {
  return addDays(lastDonationDate, reminderDays);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toDateInputValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfDay(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return startOfDay(utc);
    }
    const fromMillis = new Date(value);
    if (!Number.isNaN(fromMillis.getTime())) return startOfDay(fromMillis);
  }

  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const parsed = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  }

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return startOfDay(fallback);
  return null;
}
