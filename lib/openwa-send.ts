import { normalizePhone } from "./whatsapp";
import { openWaHeaders, resolveOpenWaSessionUuid } from "./openwa-session";

type SendContext = {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
};

async function parseOpenWaJson(res: Response) {
  return (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
    messageId?: string;
    messages?: Array<{
      id?: string;
      body?: string | null;
      chatId?: string;
      direction?: string;
      status?: string;
      createdAt?: string;
      waMessageId?: string | null;
    }>;
  };
}

function formatOpenWaError(data: { message?: string | string[]; error?: string }, fallback: string) {
  const raw = Array.isArray(data.message) ? data.message.join(", ") : (data.message ?? data.error ?? fallback);
  if (/internal server error/i.test(raw)) {
    return "OpenWA no pudo entregar el mensaje por WhatsApp. Ejecute npm run openwa:restart-session, escanee el QR y vuelva a intentar.";
  }
  return raw;
}

export async function resolveOpenWaChatId(
  ctx: SendContext & { sessionUuid: string; phone: string },
) {
  const normalized = normalizePhone(ctx.phone);
  if (!normalized) throw new Error("Teléfono inválido para OpenWA");

  const base = ctx.baseUrl.replace(/\/$/, "");
  const res = await fetch(
    `${base}/api/sessions/${encodeURIComponent(ctx.sessionUuid)}/contacts/check/${normalized}`,
    { headers: openWaHeaders(ctx.apiKey) },
  );
  const data = await parseOpenWaJson(res);
  if (!res.ok) {
    throw new Error(formatOpenWaError(data, "No se pudo verificar el número en WhatsApp"));
  }

  const exists = (data as { exists?: boolean }).exists;
  if (exists === false) {
    throw new Error("El número no está registrado en WhatsApp");
  }

  const whatsappId = (data as { whatsappId?: string | null }).whatsappId;
  // OpenWA send-text es más estable con @c.us; @lid se guarda aparte para webhooks/reply.
  if (whatsappId?.endsWith("@lid")) return `${normalized}@c.us`;
  if (whatsappId) return whatsappId;
  return `${normalized}@c.us`;
}

function chatIdsMatch(stored: string | null | undefined, expected: string, normalized: string) {
  if (!stored) return false;
  if (stored === expected) return true;
  const storedDigits = stored.replace(/\D/g, "");
  return storedDigits.includes(normalized) || normalized.includes(storedDigits.slice(0, 12));
}

export async function resolveLatestIncomingMessageId(
  ctx: SendContext,
  chatId: string,
  sessionUuid?: string,
) {
  const uuid =
    sessionUuid ??
    (await resolveOpenWaSessionUuid({
      baseUrl: ctx.baseUrl,
      apiKey: ctx.apiKey,
      sessionId: ctx.sessionId,
    }));
  const base = ctx.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}/messages?limit=30`, {
    headers: openWaHeaders(ctx.apiKey),
  });
  const data = await parseOpenWaJson(res);
  if (!res.ok || !data.messages?.length) return null;

  const incoming = data.messages.find(
    (message) => message.direction === "incoming" && message.chatId === chatId,
  );
  return incoming?.id ?? null;
}

async function confirmRecentOutgoingDelivery(
  ctx: SendContext & { sessionUuid: string; chatId: string; text: string },
) {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const since = Date.now() - 30_000;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(ctx.sessionUuid)}/messages?limit=20`, {
      headers: openWaHeaders(ctx.apiKey),
    });
    const data = await parseOpenWaJson(res);
    const recent =
      data.messages?.find(
        (message) =>
          message.direction === "outgoing" &&
          message.chatId === ctx.chatId &&
          message.body === ctx.text &&
          message.createdAt &&
          new Date(message.createdAt).getTime() >= since,
      ) ?? null;

    if (recent) {
      if (recent.status === "failed") {
        throw new Error(
          "OpenWA no pudo entregar el mensaje por WhatsApp. Detenga la sesión en OpenWA, vuelva a escanear el QR y pruebe otra vez.",
        );
      }
      if (recent.status === "sent" || recent.status === "delivered" || recent.waMessageId) {
        return recent;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  return null;
}

async function verifyRecentOutgoingMessage(
  ctx: SendContext & { sessionUuid: string; chatId: string; text: string; normalizedPhone: string },
) {
  const base = ctx.baseUrl.replace(/\/$/, "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(ctx.sessionUuid)}/messages?limit=12`, {
      headers: openWaHeaders(ctx.apiKey),
    });
    const data = await parseOpenWaJson(res);
    if (!res.ok || !data.messages?.length) continue;

    const since = Date.now() - 60_000;
    const match =
      data.messages.find(
        (message) =>
          message.direction === "outgoing" &&
          message.status !== "failed" &&
          chatIdsMatch(message.chatId, ctx.chatId, ctx.normalizedPhone) &&
          message.body === ctx.text &&
          message.createdAt &&
          new Date(message.createdAt).getTime() >= since,
      ) ?? null;
    if (match) return match;
  }
  return null;
}

export async function sendOpenWaReplyMessage(
  ctx: SendContext & { chatId: string; quotedMessageId: string; text: string },
) {
  const sessionUuid = await resolveOpenWaSessionUuid({
    baseUrl: ctx.baseUrl,
    apiKey: ctx.apiKey,
    sessionId: ctx.sessionId,
  });
  const base = ctx.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}/messages/reply`, {
    method: "POST",
    headers: openWaHeaders(ctx.apiKey),
    body: JSON.stringify({
      chatId: ctx.chatId,
      quotedMessageId: ctx.quotedMessageId,
      text: ctx.text,
    }),
  });
  const data = await parseOpenWaJson(res);
  if (res.status === 201 || res.ok) {
    const delivered = await confirmRecentOutgoingDelivery({
      baseUrl: ctx.baseUrl,
      apiKey: ctx.apiKey,
      sessionId: ctx.sessionId,
      sessionUuid,
      chatId: ctx.chatId,
      text: ctx.text,
    });
    return {
      messageId: delivered?.id ?? data.messageId ?? "sent",
      chatId: ctx.chatId,
      viaReply: true,
      deliveryStatus: delivered?.status ?? "unknown",
    };
  }
  throw new Error(formatOpenWaError(data, "Error al responder mensaje con OpenWA"));
}

function resolveOutboundChatId(options: { to: string; chatId?: string }) {
  if (options.chatId?.endsWith("@lid")) return options.chatId;
  const normalizedPhone = normalizePhone(options.to);
  if (normalizedPhone) return `${normalizedPhone}@c.us`;
  if (options.chatId?.includes("@")) return options.chatId;
  throw new Error("Teléfono inválido para OpenWA");
}

export async function sendOpenWaTextMessage(
  ctx: SendContext & {
    to: string;
    text: string;
    chatId?: string;
    replyToMessageId?: string;
  },
) {
  const normalizedPhone = normalizePhone(ctx.to);
  if (!normalizedPhone && !ctx.chatId) throw new Error("Teléfono inválido para OpenWA");

  const sessionUuid = await resolveOpenWaSessionUuid({
    baseUrl: ctx.baseUrl,
    apiKey: ctx.apiKey,
    sessionId: ctx.sessionId,
  });
  const chatId = resolveOutboundChatId({ to: ctx.to, chatId: ctx.chatId });
  const base = ctx.baseUrl.replace(/\/$/, "");

  if (ctx.replyToMessageId && ctx.chatId) {
    return sendOpenWaReplyMessage({
      baseUrl: ctx.baseUrl,
      apiKey: ctx.apiKey,
      sessionId: ctx.sessionId,
      chatId,
      quotedMessageId: ctx.replyToMessageId,
      text: ctx.text,
    });
  }

  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}/messages/send-text`, {
    method: "POST",
    headers: openWaHeaders(ctx.apiKey),
    body: JSON.stringify({ chatId, text: ctx.text }),
  });
  const data = await parseOpenWaJson(res);

  if (res.status === 201 || res.ok) {
    const delivered = await confirmRecentOutgoingDelivery({
      ...ctx,
      sessionUuid,
      chatId,
      text: ctx.text,
    });
    return {
      messageId: delivered?.id ?? data.messageId ?? "sent",
      chatId,
      deliveryStatus: delivered?.status ?? "unknown",
    };
  }

  const verified = await verifyRecentOutgoingMessage({
    ...ctx,
    sessionUuid,
    chatId,
    text: ctx.text,
    normalizedPhone: normalizedPhone ?? chatId.replace(/\D/g, ""),
  });

  if (verified) {
    return { messageId: verified.id ?? "verified", chatId, verifiedAfterError: true };
  }

  throw new Error(formatOpenWaError(data, "Error al enviar mensaje con OpenWA"));
}
