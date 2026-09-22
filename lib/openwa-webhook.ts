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
    fromMe?: boolean;
    isGroup?: boolean;
    type?: string;
    chatId?: string;
    message?: { id?: string; body?: string; text?: string };
  };
  from?: string;
  body?: string;
  id?: string;
  messageId?: string;
};

export function extractOpenWaWebhookMessage(payload: OpenWaWebhookPayload) {
  const from = payload.data?.from ?? payload.data?.chatId ?? payload.from ?? "";
  const body =
    payload.data?.body ??
    payload.data?.text ??
    payload.data?.message?.body ??
    payload.data?.message?.text ??
    payload.body ??
    "";
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
    body: String(body),
    messageId: String(messageId),
    fromMe: Boolean(payload.data?.fromMe),
    isGroup: Boolean(payload.data?.isGroup),
    event: payload.event ?? "",
    type: payload.data?.type ?? "",
  };
}
