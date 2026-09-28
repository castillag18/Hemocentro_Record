import {
  isOpenWaSessionUuid,
  listOpenWaSessions,
  normalizeOpenWaSessionName,
  openWaHeaders,
  resolveOpenWaSessionUuid,
  type OpenWaSessionSummary,
} from "./openwa-session";
import { resolveOpenWaWebhookRegisterCandidates } from "./openwa-webhook-url";
import {
  openWaConfigured,
  sendOpenWaMessage,
  toWhatsAppChatId,
} from "./whatsapp";

async function withSessionUuid<T>(
  options: { baseUrl: string; apiKey: string; sessionId: string },
  fn: (uuid: string) => Promise<T>,
): Promise<{ sessionUuid: string; result: T }> {
  const sessionUuid = await resolveOpenWaSessionUuid(options);
  const result = await fn(sessionUuid);
  return { sessionUuid, result };
}

function isStartNoOp(res: Response, data: { message?: string; error?: string }) {
  if (res.ok || res.status === 409) return true;
  const msg = `${data.message ?? ""} ${data.error ?? ""}`.toLowerCase();
  return msg.includes("already started") || msg.includes("already starting");
}

const QR_PENDING_STATUSES = new Set(["qr_ready", "initializing", "connecting", "authenticated"]);
const LINKED_STATUSES = new Set(["ready"]);

export async function startOpenWaSession(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}) {
  const base = options.baseUrl.replace(/\/$/, "");
  const { sessionUuid } = await withSessionUuid(options, async (uuid) => {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}/start`, {
      method: "POST",
      headers: openWaHeaders(options.apiKey),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!isStartNoOp(res, data)) {
      throw new Error(data.message ?? data.error ?? "No se pudo iniciar la sesión OpenWA");
    }
    return data;
  });

  return { sessionUuid };
}

export async function ensureOpenWaQr(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}) {
  const current = await getOpenWaSessionStatus(options);
  const state = current.status.toLowerCase();

  if (LINKED_STATUSES.has(state)) {
    return {
      qrSrc: null as string | null,
      status: current.status,
      sessionUuid: current.sessionUuid,
      alreadyLinked: true,
    };
  }

  if (!QR_PENDING_STATUSES.has(state)) {
    try {
      await startOpenWaSession(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already started|already starting/i.test(msg)) throw err;
    }
  }

  try {
    const qr = await getOpenWaQr(options);
    return { ...qr, alreadyLinked: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already authenticated|not ready yet/i.test(msg)) {
      const latest = await getOpenWaSessionStatus(options);
      throw new Error(
        latest.status === "qr_ready"
          ? "El QR está listo pero aún no se ha escaneado. Use el código mostrado o pulse Generar QR de nuevo."
          : msg,
      );
    }
    throw err;
  }
}

export async function getOpenWaQr(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}) {
  const base = options.baseUrl.replace(/\/$/, "");
  const { sessionUuid, result } = await withSessionUuid(options, async (uuid) => {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}/qr`, {
      headers: openWaHeaders(options.apiKey),
    });

    const data = (await res.json().catch(() => ({}))) as {
      qr?: string;
      qrcode?: string;
      qrCode?: string;
      dataUrl?: string;
      status?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? "No se pudo obtener el código QR");
    }

    const qr = data.qrCode ?? data.qr ?? data.qrcode ?? data.dataUrl ?? "";
    if (!qr) {
      throw new Error("OpenWA no devolvió un código QR. Verifique que la sesión esté iniciada.");
    }

    const src = qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
    return { qrSrc: src, status: data.status ?? "unknown" };
  });

  return { ...result, sessionUuid };
}

export async function getOpenWaSessionStatus(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}) {
  const base = options.baseUrl.replace(/\/$/, "");
  const { sessionUuid, result } = await withSessionUuid(options, async (uuid) => {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}`, {
      headers: openWaHeaders(options.apiKey),
    });
    const data = (await res.json().catch(() => ({}))) as OpenWaSessionSummary & {
      state?: string;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? "No se pudo consultar el estado de la sesión");
    }
    return {
      status: data.status ?? data.state ?? "unknown",
      phone: data.phone ?? null,
      pushName: data.pushName ?? null,
      sessionName: data.name ?? normalizeOpenWaSessionName(options.sessionId),
    };
  });

  return { ...result, sessionUuid };
}

export async function testOpenWaConnection(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}) {
  const base = options.baseUrl.replace(/\/$/, "");
  const healthRes = await fetch(`${base}/api/health`, {
    headers: openWaHeaders(options.apiKey),
  });
  const health = (await healthRes.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    error?: string;
  };
  if (!healthRes.ok) {
    throw new Error(health.message ?? health.error ?? "OpenWA no respondió al health check");
  }

  const status = await getOpenWaSessionStatus(options);
  return {
    ok: true,
    health: health.status ?? "ok",
    ...status,
  };
}

export async function registerOpenWaWebhook(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  webhookUrl: string;
  secret: string;
}) {
  const base = options.baseUrl.replace(/\/$/, "");
  const sessionUuid = await resolveOpenWaSessionUuid(options);

  const listRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}/webhooks`, {
    headers: openWaHeaders(options.apiKey),
  });
  if (listRes.ok) {
    const existing = (await listRes.json().catch(() => [])) as Array<{ url?: string; active?: boolean }>;
    if (Array.isArray(existing)) {
      const found = existing.find((item) => item.url === options.webhookUrl && item.active !== false);
      if (found) return found;
    }
  }

  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionUuid)}/webhooks`, {
    method: "POST",
    headers: openWaHeaders(options.apiKey),
    body: JSON.stringify({
      url: options.webhookUrl,
      events: ["message.received"],
      secret: options.secret,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    const raw = data.message ?? data.error ?? "No se pudo registrar el webhook";
    if (/destination address is not allowed|ssrf|not allowed/i.test(raw)) {
      throw new Error(
        "OpenWA bloqueó la URL del webhook (política SSRF). El agendamiento por «Sí» funciona igual vía sondeo automático de bandeja. Opcional: en OpenWA configure SSRF_ALLOWED_HOSTS=host.docker.internal,172.17.0.1 y OPENWA_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/openwa",
      );
    }
    throw new Error(raw);
  }
  return data;
}

export async function registerOpenWaWebhookWithFallback(options: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  secret: string;
}) {
  const candidates = resolveOpenWaWebhookRegisterCandidates();
  let lastError: Error | null = null;

  for (const webhookUrl of candidates) {
    try {
      const result = await registerOpenWaWebhook({ ...options, webhookUrl });
      return { webhookUrl, result };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!/destination address is not allowed|ssrf|not allowed/i.test(lastError.message)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("No se pudo registrar el webhook con ninguna URL candidata");
}

export {
  isOpenWaSessionUuid,
  listOpenWaSessions,
  normalizeOpenWaSessionName,
  openWaConfigured,
  resolveOpenWaSessionUuid,
  sendOpenWaMessage,
  toWhatsAppChatId,
};
