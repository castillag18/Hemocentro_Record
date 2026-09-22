/**
 * Importa donantes desde data/Info Donates 2026.xlsx (formato HUAV).
 * Uso: npm run import:donors
 */
const path = require("node:path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const MAPPING = {
  name: "Nombre Donante",
  documentId: "Donación_1",
  phone: "Móvil",
  email: "e-mail",
  lastDonationDate: "Fecha Donacion",
  bloodType: "Grupo",
  donationType: "Donación",
  accepted: "Aceptado",
};

function normalizeDonationType(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "total";
  if (raw === "A" || raw.includes("AFER")) return "aferesis";
  return "total";
}

function normalizeAccepted(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return raw === "si" || raw === "yes" || raw === "s" || raw === "1" || raw === "true";
}

const PLACEHOLDER_EMAILS = new Set(["notiene@gmail.com", "no tiene", "sin correo", "n/a", "na"]);

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return digits;
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeBloodType(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const types = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
  return types.find((t) => t === raw) ?? null;
}

function deriveDocumentId(name, phone, email, fallback) {
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

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const filePath = path.join(process.cwd(), "data", "Info Donates 2026.xlsx");
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

  const byId = new Map();
  let skipped = 0;

  for (const row of rows) {
    const name = String(row[MAPPING.name] ?? "").trim();
    const phone = row[MAPPING.phone];
    const emailRaw = String(row[MAPPING.email] ?? "").trim();
    const email = PLACEHOLDER_EMAILS.has(emailRaw.toLowerCase()) ? "" : emailRaw;
    const bloodType = normalizeBloodType(row[MAPPING.bloodType]);
    const lastDonationDate = parseExcelDate(row[MAPPING.lastDonationDate]);
    const accepted = normalizeAccepted(row[MAPPING.accepted]);
    const mappedDocument = MAPPING.documentId
      ? String(row[MAPPING.documentId] ?? "").trim()
      : "";
    const documentId = deriveDocumentId(name, phone, email, mappedDocument);
    const donationType = MAPPING.donationType
      ? normalizeDonationType(row[MAPPING.donationType])
      : "total";

    if (!name || !documentId || !bloodType || !lastDonationDate) {
      skipped += 1;
      continue;
    }

    const donor = {
      name,
      documentId,
      bloodType,
      donationType,
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
        donationType: donor.donationType || existing?.donationType || "total",
      });
    } else {
      existing.phone = existing.phone || donor.phone;
      existing.email = existing.email || donor.email;
    }
  }

  let created = 0;
  let updated = 0;

  for (const donor of byId.values()) {
    const existing = await prisma.donor.findUnique({
      where: { documentId: donor.documentId },
    });
    if (existing) {
      await prisma.donor.update({ where: { id: existing.id }, data: donor });
      updated += 1;
    } else {
      await prisma.donor.create({ data: donor });
      created += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        file: filePath,
        rows: rows.length,
        unique: byId.size,
        created,
        updated,
        skipped,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
