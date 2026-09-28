import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, resolveOpenWaWebhookSecret } from "@/lib/settings";
import {
  findDonorByOpenWaContact,
  findInactiveAcceptedDonorByPhone,
  persistDonorWhatsAppChatId,
} from "@/lib/openwa-contacts";
import { resolveLatestIncomingMessageId } from "@/lib/openwa-send";
import { openWaConfigured, sendOpenWaMessage } from "@/lib/whatsapp";
import { isAffirmativeReply } from "@/lib/reminders";
import {
  buildAppointmentConfirmationEmail,
  buildAppointmentWhatsAppMessage,
  createDonorAppointment,
  googleCalendarConfigured,
} from "@/lib/google-calendar";
import { sendEmail, smtpConfigured } from "@/lib/email";
import { formatDate } from "@/lib/dates";
import {
  buildSlotSelectionMessage,
  completeBookingSession,
  createBookingSession,
  deserializeSlots,
  generateAvailableSlots,
  getActiveBookingSession,
  parseSlotSelection,
} from "@/lib/appointment-booking";
import {
  extractOpenWaWebhookMessage,
  verifyOpenWaWebhookSignature,
  type OpenWaWebhookPayload,
} from "@/lib/openwa-webhook";

async function notifyDonorWhatsApp(
  settings: Awaited<ReturnType<typeof getSettings>>,
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

function openWaContext(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    baseUrl: settings.whatsappOpenWaUrl,
    apiKey: settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "",
    sessionId: settings.whatsappOpenWaSessionId,
  };
}

async function confirmAppointment(options: {
  settings: Awaited<ReturnType<typeof getSettings>>;
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
  let calendarError: string | null = null;

  const calendarConfigured = googleCalendarConfigured(options.settings);
  // #region agent log
  const { agentDebugLog } = await import("@/lib/debug-log");
  agentDebugLog({
    location: "openwa:confirmAppointment",
    message: "Confirm appointment calendar check",
    data: {
      calendarConfigured,
      donorId: options.donor.id,
      scheduledAt: options.scheduledAt.toISOString(),
    },
    hypothesisId: "H4",
  });
  // #endregion
  if (calendarConfigured) {
    try {
      appointment = await createDonorAppointment({
        settings: options.settings,
        donorName: options.donor.name,
        donorEmail: options.donor.email,
        bloodType: options.donor.bloodType,
        scheduledAt: options.scheduledAt,
      });
    } catch (error) {
      calendarError = error instanceof Error ? error.message : "Error al crear evento en Google Calendar";
      // #region agent log
      agentDebugLog({
        location: "openwa:confirmAppointment",
        message: "Calendar event creation failed",
        data: { calendarError },
        hypothesisId: "H5",
      });
      // #endregion
      appointment = {
        scheduledAt: options.scheduledAt,
        googleEventId: null,
        formattedDate: formatDate(options.scheduledAt),
        formattedTime: options.scheduledAt.toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Bogota",
        }),
      };
    }
  } else {
    calendarError = "Google Calendar no conectado";
    appointment = {
      scheduledAt: options.scheduledAt,
      googleEventId: null,
      formattedDate: formatDate(options.scheduledAt),
      formattedTime: options.scheduledAt.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Bogota",
      }),
    };
  }

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
      sitePhone: options.settings.sitePhone,
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

async function resendSlotSelection(options: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  donor: NonNullable<Awaited<ReturnType<typeof findDonorByOpenWaContact>>>;
  replyChatId: string;
  replyToMessageId?: string;
  slots: ReturnType<typeof deserializeSlots>;
}) {
  if (!options.donor.phone) {
    return NextResponse.json({ error: "Donante sin teléfono" }, { status: 400 });
  }

  await notifyDonorWhatsApp(options.settings, {
    donorId: options.donor.id,
    phone: options.donor.phone,
    chatId: options.replyChatId,
    replyToMessageId: options.replyToMessageId,
    message: buildSlotSelectionMessage({
      donorName: options.donor.name,
      siteName: options.settings.siteName,
      slots: options.slots,
    }),
  });

  return NextResponse.json({
    ok: true,
    step: "awaiting_slot_selection",
    donorId: options.donor.id,
    options: options.slots.length,
    resent: true,
  });
}

async function handleSlotSelection(options: {
  settings: Awaited<ReturnType<typeof getSettings>>;
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
    return NextResponse.json({ ignored: true, reason: "Selección inválida" });
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

    return NextResponse.json({
      ok: true,
      step: "confirmed",
      donorId: options.donor.id,
      scheduledAt: appointment.scheduledAt.toISOString(),
      googleEventId: appointment.googleEventId,
      deliveryFailed: appointment.deliveryFailed ?? false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo agendar la cita";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleAffirmativeReply(options: {
  settings: Awaited<ReturnType<typeof getSettings>>;
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
    return NextResponse.json({ ignored: true, reason: "Ya tiene cita pendiente" });
  }

  const slots = await generateAvailableSlots();
  // #region agent log
  const { agentDebugLog: logAffirmative } = await import("@/lib/debug-log");
  logAffirmative({
    location: "openwa:handleAffirmativeReply",
    message: "Generated slots for donor",
    data: { donorId: options.donor.id, slotCount: slots.length },
    hypothesisId: "H8",
  });
  // #endregion
  if (!slots.length) {
    if (options.donor.phone) {
      await notifyDonorWhatsApp(options.settings, {
        donorId: options.donor.id,
        phone: options.donor.phone,
        chatId: options.replyChatId,
        replyToMessageId: options.replyToMessageId,
        message: `Hola ${options.donor.name}, no hay fechas disponibles en este momento. Por favor contacte a ${options.settings.sitePhone || options.settings.siteName}.`,
      }).catch(() => {});
    }
    return NextResponse.json({ error: "Sin fechas disponibles" }, { status: 503 });
  }

  if (!options.donor.phone) {
    return NextResponse.json({ error: "Donante sin teléfono" }, { status: 400 });
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
    // #region agent log
    logAffirmative({
      location: "openwa:handleAffirmativeReply",
      message: "Failed to send slot options",
      data: { donorId: options.donor.id, error: msg },
      hypothesisId: "H13",
      runId: "post-fix",
    });
    // #endregion
    return NextResponse.json({
      ok: true,
      step: "awaiting_slot_selection",
      donorId: options.donor.id,
      options: slots.length,
      deliveryFailed: true,
      error: msg,
    });
  }

  return NextResponse.json({
    ok: true,
    step: "awaiting_slot_selection",
    donorId: options.donor.id,
    options: slots.length,
  });
}

export async function POST(request: Request) {
  try {
    return await handleOpenWaWebhook(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error procesando webhook";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleOpenWaWebhook(request: Request) {
  const settings = await getSettings();
  const webhookSecret = resolveOpenWaWebhookSecret(settings.openwaWebhookSecret);

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook sin secreto configurado en el servidor" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-openwa-signature");
  const legacySecret = request.headers.get("x-webhook-secret");
  const headerEvent = request.headers.get("x-openwa-event");
  // #region agent log
  const { agentDebugLog: logEntry } = await import("@/lib/debug-log");
  logEntry({
    location: "openwa:webhook:entry",
    message: "Webhook POST received",
    data: {
      hasSignature: Boolean(signature),
      headerEvent: headerEvent ?? null,
      bodyBytes: rawBody.length,
    },
    hypothesisId: "H11",
    runId: "post-fix",
  });
  // #endregion
  const authorized =
    verifyOpenWaWebhookSignature(rawBody, signature, webhookSecret) ||
    Boolean(legacySecret && legacySecret === webhookSecret);

  if (!authorized) {
    // #region agent log
    const { agentDebugLog: logAuth } = await import("@/lib/debug-log");
    logAuth({
      location: "openwa:webhook",
      message: "Webhook unauthorized",
      data: { hasSignature: Boolean(signature), hasLegacySecret: Boolean(legacySecret) },
      hypothesisId: "H9",
    });
    // #endregion
    return NextResponse.json({ error: "Webhook no autorizado" }, { status: 401 });
  }

  let payload: OpenWaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as OpenWaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { from, chatId, body, messageId, senderPhone, fromMe, isGroup, event } =
    extractOpenWaWebhookMessage(payload);
  const effectiveEvent = event || headerEvent || "";

  if (fromMe || isGroup) {
    return NextResponse.json({ ignored: true, reason: "Mensaje propio o de grupo" });
  }

  if (effectiveEvent && effectiveEvent !== "message.received") {
    return NextResponse.json({ ignored: true, reason: "Evento no soportado" });
  }

  if (!from || !body) {
    // #region agent log
    logEntry({
      location: "openwa:webhook",
      message: "Incomplete webhook message",
      data: { fromSuffix: from.slice(-12), bodyLen: body.length, type: payload.data?.type ?? null },
      hypothesisId: "H12",
      runId: "post-fix",
    });
    // #endregion
    return NextResponse.json({ ignored: true, reason: "Mensaje incompleto" });
  }

  const waCtx = openWaContext(settings);
  const donor = await findDonorByOpenWaContact(from, waCtx, { senderPhone });
  // #region agent log
  const { agentDebugLog } = await import("@/lib/debug-log");
  agentDebugLog({
    location: "openwa:webhook",
    message: "Incoming WhatsApp message",
    data: {
      fromSuffix: from.slice(-12),
      chatIdSuffix: chatId.slice(-12),
      bodyPreview: body.slice(0, 40),
      senderPhoneHint: senderPhone ? senderPhone.slice(-4) : null,
      donorFound: Boolean(donor),
      donorHasPhone: Boolean(donor?.phone),
      openWaConfigured: openWaConfigured(settings),
      isAffirmative: isAffirmativeReply(body),
    },
    hypothesisId: "H7",
    runId: "post-fix",
  });
  // #endregion
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
    return NextResponse.json({
      ignored: true,
      reason: notAccepted ? "Donante no aceptado" : "Donante no encontrado",
    });
  }

  const replyChatId = chatId.includes("@") ? chatId : from.includes("@") ? from : "";
  let replyToMessageId = messageId || undefined;
  if (replyChatId.endsWith("@lid") && openWaConfigured(settings)) {
    const openWaMessageId = await resolveLatestIncomingMessageId(
      openWaContext(settings),
      replyChatId,
    );
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
      return resendSlotSelection({
        settings,
        donor,
        replyChatId,
        replyToMessageId,
        slots,
      });
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

  return NextResponse.json({ ignored: true, reason: "No es una respuesta afirmativa" });
}

