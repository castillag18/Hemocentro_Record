import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, jsonError } from "@/lib/api";
import { getEligibleDonors, serializeEligible } from "@/lib/eligibility";
import { endOfDay, startOfDay } from "@/lib/dates";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rate = await checkRateLimit(request);
  if (!rate.allowed) return rateLimitResponse(rate);

  const { error } = await withAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pendiente";
  const bloodType = searchParams.get("bloodType") ?? "";
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? 15)));

  const includeSent = status === "enviado" || status === "all";
  const { eligible, reminderDays } = await getEligibleDonors({ includeSent });

  let list = eligible;
  if (status === "pendiente") {
    list = eligible.filter((d) => d.reminderStatus === "pendiente" || d.reminderStatus === "fallido");
  }
  if (status === "enviado") list = eligible.filter((d) => d.reminderStatus === "enviado");
  if (status === "fallido") list = eligible.filter((d) => d.reminderStatus === "fallido");
  if (bloodType) list = list.filter((d) => d.bloodType === bloodType);
  if (q) {
    list = list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.documentId.toLowerCase().includes(q) ||
        (d.email?.toLowerCase().includes(q) ?? false) ||
        (d.phone?.includes(q) ?? false),
    );
  }

  const total = list.length;
  const paged = list.slice((page - 1) * pageSize, page * pageSize);

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const [sentToday, failedToday] = await Promise.all([
    prisma.reminderLog.count({
      where: { status: "enviado", sentAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.reminderLog.count({
      where: { status: "fallido", sentAt: { gte: todayStart, lte: todayEnd } },
    }),
  ]);

  const pending = eligible.filter((d) => d.reminderStatus !== "enviado").length;

  return NextResponse.json({
    reminderDays,
    readyToday: pending,
    sentToday,
    failedToday,
    total,
    page,
    pageSize,
    donors: paged.map(serializeEligible),
  });
}
