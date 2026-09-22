import { google } from "googleapis";
import type { Settings } from "@prisma/client";
import { formatDate } from "./dates";
import { nextAppointmentSlot } from "./reminders";
import { getCalendarAuth, googleCalendarConfigured } from "./google-oauth";
import { prisma } from "./prisma";

export { googleCalendarConfigured };

export async function syncPendingAppointmentsToCalendar(settings: Settings) {
  if (!googleCalendarConfigured(settings)) return { synced: 0, failed: 0 };

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
      }
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}

async function getStaffAttendeeEmails() {
  const staff = await prisma.adminUser.findMany({
    where: { active: true },
    select: { email: true },
  });
  return [...new Set(staff.map((user) => user.email.toLowerCase()).filter(Boolean))];
}

export async function createDonorAppointment(options: {
  settings: Settings;
  donorName: string;
  donorEmail?: string | null;
  bloodType: string;
  scheduledAt?: Date;
}) {
  if (!googleCalendarConfigured(options.settings)) {
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
  if (options.donorEmail) {
    attendeeEmails.add(options.donorEmail.toLowerCase());
  }
  for (const email of staffEmails) {
    attendeeEmails.add(email);
  }

  const location = options.settings.siteAddress?.trim() || undefined;
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
        options.settings.sitePhone ? `Teléfono sede: ${options.settings.sitePhone}` : "",
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

  return {
    scheduledAt: start,
    googleEventId: event.data.id ?? null,
    formattedDate: formatDate(start),
    formattedTime: start.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
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
  if (options.sitePhone) lines.push(`📞 ${options.sitePhone}`);
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
