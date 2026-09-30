import { NextResponse } from "next/server";
import { z } from "zod";
import { listDonorsPaginated } from "@/lib/donor-list";
import { prisma } from "@/lib/prisma";
import { jsonError, withAuth } from "@/lib/api";
import { BLOOD_TYPES, CHANNELS, DONATION_TYPES, GENDERS } from "@/lib/constants";
import { parseFlexibleDate, startOfDay } from "@/lib/dates";
import { normalizePhone } from "@/lib/whatsapp";

const donorSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto"),
  documentId: z.string().trim().min(4, "Cédula inválida"),
  bloodType: z.enum(BLOOD_TYPES),
  lastDonationDate: z.string().min(1),
  birthDate: z.string().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  preferredChannel: z.enum(CHANNELS).default("ambos"),
  gender: z.enum(GENDERS).optional().nullable(),
  donationType: z.enum(DONATION_TYPES).default("total"),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const bloodType = searchParams.get("bloodType") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 25)));

  const result = await listDonorsPaginated({ q, bloodType, page, pageSize });

  return NextResponse.json({
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasMore: result.hasMore,
    totalExact: result.totalExact,
    donors: result.donors,
  });
}

export async function POST(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const parsed = donorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const date = parseFlexibleDate(parsed.data.lastDonationDate);
  if (!date) return jsonError("Fecha de donación inválida");

  const birthDate = parsed.data.birthDate
    ? parseFlexibleDate(parsed.data.birthDate)
    : null;
  if (parsed.data.birthDate && !birthDate) return jsonError("Fecha de nacimiento inválida");

  const existing = await prisma.donor.findUnique({
    where: { documentId: parsed.data.documentId },
  });
  if (existing) return jsonError("Ya existe un donante con esa cédula");

  const donor = await prisma.donor.create({
    data: {
      name: parsed.data.name,
      documentId: parsed.data.documentId,
      bloodType: parsed.data.bloodType,
      gender: parsed.data.gender ?? null,
      donationType: parsed.data.donationType,
      lastDonationDate: startOfDay(date),
      birthDate: birthDate ? startOfDay(birthDate) : null,
      phone: normalizePhone(parsed.data.phone || "") ?? (parsed.data.phone || null),
      email: parsed.data.email || null,
      preferredChannel: parsed.data.preferredChannel,
      active: parsed.data.active ?? true,
    },
  });

  return NextResponse.json(donor, { status: 201 });
}
