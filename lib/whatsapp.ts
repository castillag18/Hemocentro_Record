export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = `57${digits}`;
  }
  return digits;
}

export function toWhatsAppChatId(phone: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `${normalized}@c.us`;
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export async function sendWhatsAppApiMessage(options: {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  to: string;
  message: string;
  imageUrl?: string;
}) {
  const normalized = normalizePhone(options.to);
  if (!normalized) {
    throw new Error("Teléfono inválido para WhatsApp API");
  }

  const url = `https://graph.facebook.com/${options.apiVersion}/${options.phoneNumberId}/messages`;
  const payload = options.imageUrl
    ? {
        messaging_product: "whatsapp",
        to: normalized,
        type: "image",
        image: {
          link: options.imageUrl,
          caption: options.message,
        },
      }
    : {
        messaging_product: "whatsapp",
        to: normalized,
        type: "text",
        text: { body: options.message },
      };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message ?? "Error al enviar WhatsApp API");
  }

  return data;
}

import { resolveOpenWaSessionUuid, openWaHeaders } from "./openwa-session";
import { sendOpenWaTextMessage } from "./openwa-send";

function resolvePublicMediaUrl(imageUrl: string, appBaseUrl: string) {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}${imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}`;
}

export async function sendOpenWaMessage(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  to: string;
  message: string;
  chatId?: string;
  replyToMessageId?: string;
  imageUrl?: string;
  appBaseUrl?: string;
  skipDeliveryConfirm?: boolean;
}) {
  if (options.imageUrl) {
    const chatId = toWhatsAppChatId(options.to);
    if (!chatId) throw new Error("Teléfono inválido para OpenWA");

    const base = options.baseUrl.replace(/\/$/, "");
    const sessionUuid = await resolveOpenWaSessionUuid({
      baseUrl: base,
      apiKey: options.apiKey,
      sessionId: options.sessionId || "default",
    });
    const headers = openWaHeaders(options.apiKey);
    const publicUrl = resolvePublicMediaUrl(
      options.imageUrl,
      options.appBaseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    );
    const res = await fetch(
      `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/messages/send-image`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          chatId,
          url: publicUrl,
          caption: options.message,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok && res.status !== 201) {
      throw new Error(data.message ?? data.error ?? "Error al enviar imagen con OpenWA");
    }
    return data;
  }

  return sendOpenWaTextMessage({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    sessionId: options.sessionId,
    to: options.to,
    text: options.message,
    chatId: options.chatId,
    replyToMessageId: options.replyToMessageId,
    skipDeliveryConfirm: options.skipDeliveryConfirm,
  });
}

export function openWaConfigured(settings: {
  whatsappMode: string;
  whatsappOpenWaUrl: string;
  whatsappOpenWaSessionId: string;
  whatsappOpenWaApiKey?: string;
}) {
  const apiKey = settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  return (
    settings.whatsappMode === "openwa" &&
    Boolean(settings.whatsappOpenWaUrl && settings.whatsappOpenWaSessionId && apiKey)
  );
}
