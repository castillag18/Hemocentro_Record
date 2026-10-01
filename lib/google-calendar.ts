import { google } from "googleapis";
import type { Settings } from "@prisma/client";
import { formatDateBogota, formatTimeBogota, sitePhoneForMessages } from "./hemocentro-hours";
import { debugOpenWaLog } from "./debug-openwa-log";
import { nextAppointmentSlot } from "./reminders";
import { getCalendarAuth, googleCalendarConfigured } from "./google-oauth";
import { prisma } from "./prisma";
import { assertSafeEmail } from "./validation/sanitize";

export { googleCalendarConfigured };

export type CalendarSyncFailure = { appointmentId: string; error: string };

function calendarAttendeeEmail(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return assertSafeEmail(raw);
  } catch {
    return null;
  }
}

function calendarApiErrorMessage(err: unknown): string {
  const gaxios = err as { response?: { data?: { error?: { message?: string; errors?: { message?: string }[] } } } };
  const fromApi =
    gaxios.response?.data?.error?.message ??
    gaxios.response?.data?.error?.errors?.[0]?.message;
  if (fromApi) return String(fromApi).slice(0, 240);
  if (err instanceof Error) return err.message.slice(0, 240);
  return "Error desconocido al crear evento";
}

export async function syncPendingAppointmentsToCalendar(settings: Settings) {
  if (!googleCalendarConfigured(settings)) return { synced: 0, failed: 0, failures: [] as CalendarSyncFailure[] };

  const pending = await prisma.appointment.findMany({
    where: {
      status: "confirmada",
      googleEventId: null,
      scheduledAt: { gte: new Date() },
    },
    include: {
      donor: { select: { name: true, email: true, bloodType: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  let synced = 0;
  let failed = 0;
  const failures: CalendarSyncFailure[] = [];
  for (const item of pending) {
    try {
      const created = await createDonorAppointment({
        settings,
        donorName: item.donor.name,
        donorEmail: item.donor.email,
        bloodType: item.donor.bloodType,
        scheduledAt: item.scheduledAt,
      });
      if (created.googleEventId) {
        await prisma.appointment.update({
          where: { id: item.id },
          data: { googleEventId: created.googleEventId },
        });
        synced += 1;
      } else {
        failed += 1;
        failures.push({ appointmentId: item.id, error: "Google Calendar no devolvió id de evento" });
      }
    } catch (err) {
      failed += 1;
      const error = calendarApiErrorMessage(err);
      failures.push({ appointmentId: item.id, error });
      // #region agent log
      debugOpenWaLog(
        "google-calendar.ts:sync",
        "appointment sync failed",
        {
          appointmentId: item.id,
          error,
          donorEmailPresent: Boolean(item.donor.email?.trim()),
          donorEmailValid: Boolean(calendarAttendeeEmail(item.donor.email)),
          scheduledAtIso: item.scheduledAt.toISOString(),
        },
        "G1",
      );
      // #endregion
    }
  }

  return { synced, failed, failures };
}

async function getStaffAttendeeEmails() {
  const staff = await prisma.adminUser.findMany({
    where: { active: true },
    select: { email: true },
  });
  const emails = staff
    .map((user) => calendarAttendeeEmail(user.email))
    .filter((email): email is string => Boolean(email));
  return [...new Set(emails)];
}

export async function createDonorAppointment(options: {
  settings: Settings;
  donorName: string;
  donorEmail?: string | null;
  bloodType: string;
  scheduledAt?: Date;
}) {
  const calendarReady = googleCalendarConfigured(options.settings);
  if (!calendarReady) {
    throw new Error("Google Calendar no está configurado");
  }

  const start = options.scheduledAt ?? nextAppointmentSlot();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const { auth, refreshed } = await getCalendarAuth(options.settings);

  if (refreshed?.access_token) {
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        googleAccessToken: refreshed.access_token,
        googleTokenExpiry: refreshed.expiry_date ? new Date(refreshed.expiry_date) : null,
        ...(refreshed.refresh_token ? { googleRefreshToken: refreshed.refresh_token } : {}),
      },
    });
  }

  const calendar = google.calendar({ version: "v3", auth });
  const staffEmails = await getStaffAttendeeEmails();
  const attendeeEmails = new Set<string>();
  const donorAttendee = calendarAttendeeEmail(options.donorEmail);
  if (donorAttendee) attendeeEmails.add(donorAttendee);
  for (const email of staffEmails) {
    attendeeEmails.add(email);
  }

  const location = options.settings.siteAddress?.trim() || undefined;
  const publicPhone = sitePhoneForMessages(options.settings.sitePhone);
  const event = await calendar.events.insert({
    calendarId: options.settings.googleCalendarId || "primary",
    sendUpdates: attendeeEmails.size > 0 ? "all" : "none",
    requestBody: {
      summary: `Donación de sangre — ${options.donorName}`,
      location,
      description: [
        `Donante: ${options.donorName}`,
        `Grupo sanguíneo: ${options.bloodType}`,
        `Agendado vía WhatsApp — ${options.settings.siteName}`,
        location ? `Sede: ${location}` : "",
        publicPhone ? `Teléfono sede: ${publicPhone}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      start: {
        dateTime: start.toISOString(),
        timeZone: "America/Bogota",
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: "America/Bogota",
      },
      attendees:
        attendeeEmails.size > 0
          ? [...attendeeEmails].map((email) => ({ email }))
          : undefined,
    },
  });

  const result = {
    scheduledAt: start,
    googleEventId: event.data.id ?? null,
    formattedDate: formatDateBogota(start),
    formattedTime: formatTimeBogota(start),
  };
  return result;
}

export function buildAppointmentWhatsAppMessage(options: {
  donorName: string;
  siteName: string;
  siteAddress: string;
  sitePhone: string;
  formattedDate: string;
  formattedTime: string;
}) {
  const lines = [
    `¡Hola ${options.donorName}! ✅`,
    "",
    `Su cita de donación en *${options.siteName}* quedó confirmada:`,
    `📅 *${options.formattedDate}* a las *${options.formattedTime}*`,
  ];
  if (options.siteAddress) lines.push(`📍 ${options.siteAddress}`);
  const phone = sitePhoneForMessages(options.sitePhone);
  if (phone) lines.push(`📞 ${phone}`);
  lines.push("", "Gracias por seguir salvando vidas. 🩸");
  return lines.join("\n");
}

export function buildAppointmentConfirmationEmail(options: {
  donorName: string;
  siteName: string;
  siteAddress: string;
  formattedDate: string;
  formattedTime: string;
}) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111c2d;">
    <h2 style="color:#9e001f;">Cita confirmada — ${options.siteName}</h2>
    <p>Hola <strong>${options.donorName}</strong>,</p>
    <p>Su cita de donación de sangre ha sido agendada exitosamente:</p>
    <ul>
      <li><strong>Fecha:</strong> ${options.formattedDate}</li>
      <li><strong>Hora:</strong> ${options.formattedTime}</li>
      ${options.siteAddress ? `<li><strong>Sede:</strong> ${options.siteAddress}</li>` : ""}
    </ul>
    <p>Gracias por seguir salvando vidas. 🩸</p>
  </div>`;
}
