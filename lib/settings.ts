import type { Settings } from "@prisma/client";
import { isOpenWaSessionUuid } from "./openwa-session";
import { prisma } from "./prisma";

const DEFAULT_OPENWA_SESSION = "default";

export function openWaEnvConfigured() {
  return Boolean(process.env.WHATSAPP_OPENWA_API_KEY?.trim());
}

export function resolveOpenWaApiKey(stored?: string | null) {
  return process.env.WHATSAPP_OPENWA_API_KEY?.trim() || stored?.trim() || "";
}

export function resolveOpenWaSessionId(stored?: string | null) {
  const value =
    stored?.trim() || process.env.WHATSAPP_OPENWA_SESSION_ID?.trim() || DEFAULT_OPENWA_SESSION;
  // UUIDs son efímeros (cambian al reiniciar OpenWA); usar siempre el nombre de sesión.
  if (isOpenWaSessionUuid(value)) return DEFAULT_OPENWA_SESSION;
  return value;
}

export function resolveOpenWaWebhookSecret(stored?: string | null) {
  return process.env.OPENWA_WEBHOOK_SECRET?.trim() || stored?.trim() || "";
}

/** URL del webhook tal como OpenWA debe llamarla (desde su contenedor/proceso). */
export function resolveOpenWaWebhookUrl() {
  const explicit = process.env.OPENWA_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const port = process.env.PORT?.trim() || "3000";
  const path = "/api/webhooks/openwa";
  const openWaUrl = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").toLowerCase();
  const openWaOnLocalHost =
    openWaUrl.includes("localhost:2785") || openWaUrl.includes("127.0.0.1:2785");

  // OpenWA en Docker no alcanza localhost:3000 del host (Windows/macOS).
  if (openWaOnLocalHost && (process.platform === "win32" || process.platform === "darwin")) {
    return `http://host.docker.internal:${port}${path}`;
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
  return `${base}${path}`;
}

function resolveGoogleCalendarId(stored?: string | null) {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || stored?.trim() || "primary";
}

function resolveGoogleCredentialsJson(stored?: string | null) {
  return process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON?.trim() || stored?.trim() || null;
}

function resolveGoogleRefreshToken(stored?: string | null) {
  return process.env.GOOGLE_REFRESH_TOKEN?.trim() || stored?.trim() || null;
}

function resolveGoogleConnectedEmail(stored?: string | null) {
  return process.env.GOOGLE_CONNECTED_EMAIL?.trim() || stored?.trim() || "";
}

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: "default" } });
  if (existing) {
    return {
      ...existing,
      whatsappMode:
        existing.whatsappMode === "wame" &&
        (existing.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY)
          ? "openwa"
          : existing.whatsappMode,
      whatsappOpenWaApiKey: resolveOpenWaApiKey(existing.whatsappOpenWaApiKey),
      whatsappOpenWaUrl:
        existing.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785",
      whatsappOpenWaSessionId: resolveOpenWaSessionId(existing.whatsappOpenWaSessionId),
      openwaWebhookSecret: resolveOpenWaWebhookSecret(existing.openwaWebhookSecret),
      googleCalendarId: resolveGoogleCalendarId(existing.googleCalendarId),
      googleCredentialsJson: resolveGoogleCredentialsJson(existing.googleCredentialsJson),
      googleRefreshToken: resolveGoogleRefreshToken(existing.googleRefreshToken),
      googleConnectedEmail: resolveGoogleConnectedEmail(existing.googleConnectedEmail),
    };
  }

  return prisma.settings.create({
    data: {
      id: "default",
      smtpHost: process.env.SMTP_HOST ?? "",
      smtpPort: Number(process.env.SMTP_PORT ?? 587) || 587,
      smtpUser: process.env.SMTP_USER ?? "",
      smtpPass: process.env.SMTP_PASS ?? "",
      smtpFrom: process.env.SMTP_FROM ?? "",
      whatsappMode: process.env.WHATSAPP_MODE ?? "wame",
      whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
      whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
      whatsappOpenWaUrl: process.env.WHATSAPP_OPENWA_URL ?? "http://localhost:2785",
      whatsappOpenWaApiKey: process.env.WHATSAPP_OPENWA_API_KEY ?? "",
      whatsappOpenWaSessionId: process.env.WHATSAPP_OPENWA_SESSION_ID ?? DEFAULT_OPENWA_SESSION,
      whatsappDailyLimit: Number(process.env.WHATSAPP_DAILY_LIMIT ?? 1000) || 1000,
      specialDatesJson: null,
      googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
      googleCredentialsJson: process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON ?? "",
      openwaWebhookSecret: process.env.OPENWA_WEBHOOK_SECRET ?? "",
    },
  });
}

export function publicSettings(settings: Settings) {
  return {
    ...settings,
    whatsappDailyLimit: settings.whatsappDailyLimit ?? 1000,
    autoRemindersEnabled: settings.autoRemindersEnabled ?? false,
    autoRemindersHour: settings.autoRemindersHour ?? 8,
    openwaWebhookSecret: settings.openwaWebhookSecret ?? "",
    smtpPass: settings.smtpPass ? "********" : "",
    hasSmtpPass: Boolean(settings.smtpPass),
    whatsappAccessToken: settings.whatsappAccessToken ? "********" : "",
    hasWhatsappToken: Boolean(settings.whatsappAccessToken),
    whatsappVerifyToken: settings.whatsappVerifyToken ? "********" : "",
    hasWhatsappVerifyToken: Boolean(settings.whatsappVerifyToken),
    whatsappOpenWaApiKey: settings.whatsappOpenWaApiKey ? "********" : "",
    googleCredentialsJson: settings.googleCredentialsJson ? "********" : "",
    hasGoogleCredentials: Boolean(settings.googleCredentialsJson || settings.googleRefreshToken),
    hasGoogleOAuth: Boolean(settings.googleRefreshToken),
    googleConnectedEmail: settings.googleConnectedEmail ?? "",
    googleRefreshToken: settings.googleRefreshToken ? "********" : "",
    googleAccessToken: settings.googleAccessToken ? "********" : "",
    googleClientId: "",
    googleClientSecret: "",
    hasGoogleClientSecret: false,
    googleOAuthFromEnv: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
    hasGoogleOAuthConfig: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
    openWaFromEnv: openWaEnvConfigured(),
    hasWhatsappOpenWaApiKey: Boolean(
      openWaEnvConfigured() || settings.whatsappOpenWaApiKey?.trim(),
    ),
  };
}

export function whatsappApiConfigured(settings: Settings) {
  return (
    settings.whatsappMode === "api" &&
    Boolean(settings.whatsappAccessToken && settings.whatsappPhoneNumberId)
  );
}
