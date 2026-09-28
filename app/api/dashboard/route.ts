import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaRouteError, withAuth } from "@/lib/api";
import { getEligibleDonors, serializeEligible } from "@/lib/eligibility";
import { endOfDay, startOfDay } from "@/lib/dates";

export async function GET() {
  const { error } = await withAuth();
  if (error) return error;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  try {
    const [{ eligible, reminderDays }, totalDonors, donationsToday, sentToday, failedToday] =
      await Promise.all([
        getEligibleDonors(),
        prisma.donor.count({ where: { active: true } }),
        prisma.donor.count({
          where: {
            lastDonationDate: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.reminderLog.count({
          where: { status: "enviado", sentAt: { gte: todayStart, lte: todayEnd } },
        }),
        prisma.reminderLog.count({
          where: { status: "fallido", sentAt: { gte: todayStart, lte: todayEnd } },
        }),
      ]);

    return NextResponse.json({
      reminderDays,
      totalDonors,
      donationsToday,
      pendingReminders: eligible.length,
      sentToday,
      failedToday,
      eligible: eligible.slice(0, 8).map(serializeEligible),
    });
  } catch (error) {
    return handlePrismaRouteError(error);
  }
}
