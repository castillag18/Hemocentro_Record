import { BLOOD_TYPES, CHANNELS, type BloodType, type PreferredChannel } from "./constants";
import { normalizeDonationType, normalizeGender } from "./donation-intervals";
import { normalizeAccepted } from "./reminders";
import { parseFlexibleDate } from "./dates";
import { normalizePhone } from "./whatsapp";

const PLACEHOLDER_EMAILS = new Set([
  "notiene@gmail.com",
  "no tiene",
  "sin correo",
  "n/a",
  "na",
  "none",
]);

const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    "nombre",
    "name",
    "donante",
    "nombre completo",
    "nombres",
    "apellido",
    "nombre donante",
  ],
  documentId: [
    "cedula",
    "cédula",
    "documento",
    "identificacion",
    "identificación",
    "dni",
    "cc",
    "documento de identidad",
    "donación_1",
    "donacion_1",
    "num",
  ],
  bloodType: [
    "grupo",
    "sangre",
    "tipo",
    "blood",
    "grupo sanguineo",
    "grupo sanguíneo",
    "rh",
    "tipo de sangre",
  ],
  lastDonationDate: [
    "fecha donacion",
    "fecha donación",
    "fecha de donacion",
    "fecha de donación",
    "ultima donacion",
    "última donación",
    "last donation",
  ],
  gender: ["sexo", "genero", "género", "gender"],
  donationType: [
    "tipo donacion",
    "tipo donación",
    "tipo de donacion",
    "tipo de donación",
    "donacion tipo",
    "donación tipo",
  ],
  phone: [
    "telefono",
    "teléfono",
    "celular",
    "whatsapp",
    "movil",
    "móvil",
    "mobile",
    "phone",
    "contacto",
    "trabajo",
    "casa",
  ],
  email: ["email", "correo", "mail", "correo electronico", "correo electrónico", "e-mail"],
  preferredChannel: ["canal", "medio", "channel", "preferencia", "canal preferido"],
  accepted: ["aceptado", "accepted", "apto", "habilitado"],
};

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function autoMapColumns(headers: string[]) {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const normalized = normalizeHeader(header);
      return aliases.some((alias) => {
        const a = normalizeHeader(alias);
        return normalized === a || normalized.includes(a);
      });
    });
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }

  if (!mapping.phone) {
    const mobile = headers.find((header) => normalizeHeader(header) === "movil");
    if (mobile) mapping.phone = mobile;
  }

  return mapping;
}

export function isPlaceholderEmail(value: string | null | undefined) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return !normalized || PLACEHOLDER_EMAILS.has(normalized);
}

export function deriveDocumentId(
  name: string,
  phone?: string | null,
  email?: string | null,
  fallback?: string | null,
) {
  const explicit = fallback?.trim();
  if (explicit) return explicit;

  const normalizedPhone = normalizePhone(phone ?? undefined);
  if (normalizedPhone) return `TEL-${normalizedPhone}`;

  if (email && !isPlaceholderEmail(email)) {
    return `EM-${email.trim().toLowerCase()}`;
  }

  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug ? `NOM-${slug}` : "";
}

export function normalizeBloodType(value: unknown): BloodType | null {
  if (value == null) return null;
  const raw = String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace("POSITIVO", "+")
    .replace("NEGATIVO", "-")
    .replace("POS", "+")
    .replace("NEG", "-");

  const compact = raw.replace("RH", "");
  const found = BLOOD_TYPES.find((type) => type === compact);
  return found ?? null;
}

export function normalizeChannel(value: unknown): PreferredChannel {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (raw.includes("whats") || raw.includes("wa") || raw === "wpp") return "whatsapp";
  if (raw.includes("mail") || raw.includes("correo")) return "email";
  if (CHANNELS.includes(raw as PreferredChannel)) return raw as PreferredChannel;
  return "ambos";
}

export type ImportDonorRow = {
  name: string;
  documentId: string;
  bloodType: BloodType;
  gender?: string | null;
  donationType?: string;
  lastDonationDate: Date;
  phone?: string | null;
  email?: string | null;
  preferredChannel?: PreferredChannel;
  accepted: boolean;
};

export function mapRowToDonor(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): { donor: ImportDonorRow } | { error: string } {
  const name = String(row[mapping.name] ?? "").trim();
  const mappedDocument = mapping.documentId ? String(row[mapping.documentId] ?? "").trim() : "";
  const phoneRaw = mapping.phone ? String(row[mapping.phone] ?? "").trim() : "";
  const emailRaw = mapping.email ? String(row[mapping.email] ?? "").trim() : "";
  const email = isPlaceholderEmail(emailRaw) ? "" : emailRaw;
  const documentId = deriveDocumentId(name, phoneRaw, email, mappedDocument);
  const bloodType = normalizeBloodType(row[mapping.bloodType]);
  const lastDonationDate = parseFlexibleDate(row[mapping.lastDonationDate]);
  const preferredChannel = normalizeChannel(
    mapping.preferredChannel ? row[mapping.preferredChannel] : "ambos",
  );
  const accepted = mapping.accepted
    ? normalizeAccepted(row[mapping.accepted])
    : true;
  const gender = mapping.gender ? normalizeGender(row[mapping.gender]) : null;
  const donationType = mapping.donationType
    ? normalizeDonationType(row[mapping.donationType])
    : "total";

  if (!name) return { error: "Nombre vacío" };
  if (!documentId) return { error: "No se pudo generar identificador del donante" };
  if (!bloodType) return { error: "Grupo sanguíneo inválido" };
  if (!lastDonationDate) return { error: "Fecha de donación inválida" };

  return {
    donor: {
      name,
      documentId,
      bloodType,
      gender,
      donationType,
      lastDonationDate,
      phone: phoneRaw || null,
      email: email || null,
      preferredChannel,
      accepted,
    },
  };
}

export function aggregateImportDonors(rows: ImportDonorRow[]) {
  const byId = new Map<string, ImportDonorRow>();

  for (const donor of rows) {
    const existing = byId.get(donor.documentId);
    if (!existing) {
      byId.set(donor.documentId, { ...donor });
      continue;
    }

    if (donor.lastDonationDate > existing.lastDonationDate) {
      existing.lastDonationDate = donor.lastDonationDate;
      existing.bloodType = donor.bloodType;
      existing.name = donor.name;
      existing.accepted = donor.accepted;
      if (donor.donationType) existing.donationType = donor.donationType;
    }

    existing.phone = existing.phone || donor.phone;
    existing.email = existing.email || donor.email;
    existing.accepted = existing.accepted || donor.accepted;
    if (donor.gender) existing.gender = donor.gender;
    if (!existing.donationType && donor.donationType) {
      existing.donationType = donor.donationType;
    }
  }

  return [...byId.values()];
}

/** Columnas del export Excel HUAV (RegisteredOffers). */
export const HUAV_DONORS_MAPPING: Record<string, string> = {
  name: "Nombre Donante",
  documentId: "Donación_1",
  phone: "Móvil",
  email: "e-mail",
  lastDonationDate: "Fecha Donacion",
  bloodType: "Grupo",
  donationType: "Donación",
  accepted: "Aceptado",
};

/** Columnas de donantes_info.sql (consulta directa a BD huav). */
export const HUAV_SQL_DONORS_MAPPING: Record<string, string> = {
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
};
