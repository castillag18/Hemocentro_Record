import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processOpenWaInboundMessage } from "@/lib/openwa-inbound";
import { getSettings, resolveOpenWaWebhookSecret } from "@/lib/settings";
import {
  extractOpenWaWebhookMessage,
  verifyOpenWaWebhookSignature,
  type OpenWaWebhookPayload,
} from "@/lib/openwa-webhook";

async function markMessageProcessed(messageId: string, source: string) {
  if (!messageId) return;
  await prisma.openWaProcessedMessage.create({ data: { messageId, source } }).catch(() => {});
}

function toHttpResponse(result: Record<string, unknown>) {
  if (typeof result.error === "string") {
    const status = typeof result.status === "number" ? result.status : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "openwa-webhook" });
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

  const authorized =
    verifyOpenWaWebhookSignature(rawBody, signature, webhookSecret) ||
    Boolean(legacySecret && legacySecret === webhookSecret);

  if (!authorized) {
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

  if (messageId) {
    const dup = await prisma.openWaProcessedMessage.findUnique({ where: { messageId } });
    if (dup) {
      return NextResponse.json({ ignored: true, reason: "Mensaje ya procesado" });
    }
  }

  const result = await processOpenWaInboundMessage(settings, {
    from,
    chatId,
    body,
    messageId,
    senderPhone,
    source: "webhook",
  });

  const actionable =
    Boolean((result as { ok?: boolean }).ok) ||
    Boolean((result as { error?: string }).error) ||
    ((result as { ignored?: boolean }).ignored &&
      !["No es una respuesta afirmativa", "Mensaje incompleto"].includes(
        String((result as { reason?: string }).reason ?? ""),
      ));

  if (messageId && actionable) {
    await markMessageProcessed(messageId, "webhook");
  }

  return toHttpResponse(result);
}
