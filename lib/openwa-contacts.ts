import { prisma } from "./prisma";
import { normalizePhone } from "./whatsapp";
import { openWaHeaders, resolveOpenWaSessionUuid } from "./openwa-session";

type OpenWaContext = {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
};

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
  const res = await fetch(
    `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/contacts/${encodeURIComponent(contactId)}/phone`,
    { headers: openWaHeaders(ctx.apiKey) },
  );

  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as
    | string
    | number
    | { phone?: string | number | null; number?: string | number | null }
    | null;

  if (typeof data === "string" || typeof data === "number") {
    const digits = String(data).replace(/\D/g, "");
    return digits || null;
  }

  const raw = data?.phone ?? data?.number;
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits || null;
}

export async function findDonorByOpenWaContact(
  from: string,
  ctx?: OpenWaContext,
) {
  const chatId = from.trim();
  if (!chatId) return null;

  const byChatId = await prisma.donor.findFirst({
    where: { active: true, accepted: true, whatsappChatId: chatId },
  });
  if (byChatId) return byChatId;

  let phoneDigits = chatId.replace(/@c\.us$/i, "").replace(/\D/g, "");

  if (chatId.endsWith("@lid") && ctx) {
    const resolved = await resolveOpenWaContactPhone(ctx, chatId);
    if (resolved) phoneDigits = resolved;
  }

  if (!phoneDigits) return null;

  const donors = await prisma.donor.findMany({
    where: { active: true, accepted: true, phone: { not: null } },
  });

  const donor =
    donors.find((item) => {
      const normalized = normalizePhone(item.phone);
      return (
        normalized === phoneDigits ||
        normalized?.endsWith(phoneDigits.slice(-10)) ||
        phoneDigits.endsWith((normalized ?? "").slice(-10))
      );
    }) ?? null;

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

export async function persistDonorWhatsAppChatId(donorId: string, chatId: string | undefined) {
  if (!chatId?.includes("@")) return;
  await prisma.donor
    .update({
      where: { id: donorId },
      data: { whatsappChatId: chatId },
    })
    .catch(() => {});
}
