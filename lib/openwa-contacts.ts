import { fetchWithTimeout } from "./fetch-timeout";
import { prisma } from "./prisma";
import { normalizePhone } from "./whatsapp";
import { openWaHeaders, resolveOpenWaSessionUuid } from "./openwa-session";

type OpenWaContext = {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
};

const MIN_PHONE_DIGITS = 10;

/** Coincidencia estricta (evita falsos positivos con 1 dígito, p. ej. teléfono "0" o "3"). */
export function donorPhoneDigitsMatch(storedPhone: string | null, phoneDigits: string): boolean {
  const normalized = normalizePhone(storedPhone);
  const incoming = normalizePhone(phoneDigits) ?? phoneDigits.replace(/\D/g, "");
  if (!normalized || !incoming) return false;
  if (normalized.length < MIN_PHONE_DIGITS || incoming.length < MIN_PHONE_DIGITS) return false;
  if (normalized === incoming) return true;
  return normalized.slice(-10) === incoming.slice(-10);
}

function usablePhoneDigits(raw: string | null | undefined): string {
  const normalized = normalizePhone(raw ?? undefined);
  if (normalized && normalized.length >= MIN_PHONE_DIGITS) return normalized;
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS ? digits : "";
}

export async function resolveOpenWaContactPhone(
  ctx: OpenWaContext,
  contactId: string,
): Promise<string | null> {
  if (!contactId.includes("@")) return null;

  const sessionUuid = await resolveOpenWaSessionUuid({
    baseUrl: ctx.baseUrl,
    apiKey: ctx.apiKey,
    sessionId: ctx.sessionId,
  });
  const base = ctx.baseUrl.replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/contacts/${encodeURIComponent(contactId)}/phone`,
    { headers: openWaHeaders(ctx.apiKey), timeoutMs: 8000 },
  );

  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as
    | string
    | number
    | { phone?: string | number | null; number?: string | number | null }
    | null;

  let digits = "";
  if (typeof data === "string" || typeof data === "number") {
    digits = String(data).replace(/\D/g, "");
  } else {
    const raw = data?.phone ?? data?.number;
    if (raw != null) digits = String(raw).replace(/\D/g, "");
  }

  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

async function matchDonorByPhoneDigits(phoneDigits: string, acceptedOnly: boolean) {
  const incoming = usablePhoneDigits(phoneDigits);
  if (!incoming) return null;

  const last10 = incoming.slice(-10);
  const candidates = await prisma.donor.findMany({
    where: {
      active: true,
      ...(acceptedOnly ? { accepted: true } : {}),
      phone: { not: null },
      OR: [{ phone: { endsWith: last10 } }, { phone: { contains: last10 } }],
    },
    take: 25,
  });

  const matches = candidates.filter((item) => donorPhoneDigitsMatch(item.phone, incoming));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const exact = matches.find((item) => normalizePhone(item.phone) === incoming);
  return exact ?? null;
}

export async function findDonorByOpenWaContact(
  from: string,
  ctx?: OpenWaContext,
  options?: { senderPhone?: string | null },
) {
  const chatId = from.trim();
  if (!chatId) return null;

  let phoneDigits = "";
  if (/@c\.us$/i.test(chatId)) {
    phoneDigits = usablePhoneDigits(chatId.replace(/@c\.us$/i, ""));
  } else if (chatId.endsWith("@lid")) {
    phoneDigits = usablePhoneDigits(options?.senderPhone);
    if (!phoneDigits && ctx) {
      const resolved = await resolveOpenWaContactPhone(ctx, chatId);
      if (resolved) phoneDigits = resolved;
    }
  } else {
    phoneDigits = usablePhoneDigits(chatId);
  }

  const byChatId = await prisma.donor.findFirst({
    where: { active: true, accepted: true, whatsappChatId: chatId },
  });

  if (byChatId) {
    if (!phoneDigits || donorPhoneDigitsMatch(byChatId.phone, phoneDigits)) {
      return byChatId;
    }
  }

  if (!phoneDigits) {
    return null;
  }

  const donor = await matchDonorByPhoneDigits(phoneDigits, true);

  if (donor && chatId.includes("@") && donor.whatsappChatId !== chatId) {
    await prisma.donor
      .update({
        where: { id: donor.id },
        data: { whatsappChatId: chatId },
      })
      .catch(() => {});
  }

  return donor;
}

/** Para diagnóstico: donante activo pero no aceptado (no recibe agendamiento). */
export async function findInactiveAcceptedDonorByPhone(phoneDigits: string) {
  if (!usablePhoneDigits(phoneDigits)) return null;
  const incoming = usablePhoneDigits(phoneDigits);
  const last10 = incoming.slice(-10);
  const donors = await prisma.donor.findMany({
    where: { active: true, accepted: false, phone: { not: null }, OR: [{ phone: { endsWith: last10 } }] },
    take: 25,
  });
  return donors.find((item) => donorPhoneDigitsMatch(item.phone, incoming)) ?? null;
}

export async function persistDonorWhatsAppChatId(donorId: string, chatId: string | undefined) {
  if (!chatId?.includes("@")) return;
  await prisma.donor
    .update({
      where: { id: donorId },
      data: { whatsappChatId: chatId },
    })
    .catch(() => {});
}
