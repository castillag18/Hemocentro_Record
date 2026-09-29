import { fetchWithTimeout, getOpenWaFetchTimeoutMs } from "./fetch-timeout";
import { prisma } from "./prisma";
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
  if (result.error && result.deliveryFailed === true) return false;
  if (result.error) return true;
  if (result.ignored === true) {
    const reason = String(result.reason ?? "");
    if (
      reason === "No es una respuesta afirmativa" ||
      reason === "Donante no encontrado" ||
      reason === "Donante no aceptado" ||
      reason === "Mensaje incompleto" ||
      reason === "Selección inválida"
    ) {
      return false;
    }
    if (reason === "Ya tiene cita pendiente") return true;
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
  const base = ctx.baseUrl.replace(/\/$/, "");
  let sessionUuid: string;
  try {
    sessionUuid = await resolveOpenWaSessionUuid(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `OpenWA — listar sesión: ${msg}. Si tarda mucho: docker restart openwa-api y escanee el QR.`,
    );
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${base}/api/sessions/${encodeURIComponent(sessionUuid)}/messages?limit=40`,
      { headers: openWaHeaders(ctx.apiKey), timeoutMs: getOpenWaFetchTimeoutMs() },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `OpenWA — consultar mensajes (sesión ${sessionUuid.slice(0, 8)}…): ${msg}. ¿WhatsApp vinculado con QR?`,
    );
  }
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
  const skippedReasons: string[] = [];
  const results: Awaited<ReturnType<typeof processOpenWaInboundMessage>>[] = [];

  try {
    const messages = await fetchRecentIncomingMessages(settings);

    for (const message of messages) {
      const messageId = message.id!;
      if (await isMessageProcessed(messageId)) {
        skipped += 1;
        skippedReasons.push(`${messageId.slice(0, 8)}…: ya procesado`);
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
        skipped += 1;
        continue;
      }

      if (shouldMarkMessageProcessed(result as Record<string, unknown>)) {
        await markMessageProcessed(messageId, "poll");
        processed += 1;
        results.push(result);
      } else {
        skipped += 1;
        const r = result as Record<string, unknown>;
        const detail =
          r.deliveryFailed === true
            ? "envío fallido (reintento)"
            : r.reason
              ? String(r.reason)
              : r.error
                ? String(r.error)
                : "sin acción";
        skippedReasons.push(`${body.slice(0, 24)}…: ${detail}`);
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
      ...(skippedReasons.length ? { skippedReasons } : {}),
      ...(errors.length ? { warnings: errors } : {}),
    };
  } catch (err) {
    const baseUrl = settings.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785";
    const msg = err instanceof Error ? err.message : "Error al consultar bandeja OpenWA";
    const timeoutMs = getOpenWaFetchTimeoutMs();
    const hint =
      /tiempo de espera|timeout|abort/i.test(msg)
        ? ` OpenWA no respondió en ${timeoutMs} ms en ${baseUrl}. Verifique: curl ${baseUrl.replace(/\/$/, "")}/api/health y docker ps (contenedor OpenWA).`
        : "";
    return { processed, skipped, error: `${msg}.${hint}`, openWaUrl: baseUrl };
  }
}
