import { addDays, addMonths, daysBetween, endOfDay, isSameDay, startOfDay } from "./dates";
import {
  computeNextDonationDateForDonor,
  describeReminderInterval,
  isExactReminderDayForDonor,
  isPastWaitPeriodForDonor,
  pickIntervalSettings,
  type ReminderIntervalSettings,
} from "./donation-intervals";
import { Prisma } from "@prisma/client";
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

const DONOR_REMINDER_LOGS = {
  where: { messageKind: "reminder" as const },
  orderBy: { sentAt: "desc" as const },
  take: 12,
};

function buildDonorListWhere(options: { bloodType?: string; q?: string }) {
  const q = options.q?.trim() ?? "";
  return {
    active: true,
    accepted: true,
    ...(options.bloodType ? { bloodType: options.bloodType } : {}),
    ...(q.length >= 2
      ? {
          OR: [
            { name: { contains: q } },
            { documentId: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
}

function matchesReminderStatus(item: EligibleDonor, status: string) {
  if (status === "all") return true;
  if (status === "pendiente") {
    return item.reminderStatus === "pendiente" || item.reminderStatus === "fallido";
  }
  return item.reminderStatus === status;
}

/** Fechas de última donación que caen en «día exacto» de recordatorio hoy. */
export function exactReminderLastDonationRanges(
  settings: ReminderIntervalSettings,
  today = new Date(),
) {
  const day = startOfDay(today);
  const monthSteps = [
    settings.femaleWholeBloodMonths,
    settings.femaleApheresisMonths,
    settings.maleWholeBloodMonths,
    settings.maleApheresisMonths,
  ];

  const ranges: { gte: Date; lte: Date }[] = [
    {
      gte: startOfDay(addDays(day, -settings.reminderDays)),
      lte: endOfDay(addDays(day, -settings.reminderDays)),
    },
  ];

  for (const months of monthSteps) {
    const ref = addMonths(day, -months);
    ranges.push({ gte: startOfDay(ref), lte: endOfDay(ref) });
  }

  return ranges;
}

export type PaginatedEligibleResult = {
  reminderDays: number;
  eligible: EligibleDonor[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  totalExact: boolean;
};

/** Filtro por estado de recordatorio en SQL (evita escanear 100k+ filas en memoria). */
function reminderStatusSqlFilter(status: string): Prisma.Sql {
  const sentForCycle = Prisma.sql`EXISTS (
    SELECT 1 FROM ReminderLog r
    WHERE r.donorId = d.id
      AND r.messageKind = 'reminder'
      AND r.status = 'enviado'
      AND DATE(r.donationDateRef) = DATE(d.lastDonationDate)
  )`;
  const failedForCycle = Prisma.sql`EXISTS (
    SELECT 1 FROM ReminderLog r
    WHERE r.donorId = d.id
      AND r.messageKind = 'reminder'
      AND r.status = 'fallido'
      AND DATE(r.donationDateRef) = DATE(d.lastDonationDate)
  )`;

  if (status === "enviado") return Prisma.sql`AND ${sentForCycle}`;
  if (status === "fallido") return Prisma.sql`AND ${failedForCycle} AND NOT (${sentForCycle})`;
  if (status === "pendiente") return Prisma.sql`AND NOT (${sentForCycle})`;
  return Prisma.empty;
}

async function donorIdsByReminderSql(options: {
  status: string;
  bloodType?: string;
  minLastDonation: Date;
  skip: number;
  take: number;
}): Promise<string[]> {
  const blood = options.bloodType?.trim()
    ? Prisma.sql`AND d.bloodType = ${options.bloodType.trim()}`
    : Prisma.empty;
  const statusFilter = reminderStatusSqlFilter(options.status);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id
    FROM Donor d
    WHERE d.active = true
      AND d.accepted = true
      AND d.lastDonationDate <= ${options.minLastDonation}
      ${blood}
      ${statusFilter}
    ORDER BY d.lastDonationDate ASC
    LIMIT ${options.take}
    OFFSET ${options.skip}
  `;
  return rows.map((row) => row.id);
}

async function countDonorsByReminderSql(options: {
  status: string;
  bloodType?: string;
  minLastDonation: Date;
}): Promise<number> {
  const blood = options.bloodType?.trim()
    ? Prisma.sql`AND d.bloodType = ${options.bloodType.trim()}`
    : Prisma.empty;
  const statusFilter = reminderStatusSqlFilter(options.status);
  const rows = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*) AS cnt
    FROM Donor d
    WHERE d.active = true
      AND d.accepted = true
      AND d.lastDonationDate <= ${options.minLastDonation}
      ${blood}
      ${statusFilter}
  `;
  return Number(rows[0]?.cnt ?? 0);
}

async function loadEligibleFromDonorIds(
  ids: string[],
  intervalSettings: ReminderIntervalSettings,
  includeSent: boolean,
  status: string,
): Promise<EligibleDonor[]> {
  if (!ids.length) return [];
  const donors = await prisma.donor.findMany({
    where: { id: { in: ids } },
    include: { reminderLogs: DONOR_REMINDER_LOGS },
  });
  const byId = new Map(donors.map((donor) => [donor.id, donor]));
  const eligible: EligibleDonor[] = [];
  for (const id of ids) {
    const donor = byId.get(id);
    if (!donor) continue;
    const item = buildEligibleDonor(donor, intervalSettings, includeSent);
    if (item && matchesReminderStatus(item, status)) eligible.push(item);
  }
  return eligible;
}

/** Lista paginada sin cargar 100k donantes en memoria. */
export async function getEligibleDonorsPaginated(options: {
  page: number;
  pageSize: number;
  status?: string;
  bloodType?: string;
  q?: string;
  includeSent?: boolean;
}): Promise<PaginatedEligibleResult> {
  const intervalSettings = await getReminderIntervalSettings();
  const page = Math.max(1, options.page);
  const pageSize = Math.min(50, Math.max(5, options.pageSize));
  const status = options.status ?? "pendiente";
  const q = options.q?.trim() ?? "";
  const includeSent = Boolean(options.includeSent);
  const minLastDonation = addDays(startOfDay(new Date()), -21);

  const baseWhere = {
    ...buildDonorListWhere({ bloodType: options.bloodType, q }),
    lastDonationDate: { lte: minLastDonation },
  };

  if (q.length >= 2) {
    const [total, donors] = await Promise.all([
      prisma.donor.count({ where: baseWhere }),
      prisma.donor.findMany({
        where: baseWhere,
        orderBy: { lastDonationDate: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { reminderLogs: DONOR_REMINDER_LOGS },
      }),
    ]);

    const eligible = donors
      .map((donor) => buildEligibleDonor(donor, intervalSettings, includeSent))
      .filter((item): item is EligibleDonor => item !== null && matchesReminderStatus(item, status));

    return {
      reminderDays: intervalSettings.reminderDays,
      eligible,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      totalExact: true,
    };
  }

  const skip = (page - 1) * pageSize;
  const wantCount = pageSize + 1;

  if (status === "all") {
    const donors = await prisma.donor.findMany({
      where: baseWhere,
      orderBy: { lastDonationDate: "asc" },
      skip,
      take: wantCount + 4,
      include: { reminderLogs: DONOR_REMINDER_LOGS },
    });
    const pageItems = donors
      .map((donor) => buildEligibleDonor(donor, intervalSettings, true))
      .filter((item): item is EligibleDonor => item !== null && matchesReminderStatus(item, status));
    const hasMore = pageItems.length > pageSize;
    return {
      reminderDays: intervalSettings.reminderDays,
      eligible: pageItems.slice(0, pageSize),
      page,
      pageSize,
      total: hasMore ? skip + pageSize + 1 : skip + pageItems.length,
      hasMore,
      totalExact: false,
    };
  }

  const ids = await donorIdsByReminderSql({
    status,
    bloodType: options.bloodType,
    minLastDonation,
    skip,
    take: wantCount + 8,
  });
  const pageItems = await loadEligibleFromDonorIds(ids, intervalSettings, includeSent, status);
  const hasMore = pageItems.length > pageSize;

  let total = skip + Math.min(pageItems.length, pageSize);
  let totalExact = false;
  if (status === "enviado" || status === "fallido") {
    total = await countDonorsByReminderSql({
      status,
      bloodType: options.bloodType,
      minLastDonation,
    });
    totalExact = true;
  } else if (!hasMore) {
    total = skip + pageItems.length;
    totalExact = true;
  } else {
    total = skip + pageSize + 1;
  }

  return {
    reminderDays: intervalSettings.reminderDays,
    eligible: pageItems.slice(0, pageSize),
    page,
    pageSize,
    total,
    hasMore,
    totalExact,
  };
}

/** Vista previa del dashboard (solo unos pocos, sin escanear toda la BD). */
export async function getEligiblePreview(limit = 8) {
  const intervalSettings = await getReminderIntervalSettings();
  const minLastDonation = addDays(startOfDay(new Date()), -21);
  const donors = await prisma.donor.findMany({
    where: {
      active: true,
      accepted: true,
      lastDonationDate: { lte: minLastDonation },
    },
    orderBy: { lastDonationDate: "asc" },
    take: 150,
    include: { reminderLogs: DONOR_REMINDER_LOGS },
  });

  const eligible: EligibleDonor[] = [];
  for (const donor of donors) {
    const item = buildEligibleDonor(donor, intervalSettings, false);
    if (item && item.reminderStatus !== "enviado") eligible.push(item);
    if (eligible.length >= limit) break;
  }
  return eligible;
}

/** Conteo aproximado para tarjetas (sin cargar todos los registros). */
export async function estimatePendingReminderCount() {
  const minLastDonation = addDays(startOfDay(new Date()), -21);
  return prisma.donor.count({
    where: {
      active: true,
      accepted: true,
      lastDonationDate: { lte: minLastDonation },
    },
  });
}

export async function getDonorsForManualSend(donorIds: string[]) {
  if (!donorIds.length) return [];

  const intervalSettings = await getReminderIntervalSettings();
  const donors = await prisma.donor.findMany({
    where: { id: { in: donorIds }, active: true, accepted: true },
    include: { reminderLogs: DONOR_REMINDER_LOGS },
  });

  const byId = new Map<string, EligibleDonor>();
  for (const donor of donors) {
    const item = buildEligibleDonor(donor, intervalSettings, true);
    if (item) byId.set(donor.id, item);
  }

  return donorIds.map((id) => byId.get(id)).filter((d): d is EligibleDonor => Boolean(d));
}

/** @deprecated Prefer getEligibleDonorsPaginated para listas grandes. */
export async function getEligibleDonors(options?: { includeSent?: boolean }) {
  const result = await getEligibleDonorsPaginated({
    page: 1,
    pageSize: 500,
    status: "all",
    includeSent: options?.includeSent,
  });
  return {
    intervalSettings: await getReminderIntervalSettings(),
    reminderDays: result.reminderDays,
    eligible: result.eligible,
  };
}

export async function getAutoReminderDonors() {
  const intervalSettings = await getReminderIntervalSettings();
  const ranges = exactReminderLastDonationRanges(intervalSettings);
  const donors = await prisma.donor.findMany({
    where: {
      active: true,
      accepted: true,
      OR: ranges.map((range) => ({ lastDonationDate: range })),
    },
    include: { reminderLogs: DONOR_REMINDER_LOGS },
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
