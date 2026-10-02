import fs from "fs";
import path from "path";
import type { Donor } from "@prisma/client";
import type { RowDataPacket } from "mysql2";
import { prisma } from "./prisma";
import { withHuavConnection } from "./huav-db";

export type HuavImportMode = "incremental" | "full";

export type HuavDonorPayload = {
  name: string;
  documentId: string;
  bloodType: string;
  donationType: string;
  gender: string | null;
  birthDate: Date | null;
  lastDonationDate: Date;
  phone: string | null;
  email: string | null;
  preferredChannel: string;
  accepted: boolean;
  active: boolean;
};

const MAPPING = {
  name: "Nombre Donante",
  documentId: "Identificación del donante",
  phone: "Móvil",
  email: "e-mail",
  lastDonationDate: "Fecha Donacion",
  bloodType: "Grupo",
  donationType: "Donación - clase",
  gender: "Genero",
  birthDate: "Fecha de nacimiento",
  accepted: "Aceptado",
} as const;

const PLACEHOLDER_EMAILS = new Set(["notiene@gmail.com", "no tiene", "sin correo", "n/a", "na"]);

const EXISTING_CHUNK = 400;
const CREATE_BATCH = 500;
const UPDATE_BATCH = 40;

function normalizeDonationType(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "total";
  if (raw === "A" || raw.includes("AFER")) return "aferesis";
  return "total";
}

function normalizeGender(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return null;
  if (raw === "F" || raw === "FEMENINO" || raw === "MUJER") return "F";
  if (raw === "M" || raw === "MASCULINO" || raw === "HOMBRE") return "M";
  return null;
}

function normalizeAccepted(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return true;
  if (raw === "no" || raw === "n" || raw === "0" || raw === "false") return false;
  return true;
}

function normalizePhone(phone: unknown) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return digits;
}

function normalizeBloodType(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const types = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
  return types.find((t) => t === raw) ?? null;
}

function parseDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameCalendarDay(a: Date | null, b: Date | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function deriveDocumentId(name: string, phone: unknown, email: string, fallback: unknown) {
  const explicit = String(fallback ?? "").trim();
  if (explicit) return explicit;
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) return `TEL-${normalizedPhone}`;
  const mail = String(email ?? "").trim().toLowerCase();
  if (mail && !PLACEHOLDER_EMAILS.has(mail)) return `EM-${mail}`;
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug ? `NOM-${slug}` : "";
}

function resolveImportMode(options?: { mode?: HuavImportMode }): HuavImportMode {
  if (options?.mode) return options.mode;
  const env = process.env.HUAV_IMPORT_MODE?.trim().toLowerCase();
  return env === "full" ? "full" : "incremental";
}

function lookbackDays() {
  const raw = Number(process.env.HUAV_IMPORT_LOOKBACK_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

export function loadDonantesSql(mode: HuavImportMode) {
  const defaultFile =
    mode === "full" ? "donantes_info.sql" : "donantes_info_nightly.sql";
  const envKey = mode === "full" ? "HUAV_DONORS_SQL" : "HUAV_DONORS_SQL_INCREMENTAL";
  const sqlPath =
    process.env[envKey]?.trim() || path.join(process.cwd(), defaultFile);
  if (!fs.existsSync(/* turbopackIgnore: true */ sqlPath)) {
    throw new Error(`No se encontró el archivo SQL: ${sqlPath}`);
  }
  let sql = fs.readFileSync(/* turbopackIgnore: true */ sqlPath, "utf8").trim();
  if (!sql.endsWith(";")) sql += ";";
  if (mode === "full") {
    sql = sql.replace(/\bLIMIT\s+\d+\b/gi, "");
  }
  sql = sql.replace(/\{\{LOOKBACK_DAYS\}\}/g, String(lookbackDays()));
  return { sql, sqlPath, mode };
}

type HuavRow = Record<string, unknown>;

export function mapRowsToDonors(rows: HuavRow[]) {
  const byId = new Map<string, HuavDonorPayload>();
  let skipped = 0;

  for (const row of rows) {
    const name = String(row[MAPPING.name] ?? "").trim();
    const phone = row[MAPPING.phone];
    const emailRaw = String(row[MAPPING.email] ?? "").trim();
    const email = PLACEHOLDER_EMAILS.has(emailRaw.toLowerCase()) ? "" : emailRaw;
    const bloodType = normalizeBloodType(row[MAPPING.bloodType]);
    const lastDonationDate = parseDate(row[MAPPING.lastDonationDate]);
    const birthDate = parseDate(row[MAPPING.birthDate]);
    const accepted = normalizeAccepted(row[MAPPING.accepted]);
    const documentId = deriveDocumentId(name, phone, email, row[MAPPING.documentId]);
    const donationType = normalizeDonationType(row[MAPPING.donationType]);
    const gender = normalizeGender(row[MAPPING.gender]);

    if (!name || !documentId || !bloodType || !lastDonationDate) {
      skipped += 1;
      continue;
    }

    const donor: HuavDonorPayload = {
      name,
      documentId,
      bloodType,
      donationType,
      gender,
      birthDate: birthDate ? startOfDay(birthDate) : null,
      lastDonationDate: startOfDay(lastDonationDate),
      phone: normalizePhone(phone),
      email: email || null,
      preferredChannel: "ambos",
      accepted,
      active: true,
    };

    const existing = byId.get(documentId);
    if (!existing || donor.lastDonationDate > existing.lastDonationDate) {
      byId.set(documentId, {
        ...donor,
        phone: donor.phone || existing?.phone || null,
        email: donor.email || existing?.email || null,
        gender: donor.gender || existing?.gender || null,
        birthDate: donor.birthDate || existing?.birthDate || null,
        donationType: donor.donationType || existing?.donationType || "total",
      });
    } else {
      existing.phone = existing.phone || donor.phone;
      existing.email = existing.email || donor.email;
      existing.gender = existing.gender || donor.gender;
      existing.birthDate = existing.birthDate || donor.birthDate;
    }
  }

  return { byId, skipped };
}

/** true si hay que escribir en BD (nuevo o datos distintos). */
export function huavDonorRecordChanged(existing: Donor, incoming: HuavDonorPayload): boolean {
  return !(
    existing.name === incoming.name &&
    existing.bloodType === incoming.bloodType &&
    (existing.gender ?? null) === (incoming.gender ?? null) &&
    existing.donationType === incoming.donationType &&
    sameCalendarDay(existing.birthDate, incoming.birthDate) &&
    sameCalendarDay(existing.lastDonationDate, incoming.lastDonationDate) &&
    (existing.phone ?? null) === (incoming.phone ?? null) &&
    (existing.email ?? null) === (incoming.email ?? null) &&
    existing.accepted === incoming.accepted &&
    existing.active === incoming.active &&
    existing.preferredChannel === incoming.preferredChannel
  );
}

async function loadExistingByDocumentIds(documentIds: string[]) {
  const map = new Map<string, Donor>();
  for (let i = 0; i < documentIds.length; i += EXISTING_CHUNK) {
    const chunk = documentIds.slice(i, i + EXISTING_CHUNK);
    const rows = await prisma.donor.findMany({
      where: { documentId: { in: chunk } },
    });
    for (const row of rows) map.set(row.documentId, row);
  }
  return map;
}

async function applyHuavDonorsToDatabase(byId: Map<string, HuavDonorPayload>) {
  const documentIds = Array.from(byId.keys());
  const existingByDocId = await loadExistingByDocumentIds(documentIds);

  const toCreate: HuavDonorPayload[] = [];
  const toUpdate: { id: string; data: HuavDonorPayload }[] = [];
  let unchanged = 0;

  for (const donor of byId.values()) {
    const existing = existingByDocId.get(donor.documentId);
    if (!existing) {
      toCreate.push(donor);
      continue;
    }
    if (huavDonorRecordChanged(existing, donor)) {
      toUpdate.push({ id: existing.id, data: donor });
    } else {
      unchanged += 1;
    }
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
    const batch = toCreate.slice(i, i + CREATE_BATCH);
    const result = await prisma.donor.createMany({
      data: batch,
      skipDuplicates: true,
    });
    created += result.count;
  }

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH);
    await prisma.$transaction(
      batch.map(({ id, data }) =>
        prisma.donor.update({
          where: { id },
          data,
        }),
      ),
    );
    updated += batch.length;
  }

  return { created, updated, unchanged };
}

export async function importDonorsFromHuav(options?: { mode?: HuavImportMode }) {
  const mode = resolveImportMode(options);
  const { sql, sqlPath } = loadDonantesSql(mode);

  const rows = await withHuavConnection(async (connection) => {
    const [result] = await connection.query<(HuavRow & RowDataPacket)[]>(sql);
    return result;
  });

  if (!rows) {
    throw new Error("Configure HUAV_DB_* en .env y verifique acceso a la BD huav");
  }

  const { byId, skipped } = mapRowsToDonors(rows);
  const { created, updated, unchanged } = await applyHuavDonorsToDatabase(byId);

  return {
    source: "huav" as const,
    mode,
    sqlFile: path.basename(sqlPath),
    rows: rows.length,
    unique: byId.size,
    created,
    updated,
    unchanged,
    skipped,
  };
}
