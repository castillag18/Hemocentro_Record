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
import { getSatisfactionSurveyCandidates } from "@/lib/satisfaction-survey";
import { currentHourBogota } from "@/lib/hemocentro-hours";

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
  const hourBogota = currentHourBogota(today);
  const withinHour = force || hourBogota === settings.autoRemindersHour;

  const summary: Record<string, unknown> = {
    schedule: {
      timeZone: "America/Bogota",
      currentHourBogota: hourBogota,
      autoRemindersEnabled: settings.autoRemindersEnabled,
      autoRemindersHour: settings.autoRemindersHour,
      withinRemindersHour: withinHour,
      forced: force,
    },
    skipped: [] as string[],
    donation: null as Record<string, unknown> | null,
    birthday: null as Record<string, unknown> | null,
    special: [] as Record<string, unknown>[],
    satisfaction: null as Record<string, unknown> | null,
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

  const satisfactionHour = settings.autoSatisfactionSurveyHour ?? 18;
  const withinSatisfactionHour = force || hourBogota === satisfactionHour;

  if (settings.autoSatisfactionSurveyEnabled && withinSatisfactionHour) {
    const candidates = await getSatisfactionSurveyCandidates(today);
    if (candidates.length) {
      let sent = 0;
      let failed = 0;
      for (const candidate of candidates) {
        const result = await sendRemindersToDonors({
          donors: [candidate.donor],
          channels: ["whatsapp"],
          explicitChannel: true,
          templateKind: "satisfaction",
          referenceKey: candidate.referenceKey,
        });
        sent += result.whatsappOpenWa.sent + result.whatsappApi.sent;
        failed +=
          result.whatsappOpenWa.failed.length +
          result.whatsappApi.failed.length +
          (result.whatsapp.length ? 1 : 0);
      }
      summary.satisfaction = { eligible: candidates.length, sent, failed };
    } else {
      (summary.skipped as string[]).push(
        "Sin encuestas de satisfacción pendientes (cita hoy + donación registrada en HUAV)",
      );
    }
  } else if (!settings.autoSatisfactionSurveyEnabled) {
    (summary.skipped as string[]).push("Encuestas de satisfacción desactivadas");
  } else if (!withinSatisfactionHour) {
    (summary.skipped as string[]).push(
      `Fuera de hora de encuesta de satisfacción (${satisfactionHour}:00)`,
    );
  }

  const hasWork =
    summary.donation ||
    summary.birthday ||
    (summary.special as unknown[]).length > 0 ||
    summary.satisfaction;

  if (!hasWork && (summary.skipped as string[]).length) {
    return NextResponse.json({ skipped: true, ...summary });
  }

  return NextResponse.json(summary);
}
