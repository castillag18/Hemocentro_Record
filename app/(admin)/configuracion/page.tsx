"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { alertError, alertSuccess, alertInfo, showLoading, closeLoading } from "@/lib/alerts";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { DatabaseUploadPanel } from "@/components/DatabaseUploadPanel";
import { OpenWaQrPanel } from "@/components/OpenWaQrPanel";

type Settings = {
  reminderDays: number;
  femaleWholeBloodMonths: number;
  femaleApheresisMonths: number;
  maleWholeBloodMonths: number;
  maleApheresisMonths: number;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  appointmentLink: string;
  siteName: string;
  siteAddress: string;
  sitePhone: string;
  hasSmtpPass: boolean;
  whatsappMode: "wame" | "api" | "openwa";
  whatsappAccessToken: string;
  whatsappPhoneNumberId: string;
  whatsappApiVersion: string;
  whatsappVerifyToken: string;
  hasWhatsappToken: boolean;
  hasWhatsappVerifyToken: boolean;
  whatsappOpenWaUrl: string;
  whatsappOpenWaApiKey: string;
  whatsappOpenWaSessionId: string;
  hasWhatsappOpenWaApiKey: boolean;
  whatsappDailyLimit: number;
  autoRemindersEnabled: boolean;
  autoRemindersHour: number;
  googleCalendarId: string;
  googleCredentialsJson: string;
  hasGoogleCredentials: boolean;
  hasGoogleOAuth: boolean;
  googleConnectedEmail: string;
  googleClientId: string;
  googleClientSecret: string;
  hasGoogleClientSecret: boolean;
  hasGoogleOAuthConfig: boolean;
  googleOAuthFromEnv: boolean;
  openWaFromEnv: boolean;
  openwaWebhookSecret: string;
};

export default function ConfiguracionPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [tab, setTab] = useState<"general" | "canales" | "datos">("general");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<Settings>("/api/settings")
      .then((loaded) => {
        setForm({
          ...loaded,
          whatsappMode: loaded.whatsappMode === "wame" ? "openwa" : loaded.whatsappMode,
          femaleWholeBloodMonths: loaded.femaleWholeBloodMonths ?? 4,
          femaleApheresisMonths: loaded.femaleApheresisMonths ?? 1,
          maleWholeBloodMonths: loaded.maleWholeBloodMonths ?? 3,
          maleApheresisMonths: loaded.maleApheresisMonths ?? 1,
        });
      })
      .catch((err) => {
        void alertError(
          "Acceso denegado",
          err instanceof Error ? err.message : "Solo administradores pueden acceder a Configuración",
        );
        window.location.href = "/";
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      void api<Settings>("/api/settings").then((loaded) => {
        setForm({
          ...loaded,
          whatsappMode: loaded.whatsappMode === "wame" ? "openwa" : loaded.whatsappMode,
          femaleWholeBloodMonths: loaded.femaleWholeBloodMonths ?? 4,
          femaleApheresisMonths: loaded.femaleApheresisMonths ?? 1,
          maleWholeBloodMonths: loaded.maleWholeBloodMonths ?? 3,
          maleApheresisMonths: loaded.maleApheresisMonths ?? 1,
        });
        const synced = params.get("synced");
        void alertSuccess(
          "Google conectado",
          synced && synced !== "0"
            ? `Google Calendar vinculado. ${synced} cita(s) pendiente(s) sincronizada(s).`
            : "Google Calendar quedó vinculado correctamente",
        );
      });
      window.history.replaceState({}, "", "/configuracion?tab=canales");
      setTab("canales");
    }
    if (params.get("error") === "google_not_configured") {
      void alertInfo(
        "Google OAuth no configurado",
        "Defina GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env del servidor y reinicie la aplicación. Luego pulse Conectar con Google.",
      );
      window.history.replaceState({}, "", "/configuracion");
      setTab("canales");
    }
    if (params.get("error") === "google_test_user") {
      void alertError(
        "Acceso bloqueado por Google (403)",
        "En Google Cloud Console → APIs y servicios → Pantalla de consentimiento OAuth → Usuarios de prueba, agregue el correo con el que intenta conectar (ej. zynktechsas@gmail.com). Espere 1 minuto e intente de nuevo.",
      );
      window.history.replaceState({}, "", "/configuracion?tab=canales");
      setTab("canales");
    }
    if (params.get("error") === "google_no_refresh") {
      void alertError(
        "Google no entregó permiso persistente",
        "Revoke el acceso previo en https://myaccount.google.com/permissions (busque la app OpenWA/Hemocentro), elimínela y vuelva a pulsar «Conectar Google Calendar».",
      );
      window.history.replaceState({}, "", "/configuracion?tab=canales");
      setTab("canales");
    }
    if (params.get("error") === "google_invalid") {
      void alertError(
        "Sesión OAuth expirada",
        "Vuelva a pulsar «Conectar Google Calendar» sin cerrar la pestaña. Si persiste, use: npm run google:connect-calendar",
      );
      window.history.replaceState({}, "", "/configuracion?tab=canales");
      setTab("canales");
    }
    if (params.get("error") === "google_failed") {
      void alertError(
        "Error al conectar Google Calendar",
        "Verifique GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI en .env, reinicie la app e intente de nuevo.",
      );
      window.history.replaceState({}, "", "/configuracion?tab=canales");
      setTab("canales");
    }
  }, []);

  async function connectGoogleCalendar() {
    try {
      const status = await api<{ configured: boolean; redirectUri: string; javascriptOrigin: string }>(
        "/api/auth/google/status",
      );
      if (!status.configured) {
        void alertInfo(
          "Google OAuth no configurado",
          `Defina GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el .env del servidor y reinicie la app.\n\nEn Google Cloud:\n• Origen JS: ${status.javascriptOrigin}\n• URI redirect: ${status.redirectUri}`,
        );
        return;
      }
      window.location.href = "/api/auth/google?mode=calendar";
    } catch (err) {
      void alertError("Error", err instanceof Error ? err.message : "No se pudo iniciar conexión");
    }
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setNotice("");
    showLoading("Guardando configuración...");
    try {
      await persistSettings();
      closeLoading();
      await alertSuccess("Guardado", "Cambios guardados correctamente");
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function persistSettings() {
    if (!form) throw new Error("Configuración no cargada");
    const saved = await api<Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(form),
    });
    setForm(saved);
    return saved;
  }

  async function saveBeforeOpenWa() {
    setSaving(true);
    setNotice("");
    try {
      await persistSettings();
      setNotice("Cambios guardados");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar";
      setNotice(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function persistSessionUuid(uuid: string) {
    if (!form || form.whatsappOpenWaSessionId === uuid) return;
    const next = { ...form, whatsappOpenWaSessionId: uuid };
    const saved = await api<Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(next),
    });
    setForm(saved);
  }

  if (!form) return <p className="text-secondary">Cargando configuración...</p>;

  return (
    <div className="space-y-lg">
      <div className="flex justify-between items-end border-b border-secondary-container pb-md gap-md flex-wrap">
        <div>
          <h1 className="text-headline-lg">Configuración del sistema</h1>
          <p className="text-body-md text-secondary mt-2">
            Recordatorios, WhatsApp, Google Calendar y base de donantes.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner size="sm" className="text-white" /> : <Icon name="save" />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
      {notice ? <p className="text-body-sm text-tertiary-container">{notice}</p> : null}

      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <TabButton active={tab === "general"} onClick={() => setTab("general")}>
            Configuración general
          </TabButton>
          <TabButton active={tab === "canales"} onClick={() => setTab("canales")}>
            WhatsApp y Google Calendar
          </TabButton>
          <TabButton active={tab === "datos"} onClick={() => setTab("datos")}>
            Base de donantes
          </TabButton>
        </div>

        <div className="col-span-12 md:col-span-9 space-y-lg">
          {tab === "general" ? (
            <>
              <section className="bg-white p-lg rounded-xl shadow-level-1 border border-secondary-container">
                <div className="flex items-center gap-3 mb-md border-b border-secondary-container pb-sm">
                  <Icon name="tune" className="text-primary text-[28px]" />
                  <h3 className="text-title-lg">Parámetros de donación</h3>
                </div>
                <div className="space-y-md">
                  <p className="text-body-sm text-secondary">
                    Sangre total: intervalo según género (mujer / hombre). Aféresis: intervalo
                    mensual único para todos, sin importar el género. Sin género registrado se usa
                    el respaldo en días.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                    <IntervalField
                      label="Mujer — sangre total (meses)"
                      value={form.femaleWholeBloodMonths}
                      onChange={(v) => set("femaleWholeBloodMonths", v)}
                    />
                    <IntervalField
                      label="Hombre — sangre total (meses)"
                      value={form.maleWholeBloodMonths}
                      onChange={(v) => set("maleWholeBloodMonths", v)}
                    />
                    <IntervalField
                      label="Aféresis — todos los donantes (meses)"
                      value={form.femaleApheresisMonths}
                      onChange={(v) => {
                        set("femaleApheresisMonths", v);
                        set("maleApheresisMonths", v);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-secondary uppercase mb-2">
                      Respaldo sin género (días)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      className="w-full max-w-xs border border-secondary-container rounded p-3 outline-none focus:border-primary"
                      value={form.reminderDays}
                      onChange={(e) => set("reminderDays", Number(e.target.value))}
                    />
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.autoRemindersEnabled}
                      onChange={(e) => set("autoRemindersEnabled", e.target.checked)}
                    />
                    <span className="text-body-md">Envío automático de recordatorios</span>
                  </label>
                  <div>
                    <label className="block text-label-md text-secondary uppercase mb-2">
                      Hora diaria de envío automático (0-23)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      className="w-full max-w-xs border border-secondary-container rounded p-3 outline-none focus:border-primary"
                      value={form.autoRemindersHour}
                      onChange={(e) => set("autoRemindersHour", Number(e.target.value))}
                    />
                    <p className="text-body-sm text-secondary mt-1">
                      Solo envía el día exacto en que vence el intervalo (meses según género/tipo)
                      desde la última donación, con Aceptado = Sí y sin recordatorio previo.
                    </p>
                  </div>
                </div>
              </section>
              <section className="bg-white p-lg rounded-xl shadow-level-1 border border-secondary-container">
                <div className="flex items-center gap-3 mb-md border-b border-secondary-container pb-sm">
                  <Icon name="location_on" className="text-primary text-[28px]" />
                  <h3 className="text-title-lg">Datos de sede</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <Field label="Nombre" value={form.siteName} onChange={(v) => set("siteName", v)} />
                  <Field label="Teléfono" value={form.sitePhone} onChange={(v) => set("sitePhone", v)} />
                  <Field
                    label="Dirección"
                    value={form.siteAddress}
                    onChange={(v) => set("siteAddress", v)}
                    className="md:col-span-2"
                  />
                  <Field
                    label="Enlace para agendar cita"
                    value={form.appointmentLink}
                    onChange={(v) => set("appointmentLink", v)}
                    className="md:col-span-2"
                  />
                </div>
              </section>
            </>
          ) : null}

          {tab === "canales" ? (
            <section className="bg-white p-lg rounded-xl shadow-level-1 border border-secondary-container space-y-lg">
              <div className="flex items-center gap-3 mb-md border-b border-secondary-container pb-sm">
                <Icon name="chat" className="text-primary text-[28px]" />
                <div>
                  <h3 className="text-title-lg">WhatsApp</h3>
                  <p className="text-body-sm text-secondary mt-1">
                    Escanee el código QR con su teléfono para vincular WhatsApp y enviar recordatorios.
                  </p>
                </div>
              </div>

              <OpenWaQrPanel
                enabled
                config={{
                  whatsappMode: "openwa",
                  whatsappOpenWaUrl: form.whatsappOpenWaUrl || "http://localhost:2785",
                  whatsappOpenWaApiKey: form.whatsappOpenWaApiKey,
                  whatsappOpenWaSessionId: form.whatsappOpenWaSessionId || "default",
                  openwaWebhookSecret: form.openwaWebhookSecret,
                  whatsappDailyLimit: form.whatsappDailyLimit,
                }}
                onBeforeAction={saveBeforeOpenWa}
                onSessionUuid={(uuid) => void persistSessionUuid(uuid)}
              />

              <div className="border-t border-secondary-container pt-lg">
                <div className="flex items-center gap-3 mb-md">
                  <Icon name="event" className="text-primary text-[28px]" />
                  <div>
                    <h3 className="text-title-lg">Google Calendar</h3>
                    <p className="text-body-sm text-secondary mt-1">
                      Cuando un donante confirma cita por WhatsApp, se crea un evento en el calendario
                      Google conectado aquí (cuenta del personal del hemocentro).
                    </p>
                  </div>
                </div>
                <div className="bg-surface-container-low p-md rounded-lg border border-secondary-container/50 space-y-md">
                  {!form.hasGoogleOAuthConfig ? (
                    <div className="space-y-md">
                      <p className="text-body-sm text-secondary">
                        Las credenciales OAuth de Google se configuran una sola vez en el archivo{" "}
                        <code>.env</code> del servidor (no en esta pantalla):
                      </p>
                      <ul className="text-body-sm text-secondary list-disc pl-5 space-y-1">
                        <li>
                          <code>GOOGLE_CLIENT_ID</code>
                        </li>
                        <li>
                          <code>GOOGLE_CLIENT_SECRET</code>
                        </li>
                        <li>
                          <code>GOOGLE_REDIRECT_URI</code> (opcional)
                        </li>
                      </ul>
                      <p className="text-body-xs text-secondary">
                        En Google Cloud → Origen JS:{" "}
                        <code>{typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}</code>
                        {" · "}URI redirect:{" "}
                        <code>
                          {typeof window !== "undefined"
                            ? `${window.location.origin}/api/auth/google/callback`
                            : "http://localhost:3000/api/auth/google/callback"}
                        </code>
                      </p>
                      <p className="text-body-sm text-error">
                        OAuth no detectado en el servidor. Reinicie la app después de editar el .env.
                      </p>
                    </div>
                  ) : form.hasGoogleCredentials || form.hasGoogleOAuth ? (
                    <div className="space-y-2">
                      <p className="text-body-md text-tertiary-container flex items-center gap-2">
                        <Icon name="check_circle" className="text-tertiary" />
                        Google Calendar conectado
                        {form.googleConnectedEmail ? ` (${form.googleConnectedEmail})` : ""}
                      </p>
                      <p className="text-body-sm text-secondary">
                        Las citas se crean en Google Calendar cuando un donante responde <strong>Sí</strong> por
                        WhatsApp. El personal registrado recibe invitación al calendario con cada cita.
                      </p>
                      <Field
                        label="ID del calendario Google (primary o calendario compartido)"
                        value={form.googleCalendarId}
                        onChange={(v) => set("googleCalendarId", v)}
                        className="mt-2"
                      />
                    </div>
                  ) : (
                    <>
                      {form.googleOAuthFromEnv ? (
                        <p className="text-body-sm text-tertiary-container flex items-center gap-2">
                          <Icon name="check_circle" className="text-tertiary" />
                          Credenciales OAuth cargadas desde el .env del servidor
                        </p>
                      ) : null}
                      <p className="text-body-md text-secondary">
                        Conecte la cuenta Google del hemocentro (ej. correo del funcionario que revisa
                        el calendario). Sin esta conexión, las citas se guardan en la app pero{" "}
                        <strong>no aparecen en Google Calendar</strong>.
                      </p>
                      <Button variant="outline" onClick={() => void connectGoogleCalendar()}>
                        <Icon name="account_circle" /> Conectar Google Calendar
                      </Button>
                      <div className="rounded-lg border border-amber-soft bg-amber-soft/40 p-3 text-body-sm text-secondary space-y-1">
                        <p className="font-medium text-on-surface">Si Google muestra «Acceso bloqueado» (403)</p>
                        <p>
                          En Google Cloud → <strong>Pantalla de consentimiento OAuth</strong> →{" "}
                          <strong>Usuarios de prueba</strong>, agregue cada correo que usará la app
                          (ej. <code>zynktechsas@gmail.com</code>). En modo Prueba solo esos correos pueden
                          iniciar sesión.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <details className="border border-secondary-container rounded-lg">
                <summary className="cursor-pointer p-md text-title-md text-secondary select-none">
                  Configuración avanzada (administrador del sistema)
                </summary>
                <div className="p-md pt-0 space-y-md border-t border-secondary-container">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block md:col-span-2">
                      <span className="text-label-md text-secondary uppercase mb-1 block">Modo de envío WhatsApp</span>
                      <select
                        className="w-full border border-secondary-container rounded p-2 bg-white"
                        value={form.whatsappMode}
                        onChange={(e) =>
                          set("whatsappMode", e.target.value as Settings["whatsappMode"])
                        }
                      >
                        <option value="openwa">OpenWA (recomendado)</option>
                        <option value="wame">Enlace wa.me (manual)</option>
                        <option value="api">WhatsApp Cloud API (Meta)</option>
                      </select>
                    </label>
                    <Field
                      label="Límite diario WhatsApp"
                      value={String(form.whatsappDailyLimit)}
                      onChange={(v) => set("whatsappDailyLimit", Number(v) || 1000)}
                    />
                    <Field
                      label="URL base OpenWA"
                      value={form.whatsappOpenWaUrl}
                      onChange={(v) => set("whatsappOpenWaUrl", v)}
                    />
                    <Field
                      label="Nombre de sesión OpenWA"
                      value={form.whatsappOpenWaSessionId}
                      onChange={(v) => set("whatsappOpenWaSessionId", v)}
                    />
                    {form.openWaFromEnv ? (
                      <p className="text-body-sm text-tertiary-container md:col-span-2 flex items-center gap-2">
                        <Icon name="check_circle" className="text-tertiary" />
                        API Key OpenWA cargada desde WHATSAPP_OPENWA_API_KEY en .env
                      </p>
                    ) : (
                      <label className="block">
                        <span className="text-label-md text-secondary uppercase mb-1 block">API Key OpenWA</span>
                        <input
                          type="password"
                          className="w-full border border-secondary-container rounded p-2 font-mono"
                          value={form.whatsappOpenWaApiKey}
                          onChange={(e) => set("whatsappOpenWaApiKey", e.target.value)}
                          placeholder={form.hasWhatsappOpenWaApiKey ? "********" : "WHATSAPP_OPENWA_API_KEY en .env"}
                        />
                      </label>
                    )}
                    <Field
                      label="Secreto webhook OpenWA"
                      value={form.openwaWebhookSecret}
                      onChange={(v) => set("openwaWebhookSecret", v)}
                      className="md:col-span-2"
                    />
                    <Field
                      label="ID del calendario Google"
                      value={form.googleCalendarId}
                      onChange={(v) => set("googleCalendarId", v)}
                      className="md:col-span-2"
                    />
                    <label className="block md:col-span-2">
                      <span className="text-label-md text-secondary uppercase mb-1 block">
                        Credenciales JSON Google (cuenta de servicio)
                      </span>
                      <textarea
                        className="w-full min-h-[100px] border border-secondary-container rounded p-2 font-mono text-body-sm"
                        value={
                          form.googleCredentialsJson === "********" ? "" : form.googleCredentialsJson
                        }
                        onChange={(e) => set("googleCredentialsJson", e.target.value)}
                        placeholder={
                          form.hasGoogleCredentials
                            ? "******** (deje vacío para mantener)"
                            : '{"type":"service_account",...}'
                        }
                      />
                    </label>
                  </div>

                  <div className="bg-surface-container-low p-md rounded-lg border border-secondary-container/50">
                    <div className="flex items-center gap-2 mb-4">
                      <Icon name="mail" className="text-secondary" />
                      <h4 className="text-title-md">SMTP (correo electrónico)</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Servidor SMTP" value={form.smtpHost} onChange={(v) => set("smtpHost", v)} />
                      <Field
                        label="Puerto"
                        value={String(form.smtpPort)}
                        onChange={(v) => set("smtpPort", Number(v) || 587)}
                      />
                      <Field label="Usuario" value={form.smtpUser} onChange={(v) => set("smtpUser", v)} />
                      <label className="block">
                        <span className="text-label-md text-secondary uppercase mb-1 block">Contraseña</span>
                        <input
                          type="password"
                          className="w-full border border-secondary-container rounded p-2 font-mono"
                          value={form.smtpPass}
                          onChange={(e) => set("smtpPass", e.target.value)}
                          placeholder={form.hasSmtpPass ? "********" : ""}
                        />
                      </label>
                      <Field
                        label="Remitente (From)"
                        value={form.smtpFrom}
                        onChange={(v) => set("smtpFrom", v)}
                        className="md:col-span-2"
                      />
                    </div>
                  </div>
                </div>
              </details>
            </section>
          ) : null}

          {tab === "datos" ? (
            <section className="bg-white p-lg rounded-xl shadow-level-1 border border-secondary-container">
              <div className="flex items-center gap-3 mb-md border-b border-secondary-container pb-sm">
                <Icon name="upload_file" className="text-primary text-[28px]" />
                <h3 className="text-title-lg">Cargar plano de base de datos</h3>
              </div>
              <DatabaseUploadPanel />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded text-title-md ${
        active
          ? "bg-surface-container-high text-primary border-l-4 border-primary"
          : "hover:bg-surface-container-low text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function IntervalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-label-md text-secondary uppercase mb-1 block">{label}</span>
      <input
        type="number"
        min={1}
        max={24}
        className="w-full border border-secondary-container rounded p-2 outline-none focus:border-primary"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-label-md text-secondary uppercase mb-1 block">{label}</span>
      <input
        className="w-full border border-secondary-container rounded p-2 outline-none focus:border-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
