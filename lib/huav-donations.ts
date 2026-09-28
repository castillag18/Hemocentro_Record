import type { RowDataPacket } from "mysql2";
import { bogotaDateParts } from "./hemocentro-hours";
import { withHuavConnection } from "./huav-db";

export type DonorLookup = {
  documentId: string;
  phone: string | null;
};

function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return digits;
}

function formatSqlDate(date: Date) {
  const { year, month, day } = bogotaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type HuavDonationRow = RowDataPacket & {
  documentId: string | null;
  mobileDigits: string | null;
};

/** Donantes con registro de donación en HUAV el mismo día (zona America/Bogota). */
export async function findDonorsWithDonationOnDate(
  donors: DonorLookup[],
  date: Date,
): Promise<Set<string>> {
  if (!donors.length) return new Set();

  const matched = new Set<string>();
  const sqlDate = formatSqlDate(date);

  const documentIds = new Set<string>();
  const phoneDigits = new Set<string>();
  for (const donor of donors) {
    const doc = donor.documentId.trim();
    if (doc && !doc.startsWith("NOM-")) documentIds.add(doc);
    const telFromDoc = doc.startsWith("TEL-") ? doc.slice(4) : null;
    const phone = normalizePhoneDigits(telFromDoc ?? donor.phone);
    if (phone) phoneDigits.add(phone);
  }

  const rows = await withHuavConnection(async (connection) => {
    const [result] = await connection.query<HuavDonationRow[]>(
      `
      SELECT DISTINCT
        COALESCE(
          NULLIF(TRIM(p.COD_CIVILID), ''),
          NULLIF(TRIM(p.COD_DONOR), ''),
          p.COD_PERSON
        ) AS documentId,
        REGEXP_REPLACE(COALESCE(p.DES_MOBILEPHONE, ''), '[^0-9]', '') AS mobileDigits
      FROM donation d
      INNER JOIN person p ON p.ID_PERSON = d.ID_PERSON
      WHERE DATE(d.DAT_DONATION) = ?
      `,
      [sqlDate],
    );
    return result;
  });

  if (!rows?.length) return matched;

  for (const donor of donors) {
    const doc = donor.documentId.trim();
    const telFromDoc = doc.startsWith("TEL-") ? doc.slice(4) : null;
    const phone = normalizePhoneDigits(telFromDoc ?? donor.phone);

    const found = rows.some((row) => {
      const rowDoc = String(row.documentId ?? "").trim();
      if (rowDoc && documentIds.has(rowDoc) && rowDoc === doc) return true;
      if (!phone) return false;
      const rowPhone = String(row.mobileDigits ?? "").replace(/\D/g, "");
      if (!rowPhone) return false;
      const normalizedRowPhone =
        rowPhone.length === 10 && rowPhone.startsWith("3") ? `57${rowPhone}` : rowPhone;
      return normalizedRowPhone === phone;
    });

    if (found) matched.add(donor.documentId);
  }

  return matched;
}