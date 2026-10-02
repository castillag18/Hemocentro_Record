import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, withAuth } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { computeNextDonationDate, getReminderIntervalSettings } from "@/lib/eligibility";
import { buildTemplateVars, interpolate } from "@/lib/templates";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export async function GET(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const donorId = new URL(request.url).searchParams.get("donorId");
  if (!donorId) return jsonError("Falta donorId");

  const donor = await prisma.donor.findUnique({ where: { id: donorId } });
  if (!donor) return jsonError("Donante no encontrado", 404);
  if (!donor.phone) return jsonError("El donante no tiene teléfono");

  const [template, settings, intervalSettings] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { channel: "whatsapp" },
      orderBy: { updatedAt: "desc" },
    }),
    getSettings(),
    getReminderIntervalSettings(),
  ]);
  if (!template) return jsonError("No hay plantilla de WhatsApp");

  const nextDonationDate = computeNextDonationDate(
    donor.lastDonationDate,
    donor,
    intervalSettings,
  );

  const message = interpolate(
    template.body,
    buildTemplateVars({
      name: donor.name,
      lastDonationDate: donor.lastDonationDate,
      bloodType: donor.bloodType,
      donationType: donor.donationType,
      nextDonationDate,
      appointmentLink: settings.appointmentLink,
    }),
  );
  const url = buildWhatsAppUrl(donor.phone, message);
  if (!url) return jsonError("Teléfono inválido");

  return NextResponse.json({ url, message, name: donor.name, phone: donor.phone });
}
