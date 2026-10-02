import {
  autoMessageDonorAsEligible,
  birthdayReferenceKey,
  getBirthdayDonorsToday,
  getSpecialDateDonorsToday,
  specialReferenceKey,
} from "./auto-messages";
import { getAutoReminderDonors } from "./eligibility";
import { currentHourBogota } from "./hemocentro-hours";
import { getSettings } from "./settings";
import { sendRemindersToDonors } from "./send-reminders";
import { getSatisfactionSurveyCandidates } from "./satisfaction-survey";

export type AutoRemindersSummary = Record<string, unknown> & {
  skipped?: boolean | string[];
  schedule?: Record<string, unknown>;
  donation?: Record<string, unknown> | null;
  birthday?: Record<string, unknown> | null;
  special?: Record<string, unknown>[];
  satisfaction?: Record<string, unknown> | null;
};

/** Ejecuta recordatorios automáticos (cron / CLI directo, sin timeout HTTP). */
export async function runAutoRemindersJob(options?: {
  force?: boolean;
  today?: Date;
}): Promise<AutoRemindersSummary> {
  const force = options?.force ?? false;
  const today = options?.today ?? new Date();

  const settings = await getSettings();
  const hourBogota = currentHourBogota(today);
  const withinHour = force || hourBogota === settings.autoRemindersHour;

  const summary: AutoRemindersSummary = {
    schedule: {
      timeZone: "America/Bogota",
      currentHourBogota: hourBogota,
      autoRemindersEnabled: settings.autoRemindersEnabled,
      autoRemindersHour: settings.autoRemindersHour,
      withinRemindersHour: withinHour,
      forced: force,
    },
    skipped: [],
    donation: null,
    birthday: null,
    special: [],
    satisfaction: null,
  };

  const skipped = summary.skipped as string[];

  if (settings.autoRemindersEnabled && withinHour) {
    const { eligible, reminderDays } = await getAutoReminderDonors();
    if (eligible.length) {
      const result = await sendRemindersToDonors({
        donors: eligible,
        templateKind: "reminder",
      });
      summary.donation = { reminderDays, eligible: eligible.length, ...result };
    } else {
      skipped.push("Sin donantes en día de recordatorio de donación");
    }
  } else if (!settings.autoRemindersEnabled) {
    skipped.push("Recordatorios de donación desactivados");
  } else if (!withinHour) {
    skipped.push(`Fuera de hora programada (${settings.autoRemindersHour}:00)`);
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
      skipped.push("Sin cumpleaños pendientes hoy");
    }
  } else if (!settings.autoBirthdayEnabled) {
    skipped.push("Mensajes de cumpleaños desactivados");
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
        summary.special!.push({
          specialDate: batch.special.name,
          eligible: batch.donors.length,
          ...result,
        });
      }
    } else {
      skipped.push("Sin fechas especiales pendientes hoy");
    }
  } else if (!settings.autoSpecialDatesEnabled) {
    skipped.push("Mensajes de fechas especiales desactivados");
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
      skipped.push(
        "Sin encuestas de satisfacción pendientes (cita hoy + donación registrada en HUAV)",
      );
    }
  } else if (!settings.autoSatisfactionSurveyEnabled) {
    skipped.push("Encuestas de satisfacción desactivadas");
  } else if (!withinSatisfactionHour) {
    skipped.push(`Fuera de hora de encuesta de satisfacción (${satisfactionHour}:00)`);
  }

  const hasWork =
    summary.donation ||
    summary.birthday ||
    (summary.special?.length ?? 0) > 0 ||
    summary.satisfaction;

  if (!hasWork && skipped.length) {
    return { skipped: true, ...summary };
  }

  return summary;
}
