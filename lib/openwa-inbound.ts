import { prisma } from "./prisma";
import {
  findDonorByOpenWaContact,
  findInactiveAcceptedDonorByPhone,
  persistDonorWhatsAppChatId,
} from "./openwa-contacts";
import { resolveLatestIncomingMessageId } from "./openwa-send";
import { openWaConfigured, sendOpenWaMessage } from "./whatsapp";
import { isAffirmativeReply } from "./reminders";
import {
  buildAppointmentConfirmationEmail,
  buildAppointmentWhatsAppMessage,
  createDonorAppointment,
  googleCalendarConfigured,
} from "./google-calendar";
import { sendEmail, smtpConfigured } from "./email";
import { debugOpenWaLog } from "./debug-openwa-log";
import { formatDateBogota, formatTimeBogota, sitePhoneForMessages } from "./hemocentro-hours";
import {
  buildSlotSelectionMessage,
  completeBookingSession,
  createBookingSession,
  deserializeSlots,
  generateAvailableSlots,
  getActiveBookingSession,
  parseSlotSelection,
} from "./appointment-booking";
import type { getSettings } from "./settings";

type Settings = Awaited<ReturnType<typeof getSettings>>;

export type InboundMessage = {
  from: string;
  chatId: string;
  body: string;
  messageId?: string;
  senderPhone?: string;
  source: "webhook" | "poll";
};

export type InboundResult = Record<string, unknown>;

function openWaContext(settings: Settings) {
  return {
    baseUrl: settings.whatsappOpenWaUrl,
    apiKey: settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "",
    sessionId: settings.whatsappOpenWaSessionId,
  };
}

async function notifyDonorWhatsApp(
  settings: Settings,
  options: {
    donorId: string;
    phone: string;
    message: string;
    chatId?: string;
    replyToMessageId?: string;
  },
) {
  if (!openWaConfigured(settings)) {
    throw new Error("WhatsApp (OpenWA) no está configurado");
  }
  const apiKey = settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const result = await sendOpenWaMessage({
    baseUrl: settings.whatsappOpenWaUrl,
    apiKey,
    sessionId: settings.whatsappOpenWaSessionId,
    to: options.phone,
    chatId: options.chatId,
    replyToMessageId: options.replyToMessageId,
    message: options.message,
  });
  const chatId = (result as { chatId?: string }).chatId ?? options.chatId;
  await persistDonorWhatsAppChatId(options.donorId, chatId);
}

async function confirmAppointment(options: {
  settings: Settings;
  donor: { id: string; name: string; email: string | null; phone: string | null; bloodType: string };
  scheduledAt: Date;
  bookingSessionId?: string;
  replyChatId?: string;
  replyToMessageId?: string;
}) {
  let appointment: {
    scheduledAt: Date;
    googleEventId: string | null;
    formattedDate: string;
    formattedTime: string;
  };

  const calendarConfigured = googleCalendarConfigured(options.settings);
  if (calendarConfigured) {
    try {
      appointment = await createDonorAppointment({
        settings: options.settings,
        donorName: options.donor.name,
        donorEmail: options.donor.email,
        bloodType: options.donor.bloodType,
        scheduledAt: options.scheduledAt,
      });
    } catch {
      appointment = {
        scheduledAt: options.scheduledAt,
        googleEventId: null,
        formattedDate: formatDateBogota(options.scheduledAt),
        formattedTime: formatTimeBogota(options.scheduledAt),
      };
    }
  } else {
    appointment = {
      scheduledAt: options.scheduledAt,
      googleEventId: null,
      formattedDate: formatDateBogota(options.scheduledAt),
      formattedTime: formatTimeBogota(options.scheduledAt),
    };
  }

  // #region agent log
  debugOpenWaLog(
    "openwa-inbound.ts:confirmAppointment",
    "confirmation labels",
    {
      scheduledAtIso: options.scheduledAt.toISOString(),
      formattedTime: appointment.formattedTime,
      formattedDate: appointment.formattedDate,
    },
    "T1",
  );
  // #endregion

  await prisma.appointment.create({
    data: {
      donorId: options.donor.id,
      scheduledAt: appointment.scheduledAt,
      googleEventId: appointment.googleEventId,
      status: "confirmada",
      source: "whatsapp",
    },
  });

  if (options.bookingSessionId) {
    await completeBookingSession(options.bookingSessionId);
  }

  let deliveryFailed = false;
  if (options.donor.phone) {
    const whatsappConfirmation = buildAppointmentWhatsAppMessage({
      donorName: options.donor.name,
      siteName: options.settings.siteName,
      siteAddress: options.settings.siteAddress,
      sitePhone: sitePhoneForMessages(options.settings.sitePhone),
      formattedDate: appointment.formattedDate,
      formattedTime: appointment.formattedTime,
    });
    try {
      await notifyDonorWhatsApp(options.settings, {
        donorId: options.donor.id,
        phone: options.donor.phone,
        chatId: options.replyChatId,
        replyToMessageId: options.replyToMessageId,
        message: whatsappConfirmation,
      });
    } catch {
      deliveryFailed = true;
    }
  }

  if (options.donor.email && smtpConfigured(options.settings)) {
    await sendEmail({
      settings: options.settings,
      to: options.donor.email,
      subject: `Cita confirmada — ${options.settings.siteName}`,
      html: buildAppointmentConfirmationEmail({
        donorName: options.donor.name,
        siteName: options.settings.siteName,
        siteAddress: options.settings.siteAddress,
        formattedDate: appointment.formattedDate,
        formattedTime: appointment.formattedTime,
      }),
    });
  }

  return { ...appointment, deliveryFailed };
}

async function handleAffirmativeReply(options: {
  settings: Settings;
  donor: NonNullable<Awaited<ReturnType<typeof findDonorByOpenWaContact>>>;
  replyChatId: string;
  replyToMessageId?: string;
}) {
  const existing = await prisma.appointment.findFirst({
    where: {
      donorId: options.donor.id,
      scheduledAt: { gte: new Date() },
      status: "confirmada",
    },
  });
  if (existing) {
    if (options.donor.phone) {
      await notifyDonorWhatsApp(options.settings, {
        donorId: options.donor.id,
        phone: options.donor.phone,
        chatId: options.replyChatId,
        replyToMessageId: options.replyToMessageId,
        message: `Hola ${options.donor.name}, ya tiene una cita confirmada para el ${existing.scheduledAt.toLocaleDateString("es-CO")}. Si necesita cambiarla, contacte al banco de sangre.`,
      }).catch(() => {});
    }
    return { ignored: true, reason: "Ya tiene cita pendiente" };
  }

  const slots = await generateAvailableSlots();

  if (!slots.length) {
    if (options.donor.phone) {
      await notifyDonorWhatsApp(options.settings, {
        donorId: options.donor.id,
        phone: options.donor.phone,
        chatId: options.replyChatId,
        replyToMessageId: options.replyToMessageId,
        message: `Hola ${options.donor.name}, no hay fechas disponibles en este momento. Por favor contacte a ${sitePhoneForMessages(options.settings.sitePhone) || options.settings.siteName}.`,
      }).catch(() => {});
    }
    return { error: "Sin fechas disponibles", status: 503 };
  }

  if (!options.donor.phone) {
    return { error: "Donante sin teléfono", status: 400 };
  }

  await createBookingSession({
    donorId: options.donor.id,
    phone: options.donor.phone,
    slots,
  });

  const slotMessage = buildSlotSelectionMessage({
    donorName: options.donor.name,
    siteName: options.settings.siteName,
    slots,
  });

  try {
    await notifyDonorWhatsApp(options.settings, {
      donorId: options.donor.id,
      phone: options.donor.phone,
      chatId: options.replyChatId,
      replyToMessageId: options.replyToMessageId,
      message: slotMessage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar fechas por WhatsApp";
    return {
      ok: true,
      step: "awaiting_slot_selection",
      donorId: options.donor.id,
      options: slots.length,
      deliveryFailed: true,
      error: msg,
    };
  }

  return {
    ok: true,
    step: "awaiting_slot_selection",
    donorId: options.donor.id,
    options: slots.length,
  };
}

async function handleSlotSelection(options: {
  settings: Settings;
  donor: NonNullable<Awaited<ReturnType<typeof findDonorByOpenWaContact>>>;
  body: string;
  replyChatId: string;
  replyToMessageId?: string;
  session: NonNullable<Awaited<ReturnType<typeof getActiveBookingSession>>>;
}) {
  const slots = deserializeSlots(options.session.slotsJson);
  const selected = parseSlotSelection(options.body, slots);
  if (!selected) {
    if (options.donor.phone) {
      await notifyDonorWhatsApp(options.settings, {
        donorId: options.donor.id,
        phone: options.donor.phone,
        chatId: options.replyChatId,
        replyToMessageId: options.replyToMessageId,
        message: `No reconocimos su respuesta. Responda solo con el número de la opción (1-${slots.length}).\n\n${buildSlotSelectionMessage({
          donorName: options.donor.name,
          siteName: options.settings.siteName,
          slots,
        })}`,
      });
    }
    return { ignored: true, reason: "Selección inválida" };
  }

  try {
    const appointment = await confirmAppointment({
      settings: options.settings,
      donor: options.donor,
      scheduledAt: new Date(selected.scheduledAt),
      bookingSessionId: options.session.id,
      replyChatId: options.replyChatId,
      replyToMessageId: options.replyToMessageId,
    });
    return {
      ok: true,
      step: "confirmed",
      donorId: options.donor.id,
      scheduledAt: appointment.scheduledAt.toISOString(),
      googleEventId: appointment.googleEventId,
      deliveryFailed: appointment.deliveryFailed ?? false,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo agendar la cita", status: 500 };
  }
}

export async function processOpenWaInboundMessage(
  settings: Settings,
  msg: InboundMessage,
): Promise<InboundResult> {
  const { from, chatId, body, messageId, senderPhone, source } = msg;

  if (!from || !body) {
    return { ignored: true, reason: "Mensaje incompleto" };
  }

  const waCtx = openWaContext(settings);
  const donor = await findDonorByOpenWaContact(from, waCtx, { senderPhone });

  if (!donor || !donor.phone) {
    const phoneHint = senderPhone || from.replace(/@c\.us$/i, "").replace(/\D/g, "");
    const notAccepted = phoneHint ? await findInactiveAcceptedDonorByPhone(phoneHint) : null;
    if (notAccepted?.phone && openWaConfigured(settings)) {
      await notifyDonorWhatsApp(settings, {
        donorId: notAccepted.id,
        phone: notAccepted.phone,
        chatId: chatId.includes("@") ? chatId : from,
        message:
          "Hola, su registro aparece como no aceptado en el sistema. Contacte al banco de sangre para actualizar su ficha antes de agendar.",
      }).catch(() => {});
    }
    return {
      ignored: true,
      reason: notAccepted ? "Donante no aceptado" : "Donante no encontrado",
    };
  }

  const replyChatId =
    (chatId.includes("@") ? chatId : from.includes("@") ? from : "") ||
    donor?.whatsappChatId ||
    "";
  let replyToMessageId = messageId || undefined;
  if (replyChatId.endsWith("@lid") && openWaConfigured(settings)) {
    const openWaMessageId = await resolveLatestIncomingMessageId(waCtx, replyChatId);
    if (openWaMessageId) replyToMessageId = openWaMessageId;
  }

  const activeSession = await getActiveBookingSession(donor.id);

  if (activeSession) {
    const slots = deserializeSlots(activeSession.slotsJson);
    if (parseSlotSelection(body, slots)) {
      return handleSlotSelection({
        settings,
        donor,
        body,
        replyChatId,
        replyToMessageId,
        session: activeSession,
      });
    }
    if (isAffirmativeReply(body) && slots.length) {
      try {
        await notifyDonorWhatsApp(settings, {
          donorId: donor.id,
          phone: donor.phone,
          chatId: replyChatId,
          replyToMessageId,
          message: buildSlotSelectionMessage({
            donorName: donor.name,
            siteName: settings.siteName,
            slots,
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al reenviar fechas";
        return {
          ok: true,
          step: "awaiting_slot_selection",
          donorId: donor.id,
          options: slots.length,
          resent: true,
          deliveryFailed: true,
          error: msg,
        };
      }
      return {
        ok: true,
        step: "awaiting_slot_selection",
        donorId: donor.id,
        options: slots.length,
        resent: true,
      };
    }
    return handleSlotSelection({
      settings,
      donor,
      body,
      replyChatId,
      replyToMessageId,
      session: activeSession,
    });
  }

  if (isAffirmativeReply(body)) {
    return handleAffirmativeReply({ settings, donor, replyChatId, replyToMessageId });
  }

  return { ignored: true, reason: "No es una respuesta afirmativa" };
}
