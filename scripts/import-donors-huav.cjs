/**
 * Importa donantes desde la BD HUAV (huav) usando donantes_info.sql.
 * Uso: npm run import:donors:huav
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { PrismaClient } = require("@prisma/client");
const { loadEnv, buildHuavDatabaseUrl } = require("./load-env.cjs");

loadEnv();

const prisma = new PrismaClient();

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
};

const PLACEHOLDER_EMAILS = new Set(["notiene@gmail.com", "no tiene", "sin correo", "n/a", "na"]);

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

function normalizeGender(value) {
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

function normalizeAccepted(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return true;
  if (raw === "no" || raw === "n" || raw === "0" || raw === "false") return false;
  return true;
}

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return digits;
}

function normalizeBloodType(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const types = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
  return types.find((t) => t === raw) ?? null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

function loadDonantesSql() {
  const sqlPath =
    process.env.HUAV_DONORS_SQL?.trim() ||
    path.join(process.cwd(), "donantes_info.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`No se encontró el archivo SQL: ${sqlPath}`);
  }
  let sql = fs.readFileSync(sqlPath, "utf8").trim();
  if (!sql.endsWith(";")) sql += ";";
  // Extraer todos los donantes (sin límite de 1000 donaciones del export)
  sql = sql.replace(/\bLIMIT\s+\d+\b/gi, "");
  return { sql, sqlPath };
}

async function fetchHuavRows(connection) {
  const { sql, sqlPath } = loadDonantesSql();
  const [rows] = await connection.query(sql);
  return { rows, sqlPath };
}

function mapRowsToDonors(rows) {
  const byId = new Map();
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
    const documentId = deriveDocumentId(
      name,
      phone,
      email,
      row[MAPPING.documentId],
    );
    const donationType = normalizeDonationType(row[MAPPING.donationType]);
    const gender = normalizeGender(row[MAPPING.gender]);

    if (!name || !documentId || !bloodType || !lastDonationDate) {
      skipped += 1;
      continue;
    }

    const donor = {
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

async function main() {
  const huavUrl = buildHuavDatabaseUrl();
  if (!huavUrl) {
    throw new Error(
      "Configure HUAV_DB_* o HUAV_DATABASE_URL / DATABASE_URL en .env",
    );
  }

  const masked = huavUrl.replace(/:([^:@/]+)@/, ":****@");
  console.log("Conectando a HUAV:", masked);

  const connection = await mysql.createConnection(huavUrl);
  try {
    await connection.query("SELECT 1");
    const { rows, sqlPath } = await fetchHuavRows(connection);
    console.log(`Filas desde SQL (${path.basename(sqlPath)}): ${rows.length}`);

    const { byId, skipped } = mapRowsToDonors(rows);

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
          source: "huav",
          sqlFile: sqlPath,
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
  } finally {
    await connection.end();
  }
}

function explainHuavError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (/access denied/i.test(msg)) {
    const user = process.env.HUAV_DB_USER || "He_mo_center";
    const clientHost = process.env.SERVER_IP || "192.168.1.112";
    console.error("\n→ Solicite a TI en MySQL (Windows Server 192.168.1.4):");
    console.error(`  GRANT SELECT ON huav.* TO '${user}'@'${clientHost}';`);
    console.error("  FLUSH PRIVILEGES;");
    console.error("\n  La app usa hemocentro_app para Prisma; huav es solo lectura para importar donantes.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    explainHuavError(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
