import { createRequire } from "module";
import { findDonorByOpenWaContact, resolveOpenWaContactPhone } from "../lib/openwa-contacts";
import { openWaHeaders, resolveOpenWaSessionUuid } from "../lib/openwa-session";
import { fetchWithTimeout } from "../lib/fetch-timeout";
import { isAffirmativeReply } from "../lib/reminders";
import { getSettings } from "../lib/settings";
import { prisma } from "../lib/prisma";

const require = createRequire(import.meta.url);
require("./load-env.cjs").loadEnv();

async function main() {
  const settings = await getSettings();
  const ctx = {
    baseUrl: settings.whatsappOpenWaUrl,
    apiKey: settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "",
    sessionId: settings.whatsappOpenWaSessionId,
  };
  const sessionUuid = await resolveOpenWaSessionUuid(ctx);
  const base = ctx.baseUrl.replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/messages?limit=15`,
    { headers: openWaHeaders(ctx.apiKey), timeoutMs: 8000 },
  );
  const data = (await res.json().catch(() => ({}))) as {
    messages?: Array<{
      id?: string;
      body?: string;
      text?: string;
      chatId?: string;
      direction?: string;
      type?: string;
      createdAt?: string;
    }>;
  };

  console.log("session:", sessionUuid);
  console.log("incoming messages (last 15):");
  for (const message of (data.messages ?? []).filter((m) => m.direction === "incoming")) {
    const body = String(message.body ?? message.text ?? "").trim();
    const chatId = message.chatId ?? "";
    let senderPhone: string | null = null;
    if (chatId.endsWith("@lid")) {
      senderPhone = await resolveOpenWaContactPhone(ctx, chatId).catch(() => null);
    }
    const donor = await findDonorByOpenWaContact(chatId, ctx, { senderPhone });
    const processed = message.id
      ? await prisma.openWaProcessedMessage.findUnique({ where: { messageId: message.id } })
      : null;

    console.log("---");
    console.log("id:", message.id);
    console.log("chatId:", chatId);
    console.log("body:", body);
    console.log("affirmative:", isAffirmativeReply(body));
    console.log("senderPhone:", senderPhone ?? "(none)");
    console.log("donor:", donor ? `${donor.name} (${donor.phone})` : "NO ENCONTRADO");
    console.log("processed:", processed ? processed.source : "no");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
