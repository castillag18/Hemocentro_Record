import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, withAuth } from "@/lib/api";
import { startOfDay } from "@/lib/dates";

type Body = {
  donorId?: string;
  channel?: "whatsapp" | "email";
  status?: "enviado" | "fallido";
  error?: string;
};

export async function POST(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.donorId || !body.channel) {
    return jsonError("Donante y canal son obligatorios");
  }

  const donor = await prisma.donor.findUnique({ where: { id: body.donorId } });
  if (!donor) return jsonError("Donante no encontrado", 404);

  const log = await prisma.reminderLog.create({
    data: {
      donorId: donor.id,
      channel: body.channel,
      status: body.status ?? "enviado",
      error: body.error ?? null,
      donationDateRef: startOfDay(donor.lastDonationDate),
    },
  });

  return NextResponse.json(log);
}
