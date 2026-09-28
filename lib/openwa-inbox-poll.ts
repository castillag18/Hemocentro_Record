import { fetchWithTimeout } from "./fetch-timeout";
import { prisma } from "./prisma";
import { agentDebugLog } from "./debug-log";
import { resolveOpenWaContactPhone } from "./openwa-contacts";
import { openWaHeaders, resolveOpenWaSessionUuid } from "./openwa-session";
import { processOpenWaInboundMessage } from "./openwa-inbound";
import { getSettings } from "./settings";
import { openWaConfigured } from "./whatsapp";

const POLL_WINDOW_MS = 48 * 60 * 60 * 1000;

type OpenWaListedMessage = {
  id?: string;
  body?: string | null;
  text?: string | null;
  chatId?: string;
  direction?: string;
  createdAt?: string;
  type?: string;
  selectedButtonId?: string;
  selectedRowId?: string;
};

function extractMessageBody(message: OpenWaListedMessage) {
  return String(
    message.body?.trim() ||
      message.text?.trim() ||
      message.selectedButtonId?.trim() ||
      message.selectedRowId?.trim() ||
      "",
  ).trim();
}

function shouldMarkMessageProcessed(result: Record<string, unknown>) {
  if (result.ok === true) {
    return result.deliveryFailed !== true;
  }
  if (result.error) return true;
  if (result.ignored === true) {
    const reason = String(result.reason ?? "");
    if (
      reason === "No es una respuesta afirmativa" ||
      reason === "Donante no encontrado" ||
      reason === "Donante no aceptado" ||
      reason === "Mensaje incompleto"
    ) {
      return false;
    }
    return true;
  }
  return false;
}

async function isMessageProcessed(messageId: string) {
  const row = await prisma.openWaProcessedMessage.findUnique({ where: { messageId } });
  return Boolean(row);
}

async function markMessageProcessed(messageId: string, source: string) {
  await prisma.openWaProcessedMessage
    .create({
      data: { messageId, source },
    })
    .catch(() => {});
}

async function fetchRecentIncomingMessages(settings: Awaited<ReturnType<typeof getSettings>>) {
  const ctx = {
    baseUrl: settings.whatsappOpenWaUrl,
    apiKey: settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "",
    sessionId: settings.whatsappOpenWaSessionId,
  };
  const sessionUuid = await resolveOpenWaSessionUuid(ctx);
  const base = ctx.baseUrl.replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/messages?limit=40`,
    { headers: openWaHeaders(ctx.apiKey), timeoutMs: 8000 },
  );
  const data = (await res.json().catch(() => ({}))) as { messages?: OpenWaListedMessage[] };
  if (!res.ok || !data.messages?.length) return [];

  const since = Date.now() - POLL_WINDOW_MS;
  return data.messages.filter((message) => {
    if (message.direction !== "incoming") return false;
    if (!message.id || !extractMessageBody(message)) return false;
    if (message.type && !["text", "buttons_response", "list_response"].includes(message.type)) {
      return false;
    }
    if (message.createdAt) {
      return new Date(message.createdAt).getTime() >= since;
    }
    return true;
  });
}

/** Respaldo cuando el webhook no llega (Docker/LAN). Consulta bandeja OpenWA y procesa respuestas. */
export async function pollOpenWaInbox(settingsInput?: Awaited<ReturnType<typeof getSettings>>) {
  const settings = settingsInput ?? (await getSettings());
  if (!openWaConfigured(settings)) {
    return { processed: 0, skipped: 0, error: "OpenWA no configurado" };
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const results: Awaited<ReturnType<typeof processOpenWaInboundMessage>>[] = [];

  try {
    const messages = await fetchRecentIncomingMessages(settings);
    agentDebugLog({
      location: "openwa:poll",
      message: "Inbox poll fetched messages",
      data: { incomingCount: messages.length },
      hypothesisId: "H14",
      runId: "post-fix",
    });

    for (const message of messages) {
      const messageId = message.id!;
      if (await isMessageProcessed(messageId)) {
        skipped += 1;
        continue;
      }

      const chatId = message.chatId ?? "";
      const from = chatId.includes("@") ? chatId : chatId;
      const body = extractMessageBody(message);
      const ctx = {
        baseUrl: settings.whatsappOpenWaUrl,
        apiKey: settings.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "",
        sessionId: settings.whatsappOpenWaSessionId,
      };
      let senderPhone: string | undefined;
      if (from.endsWith("@lid")) {
        const resolved = await resolveOpenWaContactPhone(ctx, from).catch(() => null);
        if (resolved) senderPhone = resolved;
      }

      let result: Awaited<ReturnType<typeof processOpenWaInboundMessage>>;
      try {
        result = await processOpenWaInboundMessage(settings, {
          from,
          chatId: from,
          body,
          messageId,
          senderPhone,
          source: "poll",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al procesar mensaje";
        errors.push(`${messageId}: ${msg}`);
        await markMessageProcessed(messageId, "poll-error");
        skipped += 1;
        continue;
      }

      agentDebugLog({
        location: "openwa:poll",
        message: "Message processed",
        data: {
          messageId,
          chatSuffix: from.slice(-15),
          bodyPreview: body.slice(0, 30),
          senderPhone: senderPhone ? `***${senderPhone.slice(-4)}` : null,
          result,
        },
        hypothesisId: "H15",
        runId: "post-fix",
      });

      if (shouldMarkMessageProcessed(result as Record<string, unknown>)) {
        await markMessageProcessed(messageId, "poll");
        processed += 1;
        results.push(result);
      } else {
        skipped += 1;
      }
    }

    if (processed > 0) {
      await prisma.openWaProcessedMessage.deleteMany({
        where: { processedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      });
    }

    return {
      processed,
      skipped,
      results,
      ...(errors.length ? { warnings: errors } : {}),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error al consultar bandeja OpenWA";
    agentDebugLog({
      location: "openwa:poll",
      message: "Inbox poll failed",
      data: { error },
      hypothesisId: "H14",
      runId: "post-fix",
    });
    return { processed, skipped, error };
  }
}
