import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api";
import {
  estimatePendingReminderCount,
  getEligibleDonorsPaginated,
  serializeEligible,
} from "@/lib/eligibility";
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
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? 15)));
  const includeSent = status === "enviado" || status === "all";

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [paged, sentToday, failedToday, readyToday] = await Promise.all([
    getEligibleDonorsPaginated({
      page,
      pageSize,
      status,
      bloodType,
      q,
      includeSent,
    }),
    prisma.reminderLog.count({
      where: { status: "enviado", sentAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.reminderLog.count({
      where: { status: "fallido", sentAt: { gte: todayStart, lte: todayEnd } },
    }),
    estimatePendingReminderCount(),
  ]);

  return NextResponse.json({
    reminderDays: paged.reminderDays,
    readyToday,
    sentToday,
    failedToday,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    hasMore: paged.hasMore,
    totalExact: paged.totalExact,
    donors: paged.eligible.map(serializeEligible),
  });
}
