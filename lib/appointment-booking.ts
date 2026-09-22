import { prisma } from "./prisma";
import { addDays } from "./dates";
import {
  addBogotaDays,
  buildBogotaSlot,
  HEMOCENTRO_TZ,
  slotTimesForDate,
  startOfBogotaDay,
} from "./hemocentro-hours";

export type OfferedSlot = {
  index: number;
  scheduledAt: string;
  label: string;
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function formatSlotLabel(date: Date) {
  const weekday = date.toLocaleDateString("es-CO", { weekday: "long", timeZone: HEMOCENTRO_TZ });
  const day = date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: HEMOCENTRO_TZ,
  });
  const time = date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: HEMOCENTRO_TZ,
  });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} — ${time}`;
}

async function getBusySlotStarts(from: Date, to: Date) {
  const appointments = await prisma.appointment.findMany({
    where: {
      status: "confirmada",
      scheduledAt: { gte: from, lte: to },
    },
    select: { scheduledAt: true },
  });
  return new Set(
    appointments.map((item) => {
      const d = new Date(item.scheduledAt);
      d.setSeconds(0, 0);
      return d.getTime();
    }),
  );
}

export async function generateAvailableSlots(options?: { count?: number; from?: Date }) {
  const count = options?.count ?? 5;
  const from = options?.from ?? new Date();
  const slots: OfferedSlot[] = [];
  let cursor = addBogotaDays(startOfBogotaDay(from), 1);
  const busy = await getBusySlotStarts(cursor, addDays(cursor, 30));

  while (slots.length < count) {
    const times = slotTimesForDate(cursor);
    for (const { hour, minute } of times) {
      const scheduledAt = buildBogotaSlot(cursor, hour, minute);
      if (scheduledAt.getTime() > Date.now() && !busy.has(scheduledAt.getTime())) {
        slots.push({
          index: slots.length + 1,
          scheduledAt: scheduledAt.toISOString(),
          label: formatSlotLabel(scheduledAt),
        });
        if (slots.length >= count) break;
      }
    }
    cursor = addBogotaDays(cursor, 1);
    if (slots.length === 0 && cursor.getTime() - from.getTime() > 60 * 86400000) break;
    if (slots.length > 0 && cursor.getTime() - from.getTime() > 45 * 86400000) break;
  }

  return slots;
}

export function parseSlotSelection(text: string, slots: OfferedSlot[]) {
  const normalized = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const numeric = normalized.match(/^(?:opcion\s*)?(\d+)$/);
  if (!numeric) return null;
  const index = Number(numeric[1]);
  return slots.find((slot) => slot.index === index) ?? null;
}

export function buildSlotSelectionMessage(options: {
  donorName: string;
  siteName: string;
  slots: OfferedSlot[];
}) {
  const lines = [
    `¡Perfecto, *${options.donorName}*! 🩸`,
    "",
    `Estas son las fechas disponibles para su cita en *${options.siteName}*:`,
    "",
    ...options.slots.map((slot) => `*${slot.index}.* ${slot.label}`),
    "",
    "Responda con el *número* de la opción que prefiera (ejemplo: *1*).",
  ];
  return lines.join("\n");
}

export function serializeSlots(slots: OfferedSlot[]) {
  return JSON.stringify(slots);
}

export function deserializeSlots(raw: string): OfferedSlot[] {
  try {
    const parsed = JSON.parse(raw) as OfferedSlot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getActiveBookingSession(donorId: string) {
  const now = new Date();
  const session = await prisma.whatsAppBookingSession.findFirst({
    where: {
      donorId,
      status: "active",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  return session;
}

export async function createBookingSession(options: {
  donorId: string;
  phone: string;
  slots: OfferedSlot[];
}) {
  const now = new Date();
  await prisma.whatsAppBookingSession.updateMany({
    where: { donorId: options.donorId, status: "active" },
    data: { status: "cancelled" },
  });

  return prisma.whatsAppBookingSession.create({
    data: {
      donorId: options.donorId,
      phone: options.phone,
      status: "active",
      slotsJson: serializeSlots(options.slots),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
}

export async function completeBookingSession(sessionId: string) {
  await prisma.whatsAppBookingSession.update({
    where: { id: sessionId },
    data: { status: "completed" },
  });
}
