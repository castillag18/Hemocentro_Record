import { NextResponse } from "next/server";
import {
  autoMessageDonorAsEligible,
  birthdayReferenceKey,
  getBirthdayDonorsToday,
  getSpecialDateDonorsToday,
  specialReferenceKey,
} from "@/lib/auto-messages";
import { getAutoReminderDonors } from "@/lib/eligibility";
import { getSettings } from "@/lib/settings";
import { sendRemindersToDonors } from "@/lib/send-reminders";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET ?? "hemocentro-cron-dev";
  if (secret !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const today = new Date();

  const settings = await getSettings();
  const hour = today.getHours();
  const withinHour = force || hour === settings.autoRemindersHour;

  const summary: Record<string, unknown> = {
    skipped: [] as string[],
    donation: null as Record<string, unknown> | null,
    birthday: null as Record<string, unknown> | null,
    special: [] as Record<string, unknown>[],
  };

  if (settings.autoRemindersEnabled && withinHour) {
    const { eligible, reminderDays } = await getAutoReminderDonors();
    if (eligible.length) {
      const result = await sendRemindersToDonors({
        donors: eligible,
        templateKind: "reminder",
      });
      summary.donation = { reminderDays, eligible: eligible.length, ...result };
    } else {
      (summary.skipped as string[]).push("Sin donantes en día de recordatorio de donación");
    }
  } else if (!settings.autoRemindersEnabled) {
    (summary.skipped as string[]).push("Recordatorios de donación desactivados");
  } else if (!withinHour) {
    (summary.skipped as string[]).push(
      `Fuera de hora programada (${settings.autoRemindersHour}:00)`,
    );
  }

  if (settings.autoBirthdayEnabled && withinHour) {
    const birthdayDonors = await getBirthdayDonorsToday(today);
    if (birthdayDonors.length) {
      const result = await sendRemindersToDonors({
        donors: birthdayDonors.map(autoMessageDonorAsEligible),
        templateKind: "birthday",
        referenceKey: birthdayReferenceKey(today.getFullYear()),
      });
      summary.birthday = { eligible: birthdayDonors.length, ...result };
    } else {
      (summary.skipped as string[]).push("Sin cumpleaños pendientes hoy");
    }
  } else if (!settings.autoBirthdayEnabled) {
    (summary.skipped as string[]).push("Mensajes de cumpleaños desactivados");
  }

  if (settings.autoSpecialDatesEnabled && withinHour) {
    const batches = await getSpecialDateDonorsToday(settings.specialDatesJson, today);
    if (batches.length) {
      for (const batch of batches) {
        const result = await sendRemindersToDonors({
          donors: batch.donors.map(autoMessageDonorAsEligible),
          templateKind: "special",
          referenceKey: specialReferenceKey(batch.special.id, today.getFullYear()),
          extraVars: { special_date_name: batch.special.name },
        });
        (summary.special as Record<string, unknown>[]).push({
          specialDate: batch.special.name,
          eligible: batch.donors.length,
          ...result,
        });
      }
    } else {
      (summary.skipped as string[]).push("Sin fechas especiales pendientes hoy");
    }
  } else if (!settings.autoSpecialDatesEnabled) {
    (summary.skipped as string[]).push("Mensajes de fechas especiales desactivados");
  }

  const hasWork =
    summary.donation || summary.birthday || (summary.special as unknown[]).length > 0;

  if (!hasWork && (summary.skipped as string[]).length) {
    return NextResponse.json({ skipped: true, ...summary });
  }

  return NextResponse.json(summary);
}
