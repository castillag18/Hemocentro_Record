import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, withAuth } from "@/lib/api";
import { BLOOD_TYPES, CHANNELS, DONATION_TYPES, GENDERS } from "@/lib/constants";
import { parseFlexibleDate, startOfDay } from "@/lib/dates";
import { normalizePhone } from "@/lib/whatsapp";

const donorSchema = z.object({
  name: z.string().trim().min(2).optional(),
  documentId: z.string().trim().min(4).optional(),
  bloodType: z.enum(BLOOD_TYPES).optional(),
  lastDonationDate: z.string().optional(),
  birthDate: z.string().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  preferredChannel: z.enum(CHANNELS).optional(),
  gender: z.enum(GENDERS).optional().nullable(),
  donationType: z.enum(DONATION_TYPES).optional(),
  active: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await withAuth();
  if (error) return error;
  const { id } = await params;
  const donor = await prisma.donor.findUnique({ where: { id } });
  if (!donor) return jsonError("Donante no encontrado", 404);
  return NextResponse.json(donor);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await withAuth();
  if (error) return error;
  const { id } = await params;

  const parsed = donorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const existing = await prisma.donor.findUnique({ where: { id } });
  if (!existing) return jsonError("Donante no encontrado", 404);

  if (parsed.data.documentId && parsed.data.documentId !== existing.documentId) {
    const clash = await prisma.donor.findUnique({
      where: { documentId: parsed.data.documentId },
    });
    if (clash) return jsonError("Ya existe un donante con esa cédula");
  }

  let lastDonationDate = existing.lastDonationDate;
  if (parsed.data.lastDonationDate) {
    const date = parseFlexibleDate(parsed.data.lastDonationDate);
    if (!date) return jsonError("Fecha de donación inválida");
    lastDonationDate = startOfDay(date);
  }

  let birthDate = existing.birthDate;
  if (parsed.data.birthDate !== undefined) {
    if (!parsed.data.birthDate) {
      birthDate = null;
    } else {
      const parsedBirthDate = parseFlexibleDate(parsed.data.birthDate);
      if (!parsedBirthDate) return jsonError("Fecha de nacimiento inválida");
      birthDate = startOfDay(parsedBirthDate);
    }
  }

  const donor = await prisma.donor.update({
    where: { id },
    data: {
      name: parsed.data.name ?? existing.name,
      documentId: parsed.data.documentId ?? existing.documentId,
      bloodType: parsed.data.bloodType ?? existing.bloodType,
      gender: parsed.data.gender === undefined ? existing.gender : parsed.data.gender,
      donationType: parsed.data.donationType ?? existing.donationType,
      lastDonationDate,
      birthDate,
      phone:
        parsed.data.phone === undefined
          ? existing.phone
          : (normalizePhone(parsed.data.phone || "") ?? (parsed.data.phone || null)),
      email:
        parsed.data.email === undefined ? existing.email : parsed.data.email || null,
      preferredChannel: parsed.data.preferredChannel ?? existing.preferredChannel,
      active: parsed.data.active ?? existing.active,
    },
  });

  return NextResponse.json(donor);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await withAuth();
  if (error) return error;
  const { id } = await params;
  await prisma.donor.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
