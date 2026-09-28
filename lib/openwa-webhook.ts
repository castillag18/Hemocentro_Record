import { createHmac, timingSafeEqual } from "crypto";

export function verifyOpenWaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!secret.trim() || !signatureHeader?.trim()) return false;

  const provided = signatureHeader.trim();
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedPrefixed = `sha256=${expectedHex}`;

  const candidates = [provided, provided.startsWith("sha256=") ? provided : `sha256=${provided}`];

  for (const candidate of candidates) {
    try {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expectedPrefixed);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* try next */
    }
  }

  try {
    const a = Buffer.from(provided.replace(/^sha256=/i, ""));
    const b = Buffer.from(expectedHex);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  } catch {
    return false;
  }

  return false;
}

export type OpenWaWebhookPayload = {
  event?: string;
  sessionId?: string;
  data?: {
    id?: string;
    messageId?: string;
    waMessageId?: string;
    from?: string;
    body?: string;
    text?: string;
    senderPhone?: string | number | null;
    fromMe?: boolean;
    isGroup?: boolean;
    type?: string;
    chatId?: string;
    contact?: { id?: string; number?: string; name?: string; pushName?: string };
    message?: { id?: string; body?: string; text?: string };
    selectedButtonId?: string;
    selectedRowId?: string;
  };
  from?: string;
  body?: string;
  id?: string;
  messageId?: string;
};

function pickTextBody(payload: OpenWaWebhookPayload) {
  const data = payload.data;
  const direct =
    data?.body ??
    data?.text ??
    data?.message?.body ??
    data?.message?.text ??
    payload.body ??
    "";
  if (String(direct).trim()) return String(direct);
  if (data?.selectedButtonId) return String(data.selectedButtonId);
  if (data?.selectedRowId) return String(data.selectedRowId);
  return "";
}

function pickSenderPhone(payload: OpenWaWebhookPayload) {
  for (const raw of [payload.data?.senderPhone, payload.data?.contact?.number]) {
    if (raw == null) continue;
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length >= 10) return digits;
  }
  return "";
}

export function extractOpenWaWebhookMessage(payload: OpenWaWebhookPayload) {
  const chatId = payload.data?.chatId ?? "";
  const from = payload.data?.from ?? chatId ?? payload.from ?? "";
  const body = pickTextBody(payload);
  const messageId =
    payload.data?.id ??
    payload.data?.messageId ??
    payload.data?.waMessageId ??
    payload.data?.message?.id ??
    payload.id ??
    payload.messageId ??
    "";
  return {
    from: String(from),
    chatId: String(chatId || from),
    body,
    messageId: String(messageId),
    senderPhone: pickSenderPhone(payload),
    fromMe: Boolean(payload.data?.fromMe),
    isGroup: Boolean(payload.data?.isGroup),
    event: payload.event ?? "",
    type: payload.data?.type ?? "",
  };
}
