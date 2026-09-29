import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaRouteError, withAuth } from "@/lib/api";
import {
  estimatePendingReminderCount,
  getEligiblePreview,
  getReminderIntervalSettings,
  serializeEligible,
} from "@/lib/eligibility";
import { endOfDay, startOfDay } from "@/lib/dates";

export async function GET() {
  const { error } = await withAuth();
  if (error) return error;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  try {
    const intervalSettings = await getReminderIntervalSettings();
    const [totalDonors, donationsToday, sentToday, failedToday, pendingReminders, eligible] =
      await Promise.all([
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
        estimatePendingReminderCount(),
        getEligiblePreview(8),
      ]);

    return NextResponse.json({
      reminderDays: intervalSettings.reminderDays,
      totalDonors,
      donationsToday,
      pendingReminders,
      sentToday,
      failedToday,
      eligible: eligible.map(serializeEligible),
    });
  } catch (error) {
    return handlePrismaRouteError(error);
  }
}
