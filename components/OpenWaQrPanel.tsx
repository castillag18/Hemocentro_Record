"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./Button";
import { Icon } from "./Icon";

export type OpenWaConfig = {
  whatsappMode: string;
  whatsappOpenWaUrl: string;
  whatsappOpenWaApiKey: string;
  whatsappOpenWaSessionId: string;
  openwaWebhookSecret?: string;
  whatsappDailyLimit?: number;
};

type OpenWaStatusResponse = {
  status: string;
  sentToday: number;
  limit: number;
  sessionUuid?: string;
  sessionName?: string;
  phone?: string | null;
  pushName?: string | null;
  webhookUrl?: string;
  webhookRegistered?: boolean;
  webhookWarning?: string;
  inboxPollingEnabled?: boolean;
};

const STATUS_POLL_MS = 300_000;
const QR_POLL_MS = 60_000;
const THROTTLE_COOLDOWN_MS = 120_000;

function isOpenWaThrottleError(message: string) {
  return /limitó las peticiones|throttler|too many requests/i.test(message);
}

export function OpenWaQrPanel({
  config,
  enabled,
  onBeforeAction,
  onSessionUuid,
}: {
  config: OpenWaConfig;
  enabled: boolean;
  onBeforeAction?: () => Promise<void>;
  onSessionUuid?: (uuid: string) => void;
}) {
  const [qrSrc, setQrSrc] = useState("");
  const [status, setStatus] = useState("");
  const [sessionUuid, setSessionUuid] = useState("");
  const [sentToday, setSentToday] = useState(0);
  const [limit, setLimit] = useState(config.whatsappDailyLimit ?? 1000);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookRegistered, setWebhookRegistered] = useState<boolean | null>(null);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [pollingInbox, setPollingInbox] = useState(false);
  const [lastPollSummary, setLastPollSummary] = useState("");
  const throttleUntilRef = useRef(0);
  const qrAutoFetchDoneRef = useRef(false);
  const lastKnownStatusRef = useRef("");

  const payload = useMemo(
    () => ({
      whatsappMode: config.whatsappMode,
      whatsappOpenWaUrl: config.whatsappOpenWaUrl,
      whatsappOpenWaApiKey: config.whatsappOpenWaApiKey,
      whatsappOpenWaSessionId: config.whatsappOpenWaSessionId,
      openwaWebhookSecret: config.openwaWebhookSecret,
    }),
    [
      config.whatsappMode,
      config.whatsappOpenWaUrl,
      config.whatsappOpenWaApiKey,
      config.whatsappOpenWaSessionId,
      config.openwaWebhookSecret,
    ],
  );

  const inThrottleCooldown = useCallback(() => Date.now() < throttleUntilRef.current, []);

  const markThrottle = useCallback(() => {
    throttleUntilRef.current = Date.now() + THROTTLE_COOLDOWN_MS;
  }, []);

  const applySessionUuid = useCallback(
    (uuid?: string) => {
      if (!uuid) return;
      setSessionUuid(uuid);
      onSessionUuid?.(uuid);
    },
    [onSessionUuid],
  );

  const fetchQr = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!enabled || config.whatsappMode !== "openwa") return;
      if (inThrottleCooldown()) {
        if (!options?.silent) {
          setError(
            "OpenWA limitó las peticiones. Espere 1–2 minutos antes de volver a generar el QR.",
          );
        }
        return;
      }
      try {
        const qrData = await api<{
          qrSrc: string | null;
          status: string;
          sessionUuid?: string;
          alreadyLinked?: boolean;
          message?: string;
        }>("/api/openwa", {
          method: "POST",
          body: JSON.stringify({ action: "qr", ...payload }),
        });
        if (qrData.qrSrc) {
          setQrSrc(qrData.qrSrc);
          if (!options?.silent) {
            setNotice("Escanee el código QR con WhatsApp → Dispositivos vinculados.");
          }
        } else if (qrData.alreadyLinked) {
          setQrSrc("");
          setNotice(qrData.message ?? "WhatsApp ya está vinculado.");
        }
        applySessionUuid(qrData.sessionUuid);
        if (qrData.status) {
          setStatus(qrData.status);
          lastKnownStatusRef.current = qrData.status;
        }
        setError("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No se pudo obtener el QR";
        if (isOpenWaThrottleError(msg)) markThrottle();
        if (!options?.silent) setError(msg);
      }
    },
    [enabled, config.whatsappMode, payload, applySessionUuid, inThrottleCooldown, markThrottle],
  );

  const refreshStatus = useCallback(async () => {
    if (!enabled || config.whatsappMode !== "openwa") return;
    if (inThrottleCooldown()) return;
    try {
      const data = await api<OpenWaStatusResponse>("/api/openwa", {
        method: "POST",
        body: JSON.stringify({ action: "status", ...payload }),
      });
      setStatus(data.status);
      lastKnownStatusRef.current = data.status;
      setSentToday(data.sentToday);
      setLimit(data.limit);
      applySessionUuid(data.sessionUuid);
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      if (data.webhookRegistered != null) setWebhookRegistered(data.webhookRegistered);
      setError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OpenWA no disponible";
      if (isOpenWaThrottleError(msg)) {
        markThrottle();
        if (lastKnownStatusRef.current) {
          setStatus(lastKnownStatusRef.current);
          setNotice(
            "OpenWA limitó consultas de estado; la sesión puede seguir conectada. Espere 1–2 min antes de generar QR.",
          );
          return;
        }
      }
      setError(msg);
    }
  }, [enabled, config.whatsappMode, payload, applySessionUuid, inThrottleCooldown, markThrottle]);

  const checkWebhook = useCallback(async () => {
    if (!enabled || config.whatsappMode !== "openwa" || status.toLowerCase() !== "ready") return;
    try {
      const data = await api<{ webhookUrl?: string; webhookRegistered?: boolean }>("/api/openwa", {
        method: "POST",
        body: JSON.stringify({ action: "check-webhook", ...payload }),
      });
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      if (data.webhookRegistered != null) setWebhookRegistered(data.webhookRegistered);
    } catch {
      /* consulta opcional */
    }
  }, [enabled, config.whatsappMode, payload, status]);

  useEffect(() => {
    if (!enabled || config.whatsappMode !== "openwa") return;
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, config.whatsappMode, refreshStatus]);

  useEffect(() => {
    if (!enabled || config.whatsappMode !== "openwa") return;
    if (status.toLowerCase() !== "qr_ready" || qrSrc || qrAutoFetchDoneRef.current) return;
    qrAutoFetchDoneRef.current = true;
    void fetchQr({ silent: true });
  }, [enabled, config.whatsappMode, status, qrSrc, fetchQr]);

  useEffect(() => {
    if (!enabled || status.toLowerCase() !== "ready") return;
    void checkWebhook();
  }, [enabled, status, checkWebhook]);

  const pollInbox = useCallback(async () => {
    if (!enabled || config.whatsappMode !== "openwa" || status.toLowerCase() !== "ready") return;
    setPollingInbox(true);
    try {
      const data = await api<{
        processed?: number;
        skipped?: number;
        error?: string;
        results?: Array<{ step?: string; deliveryFailed?: boolean }>;
      }>("/api/openwa", {
        method: "POST",
        body: JSON.stringify({ action: "poll-inbox", ...payload }),
      });
      if (data.error) {
        setLastPollSummary(`Error: ${data.error}`);
        return;
      }
      const step = data.results?.[0]?.step;
      const failed = data.results?.some((r) => r.deliveryFailed);
      setLastPollSummary(
        `Procesados: ${data.processed ?? 0}, omitidos: ${data.skipped ?? 0}` +
          (step ? ` · ${step}` : "") +
          (failed ? " · envío fallido (reintenta)" : ""),
      );
    } catch (err) {
      setLastPollSummary(err instanceof Error ? err.message : "Error al sondear bandeja");
    } finally {
      setPollingInbox(false);
    }
  }, [enabled, config.whatsappMode, status, payload]);

  // Sondeo de bandeja: solo manual aquí; en servidor use PM2 openwa-poll (evita Throttler en OpenWA).

  useEffect(() => {
    if (status.toLowerCase() !== "qr_ready" || !enabled) return;
    const timer = setInterval(() => {
      if (inThrottleCooldown()) return;
      void fetchQr({ silent: true });
    }, QR_POLL_MS);
    return () => clearInterval(timer);
  }, [status, enabled, fetchQr, inThrottleCooldown]);

  async function runWithSave(action: () => Promise<void>) {
    setError("");
    setNotice("");
    if (onBeforeAction) await onBeforeAction();
    await action();
  }

  async function generateQr() {
    if (inThrottleCooldown()) {
      setError("OpenWA limitó las peticiones. Espere 1–2 minutos y vuelva a intentar.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await runWithSave(async () => {
        qrAutoFetchDoneRef.current = true;
        await fetchQr();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo generar el QR";
      if (isOpenWaThrottleError(msg)) markThrottle();
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      await runWithSave(async () => {
        const data = await api<{
          ok: boolean;
          message: string;
          health: string;
          status: string;
          sessionUuid?: string;
          phone?: string | null;
        }>("/api/openwa", {
          method: "POST",
          body: JSON.stringify({ action: "test", ...payload }),
        });
        applySessionUuid(data.sessionUuid);
        setStatus(data.status);
        setNotice(
          `${data.message} · Health: ${data.health} · Sesión: ${data.status}${
            data.phone ? ` · Tel: ${data.phone}` : ""
          }`,
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo probar la conexión");
    } finally {
      setTesting(false);
    }
  }

  async function registerWebhook() {
    setRegisteringWebhook(true);
    setError("");
    setNotice("");
    try {
      await runWithSave(async () => {
        const data = await api<{ ok: boolean; message: string; webhookUrl?: string }>("/api/openwa", {
          method: "POST",
          body: JSON.stringify({ action: "register-webhook", ...payload }),
        });
      setWebhookRegistered(data.ok);
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      if (data.ok) {
        setNotice(data.message);
        setError("");
      } else {
        setError(data.message);
        setNotice("Configure SSRF en OpenWA o use el sondeo por cron (npm run openwa:poll-inbox).");
      }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el webhook");
    } finally {
      setRegisteringWebhook(false);
    }
  }

  async function sendTestMessage() {
    if (!testPhone.trim()) {
      setError("Indique un número de teléfono para enviar la prueba");
      return;
    }
    setSendingTest(true);
    setError("");
    setNotice("");
    try {
      await runWithSave(async () => {
        const data = await api<{ ok: boolean; message: string; sessionUuid?: string; status?: string }>(
          "/api/openwa",
          {
            method: "POST",
            body: JSON.stringify({
              action: "send-test",
              phone: testPhone.trim(),
              message: testMessage.trim() || undefined,
              ...payload,
            }),
          },
        );
        applySessionUuid(data.sessionUuid);
        if (data.status) setStatus(data.status);
        setNotice(data.message);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje de prueba");
    } finally {
      setSendingTest(false);
    }
  }

  if (!enabled || config.whatsappMode !== "openwa") return null;

  const isReady = status.toLowerCase() === "ready";
  const needsQr = status.toLowerCase() === "qr_ready";
  const sessionLabel = isReady ? "Conectado" : needsQr ? "Pendiente de escaneo" : status || "Sin vincular";

  return (
    <div className="border border-outline-variant rounded-lg p-md bg-surface-container-low space-y-md">
      <div className="flex items-center justify-between gap-md flex-wrap">
        <h5 className="text-title-md flex items-center gap-2">
          <Icon name="qr_code_2" /> Vincular WhatsApp
        </h5>
        <span className="text-body-sm text-secondary">
          Mensajes hoy: {sentToday}/{limit}
        </span>
      </div>

      <p className="text-body-sm text-secondary">
        Estado:{" "}
        <strong className={isReady ? "text-tertiary-container" : needsQr ? "text-primary" : ""}>
          {sessionLabel}
        </strong>
        {needsQr ? " · Abra WhatsApp en su teléfono → Dispositivos vinculados → Escanear código." : ""}
        {isReady ? " · Puede enviar recordatorios y mensajes de prueba." : ""}
      </p>

      {isReady ? (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3 space-y-2">
          <p className="text-body-sm font-medium text-on-surface">Respuestas de donantes (agendamiento)</p>
          <p className="text-body-xs text-secondary">
            Las respuestas «Sí» se procesan en el servidor (PM2 «openwa-poll» o cron). Use «Procesar
            respuestas ahora» solo si hace falta; no deje muchas pestañas de Configuración abiertas.
          </p>
          {lastPollSummary ? (
            <p className="text-body-xs text-secondary">Último sondeo: {lastPollSummary}</p>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void pollInbox()}
            disabled={pollingInbox || loading}
          >
            {pollingInbox ? "Procesando..." : "Procesar respuestas ahora"}
          </Button>
          {webhookUrl ? (
            <p className="text-body-xs font-mono text-secondary break-all">URL: {webhookUrl}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="outline"
              onClick={() => void registerWebhook()}
              disabled={loading || testing || sendingTest || registeringWebhook}
            >
              {registeringWebhook ? "Registrando..." : "Registrar webhook"}
            </Button>
            <span
              className={`text-body-xs ${webhookRegistered ? "text-tertiary-container" : "text-error"}`}
            >
              {webhookRegistered === true
                ? "Webhook activo"
                : webhookRegistered === false
                  ? "Webhook no registrado"
                  : "Estado desconocido"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-md items-start">
        <Button onClick={() => void generateQr()} disabled={loading || testing || sendingTest}>
          {loading ? "Generando..." : "Generar código QR"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void testConnection()}
          disabled={loading || testing || sendingTest}
        >
          {testing ? "Probando..." : "Probar conexión"}
        </Button>
        {qrSrc ? (
          <img src={qrSrc} alt="Código QR WhatsApp" className="w-48 h-48 border rounded-lg" />
        ) : null}
      </div>

      <div className="border-t border-outline-variant pt-md space-y-sm">
        <h6 className="text-title-sm flex items-center gap-2">
          <Icon name="send" /> Enviar mensaje de prueba
        </h6>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-label-md text-secondary uppercase mb-1 block">Teléfono (con indicativo)</span>
            <input
              className="w-full border border-secondary-container rounded p-2 font-mono"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="573001234567"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-label-md text-secondary uppercase mb-1 block">Mensaje (opcional)</span>
            <input
              className="w-full border border-secondary-container rounded p-2"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Mensaje de prueba HUAV..."
            />
          </label>
        </div>
        <Button
          variant="outline"
          onClick={() => void sendTestMessage()}
          disabled={loading || testing || sendingTest || !isReady}
        >
          {sendingTest ? "Enviando..." : "Enviar prueba"}
        </Button>
        {!isReady ? (
          <p className="text-body-sm text-secondary md:col-span-2">
            El envío de prueba se habilita cuando WhatsApp esté conectado (después de escanear el código QR).
          </p>
        ) : null}
      </div>

      {notice ? <p className="text-body-sm text-primary">{notice}</p> : null}
      {error ? <p className="text-body-sm text-error">{error}</p> : null}
    </div>
  );
}
