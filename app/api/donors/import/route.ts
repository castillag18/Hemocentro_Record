import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, withAuth } from "@/lib/api";
import { aggregateImportDonors, mapRowToDonor, type ImportDonorRow } from "@/lib/import-map";
import { normalizePhone } from "@/lib/whatsapp";
import { startOfDay } from "@/lib/dates";

type ImportBody = {
  mapping?: Record<string, string>;
  rows?: Record<string, unknown>[];
};

export async function POST(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as ImportBody | null;
  const mapping = body?.mapping ?? {};
  const rows = body?.rows ?? [];

  if (!mapping.name || !mapping.bloodType || !mapping.lastDonationDate) {
    return jsonError("Debe mapear nombre, grupo sanguíneo y fecha de donación");
  }
  if (!rows.length) return jsonError("No hay filas para importar");

  const parsed: ImportDonorRow[] = [];

  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const mapped = mapRowToDonor(rows[i], mapping);
    if ("error" in mapped) {
      errors.push({ row: i + 2, message: mapped.error });
      continue;
    }
    parsed.push(mapped.donor);
  }

  const donors = aggregateImportDonors(parsed);
  let created = 0;
  let updated = 0;

  for (const donor of donors) {
    const data = {
      name: donor.name,
      documentId: donor.documentId,
      bloodType: donor.bloodType,
      gender: donor.gender ?? null,
      donationType: donor.donationType ?? "total",
      lastDonationDate: startOfDay(donor.lastDonationDate),
      phone: normalizePhone(donor.phone) ?? (donor.phone ?? null),
      email: donor.email ?? null,
      preferredChannel: donor.preferredChannel ?? "ambos",
      accepted: donor.accepted,
      active: true,
    };

    const existing = await prisma.donor.findUnique({
      where: { documentId: data.documentId },
    });

    if (existing) {
      await prisma.donor.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.donor.create({ data });
      created += 1;
    }
  }

  return NextResponse.json({
    created,
    updated,
    errors,
    total: rows.length,
    unique: donors.length,
  });
}
