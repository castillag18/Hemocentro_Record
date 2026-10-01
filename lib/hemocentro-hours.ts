/** Horario operativo — HEMOCENTRO Y UNIDAD DE AFÉRESIS, Valledupar */
export const HEMOCENTRO_SITE = {
  name: "HEMOCENTRO Y UNIDAD DE AFÉRESIS",
  address: "Carrera 13 # 13c-39, Valledupar, Cesar",
  phone: "3182616448",
} as const;

export const HEMOCENTRO_TZ = "America/Bogota";

type SlotTime = { hour: number; minute: number };

/** Lunes a viernes: 7:30–12:00 y 14:00–17:00 */
const WEEKDAY_SLOTS: SlotTime[] = [
  { hour: 8, minute: 0 },
  { hour: 9, minute: 0 },
  { hour: 10, minute: 0 },
  { hour: 11, minute: 0 },
  { hour: 14, minute: 0 },
  { hour: 15, minute: 0 },
  { hour: 16, minute: 0 },
];

/** Sábado: 8:00–12:30 */
const SATURDAY_SLOTS: SlotTime[] = [
  { hour: 8, minute: 0 },
  { hour: 9, minute: 0 },
  { hour: 10, minute: 0 },
  { hour: 11, minute: 0 },
];

export function bogotaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HEMOCENTRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function bogotaWeekday(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: HEMOCENTRO_TZ,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? date.getDay();
}

/** Colombia no usa horario de verano; offset fijo UTC-5 */
export function buildBogotaSlot(baseDate: Date, hour: number, minute: number) {
  const { year, month, day } = bogotaDateParts(baseDate);
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));
}

export function slotTimesForDate(date: Date): SlotTime[] {
  const day = bogotaWeekday(date);
  if (day === 0) return [];
  if (day === 6) return SATURDAY_SLOTS;
  return WEEKDAY_SLOTS;
}

export function addBogotaDays(date: Date, days: number) {
  const next = new Date(date.getTime() + days * 86_400_000);
  return next;
}

export function startOfBogotaDay(date: Date) {
  const { year, month, day } = bogotaDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
}
