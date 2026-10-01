import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import {
  getSettings,
  openWaEnvConfigured,
  resolveOpenWaApiKey,
  resolveOpenWaSessionId,
  resolveOpenWaBaseUrl,
  resolveOpenWaWebhookSecret,
  resolveOpenWaWebhookUrl,
} from "@/lib/settings";
import { resolveOpenWaWebhookRegisterCandidates } from "@/lib/openwa-webhook-url";
import {
  ensureOpenWaQr,
  getOpenWaSessionStatus,
  registerOpenWaWebhookWithFallback,
  sendOpenWaMessage,
  startOpenWaSession,
  testOpenWaConnection,
} from "@/lib/openwa";
import { openWaFetchQueued } from "@/lib/openwa-queue";
import { pollOpenWaInbox } from "@/lib/openwa-inbox-poll";
import { debugOpenWaLog } from "@/lib/debug-openwa-log";

type OpenWaBody = {
  action?: string;
  whatsappMode?: string;
  whatsappOpenWaUrl?: string;
  whatsappOpenWaApiKey?: string;
  whatsappOpenWaSessionId?: string;
  openwaWebhookSecret?: string;
  phone?: string;
  message?: string;
};

function resolveOpenWaOpts(settings: Awaited<ReturnType<typeof getSettings>>, body: OpenWaBody) {
  const mode = body.whatsappMode ?? settings.whatsappMode;
  if (mode !== "openwa") {
    return { error: "Seleccione el modo OpenWA en configuración" as const };
  }

  const apiKey = openWaEnvConfigured()
    ? resolveOpenWaApiKey()
    : body.whatsappOpenWaApiKey && body.whatsappOpenWaApiKey !== "********"
      ? body.whatsappOpenWaApiKey
      : resolveOpenWaApiKey(settings.whatsappOpenWaApiKey);

  if (!apiKey) {
    return {
      error: openWaEnvConfigured()
        ? "OpenWA no está configurado en el servidor. Contacte al administrador del sistema."
        : "Configure WHATSAPP_OPENWA_API_KEY en el archivo .env del servidor o ingrese la API Key en Configuración.",
    } as const;
  }

  const sessionId = resolveOpenWaSessionId(settings.whatsappOpenWaSessionId);

  const baseUrl = resolveOpenWaBaseUrl(settings.whatsappOpenWaUrl);

  return {
    opts: {
      baseUrl,
      apiKey,
      sessionId,
    },
    webhookSecret: resolveOpenWaWebhookSecret(settings.openwaWebhookSecret || body.openwaWebhookSecret),
    limit: settings.whatsappDailyLimit || 1000,
  };
}

function friendlyOpenWaError(message: string) {
  if (/api key is required/i.test(message)) {
    return "Configure la API Key de OpenWA en Canales de comunicación (dashboard OpenWA en :2785).";
  }
  if (/invalid api key/i.test(message)) {
    return "API Key de OpenWA incorrecta. Verifique el valor en el dashboard de OpenWA.";
  }
  if (/uuid is expected/i.test(message)) {
    return "OpenWA requiere el UUID de sesión. Guarde la configuración y vuelva a generar el QR.";
  }
  if (/already started|already starting/i.test(message)) {
    return "La sesión ya está iniciada. Obtenga el QR o espere a que WhatsApp termine de vincularse.";
  }
  if (/not connected|not ready/i.test(message)) {
    return "WhatsApp aún no está vinculado. Escanee el código QR y espere el estado «ready» antes de enviar.";
  }
  if (/internal server error/i.test(message)) {
    return "OpenWA reportó un error interno al enviar. Verifique si el mensaje llegó antes de reintentar.";
  }
  if (/already authenticated/i.test(message)) {
    return "WhatsApp ya está vinculado en esta sesión. No necesita escanear otro QR.";
  }
  if (/session with id.*not found/i.test(message)) {
    return "La sesión OpenWA expiró (reinicio del servicio). Pulse «Generar código QR» de nuevo; se creará una sesión nueva automáticamente.";
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|ETIMEDOUT|Tiempo de espera/i.test(message)) {
    return "No se pudo conectar con OpenWA. En la VM: docker ps | grep openwa-api; curl -m 10 http://127.0.0.1:2785/api/health (espere 30–60 s tras docker restart). Revise WHATSAPP_OPENWA_URL en .env (use http://127.0.0.1:2785, no localhost).";
  }
  if (/destination address is not allowed|ssrf/i.test(message)) {
    return message;
  }
  if (/throttler|too many requests/i.test(message)) {
    return "OpenWA limitó las peticiones (Throttler). Espere 1–2 minutos. La sesión puede seguir «ready» en el panel de OpenWA; evite abrir Configuración con muchas pestañas a la vez.";
  }
  if (/session is not started/i.test(message)) {
    return "La sesión no estaba en ejecución. Pulse «Generar código QR» de nuevo (la app iniciará la sesión automáticamente).";
  }
  if (/internal server error|error 500/i.test(message)) {
    return "OpenWA falló al iniciar (error interno). En la VM: docker restart openwa-api, espere 30 s y vuelva a «Generar código QR».";
  }
  return message;
}

export async function POST(request: Request) {
  const { error } = await withAdminAuth();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as OpenWaBody;
  const settings = await getSettings();
  const resolved = resolveOpenWaOpts(settings, body);
  if ("error" in resolved) return jsonError(resolved.error ?? "Configuración OpenWA inválida");

  const { opts, webhookSecret, limit } = resolved;

  try {
    if (body.action === "health") {
      const base = opts.baseUrl.replace(/\/$/, "");
      const res = await openWaFetchQueued(`${base}/api/health`, {
        headers: { "X-API-Key": opts.apiKey },
        timeoutMs: 15_000,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonError(`OpenWA /api/health respondió HTTP ${res.status}`);
      }
      return NextResponse.json({ ok: true, baseUrl: base, health: data });
    }

    if (body.action === "test") {
      const result = await testOpenWaConnection(opts);
      return NextResponse.json({
        message: "Conexión con OpenWA exitosa",
        ...result,
      });
    }

    if (body.action === "send-test") {
      const phone = String(body.phone ?? "").trim();
      if (!phone) return jsonError("Indique un número de teléfono para la prueba");

      const sessionStatus = await getOpenWaSessionStatus(opts);
      if (sessionStatus.status.toLowerCase() !== "ready") {
        return jsonError(
          sessionStatus.status.toLowerCase() === "qr_ready"
            ? "Escanee el código QR con WhatsApp antes de enviar. Estado actual: qr_ready."
            : `La sesión no está lista para enviar (estado: ${sessionStatus.status}). Espere «ready».`,
        );
      }

      const text =
        String(body.message ?? "").trim() ||
        "Mensaje de prueba — HUAV Banco de Sangre (OpenWA conectado correctamente).";

      await sendOpenWaMessage({
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        sessionId: sessionStatus.sessionUuid,
        to: phone,
        message: text,
      });

      return NextResponse.json({
        ok: true,
        message: `Mensaje de prueba enviado a ${phone}`,
        sessionUuid: sessionStatus.sessionUuid,
        status: sessionStatus.status,
      });
    }

    async function ensureWebhookRegistered(sessionUuid: string) {
      if (!webhookSecret || webhookSecret.length < 16) {
        return {
          webhookRegistered: false,
          webhookWarning:
            "Configure OPENWA_WEBHOOK_SECRET en .env (mínimo 16 caracteres) para recibir respuestas de donantes.",
        };
      }
      try {
        const { webhookUrl } = await registerOpenWaWebhookWithFallback({
          ...opts,
          sessionId: sessionUuid,
          secret: webhookSecret,
        });
        return { webhookRegistered: true as const, webhookUrl };
      } catch (err) {
        return {
          webhookRegistered: false,
          webhookUrl: resolveOpenWaWebhookUrl(),
          webhookWarning:
            err instanceof Error ? err.message : "No se pudo registrar el webhook de WhatsApp",
        };
      }
    }

    if (body.action === "start") {
      const { sessionUuid } = await startOpenWaSession(opts);
      const webhook = await ensureWebhookRegistered(sessionUuid);
      return NextResponse.json({
        ok: true,
        message: "Sesión iniciada",
        sessionUuid,
        ...webhook,
      });
    }

    if (body.action === "qr") {
      const result = await ensureOpenWaQr(opts);
      const linked = result.status.toLowerCase() === "ready" || result.alreadyLinked;
      const webhook = linked
        ? await ensureWebhookRegistered(result.sessionUuid)
        : { webhookRegistered: false as const };
      if (result.alreadyLinked) {
        return NextResponse.json({
          qrSrc: null,
          status: result.status,
          sessionUuid: result.sessionUuid,
          alreadyLinked: true,
          message: "WhatsApp ya está vinculado en esta sesión.",
          ...webhook,
        });
      }
      return NextResponse.json({
        qrSrc: result.qrSrc,
        status: result.status,
        sessionUuid: result.sessionUuid,
        alreadyLinked: false,
      });
    }

    if (body.action === "status") {
      const status = await getOpenWaSessionStatus(opts);
      const sentToday = await import("@/lib/whatsapp-limit").then((m) => m.getWhatsappSentTodayCount());
      const webhookUrl = resolveOpenWaWebhookUrl();
      return NextResponse.json({
        status: status.status,
        phone: status.phone,
        pushName: status.pushName,
        sessionUuid: status.sessionUuid,
        sessionName: status.sessionName,
        sentToday,
        limit,
        webhookUrl,
        inboxPollingEnabled: false,
        serverInboxPollRecommended: true,
      });
    }

    if (body.action === "poll-inbox") {
      const poll = await pollOpenWaInbox(settings);
      return NextResponse.json({ ok: true, ...poll });
    }

    if (body.action === "check-webhook") {
      const status = await getOpenWaSessionStatus(opts);
      const webhookUrl = resolveOpenWaWebhookUrl();
      let webhookRegistered = false;
      if (status.status.toLowerCase() === "ready") {
        const base = opts.baseUrl.replace(/\/$/, "");
        const candidates = resolveOpenWaWebhookRegisterCandidates();
        const list = await openWaFetchQueued(
          `${base}/api/sessions/${encodeURIComponent(status.sessionUuid)}/webhooks`,
          { headers: { "X-API-Key": opts.apiKey }, timeoutMs: 8000 },
        )
          .then((r) => r.json().catch(() => []))
          .catch(() => []);
        webhookRegistered =
          Array.isArray(list) &&
          list.some(
            (hook: { url?: string; active?: boolean }) =>
              Boolean(hook.url && candidates.includes(hook.url) && hook.active !== false),
          );
      }
      return NextResponse.json({ webhookUrl, webhookRegistered });
    }

    if (body.action === "register-webhook") {
      const status = await getOpenWaSessionStatus(opts);
      if (status.status.toLowerCase() !== "ready") {
        return jsonError("WhatsApp debe estar en estado «ready» antes de registrar el webhook.");
      }
      const webhook = await ensureWebhookRegistered(status.sessionUuid);
      return NextResponse.json({
        ok: webhook.webhookRegistered,
        webhookUrl: webhook.webhookUrl ?? resolveOpenWaWebhookUrl(),
        message: webhook.webhookRegistered
          ? `Webhook registrado (${webhook.webhookUrl ?? resolveOpenWaWebhookUrl()}). Las respuestas «Sí» activarán el agendamiento.`
          : webhook.webhookWarning ?? "No se pudo registrar el webhook",
        inboxFallback: !webhook.webhookRegistered,
      });
    }

    return jsonError("Acción inválida");
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Error OpenWA";
    const friendly = friendlyOpenWaError(raw);
    if (/limitó las peticiones|throttler/i.test(friendly)) {
      // #region agent log
      debugOpenWaLog(
        "openwa/route.ts:POST",
        "openwa throttle",
        { action: body.action ?? "unknown" },
        "R1",
      );
      // #endregion
    }
    if (/No se pudo conectar con OpenWA/i.test(friendly)) {
      // #region agent log
      debugOpenWaLog(
        "openwa/route.ts:POST",
        "openwa unreachable",
        {
          action: body.action ?? "unknown",
          baseUrl: resolveOpenWaBaseUrl(settings.whatsappOpenWaUrl),
          rawError: raw.slice(0, 120),
        },
        "R5",
      );
      // #endregion
    }
    return jsonError(friendly);
  }
}
