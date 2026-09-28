import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaRouteError, jsonError, withAdminAuth } from "@/lib/api";
import { getSettings, openWaEnvConfigured, publicSettings } from "@/lib/settings";
import { agentDebugLog } from "@/lib/debug-log";

export async function GET() {
  const t0 = Date.now();
  const { error } = await withAdminAuth();
  const tAuth = Date.now();
  if (error) return error;
  try {
    const settings = await getSettings();
    const tDone = Date.now();
    // #region agent log
    agentDebugLog({
      hypothesisId: "PERF-A",
      location: "app/api/settings/route.ts:GET",
      message: "settings_timing",
      data: { authMs: tAuth - t0, settingsMs: tDone - tAuth, totalMs: tDone - t0 },
    });
    // #endregion
    return NextResponse.json(publicSettings(settings));
  } catch (err) {
    return handlePrismaRouteError(err);
  }
}

export async function PUT(request: Request) {
  const { error } = await withAdminAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Datos inválidos");

  const current = await getSettings();
  const smtpPass =
    typeof body.smtpPass === "string" && body.smtpPass && body.smtpPass !== "********"
      ? body.smtpPass
      : current.smtpPass;

  const whatsappAccessToken =
    typeof body.whatsappAccessToken === "string" &&
    body.whatsappAccessToken &&
    body.whatsappAccessToken !== "********"
      ? body.whatsappAccessToken
      : current.whatsappAccessToken;

  const whatsappVerifyToken =
    typeof body.whatsappVerifyToken === "string" &&
    body.whatsappVerifyToken &&
    body.whatsappVerifyToken !== "********"
      ? body.whatsappVerifyToken
      : current.whatsappVerifyToken;

  const whatsappOpenWaApiKey = openWaEnvConfigured()
    ? current.whatsappOpenWaApiKey
    : typeof body.whatsappOpenWaApiKey === "string" &&
        body.whatsappOpenWaApiKey &&
        body.whatsappOpenWaApiKey !== "********"
      ? body.whatsappOpenWaApiKey
      : current.whatsappOpenWaApiKey;

  const googleCredentialsJson =
    typeof body.googleCredentialsJson === "string" &&
    body.googleCredentialsJson &&
    body.googleCredentialsJson !== "********"
      ? body.googleCredentialsJson
      : current.googleCredentialsJson;

  const reminderDays = Number(body.reminderDays ?? current.reminderDays);
  if (!Number.isFinite(reminderDays) || reminderDays < 1 || reminderDays > 365) {
    return jsonError("La frecuencia de respaldo debe estar entre 1 y 365 días");
  }

  function parseMonths(
    value: unknown,
    fallback: number,
    label: string,
  ): { value: number } | { error: string } {
    const months = Number(value ?? fallback);
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      return { error: `${label} debe estar entre 1 y 24 meses` };
    }
    return { value: months };
  }

  const femaleWholeBloodMonths = parseMonths(
    body.femaleWholeBloodMonths,
    current.femaleWholeBloodMonths ?? 4,
    "Sangre total (mujer)",
  );
  if ("error" in femaleWholeBloodMonths) return jsonError(femaleWholeBloodMonths.error);

  const femaleApheresisMonths = parseMonths(
    body.femaleApheresisMonths,
    current.femaleApheresisMonths ?? 1,
    "Aféresis (mujer)",
  );
  if ("error" in femaleApheresisMonths) return jsonError(femaleApheresisMonths.error);

  const maleWholeBloodMonths = parseMonths(
    body.maleWholeBloodMonths,
    current.maleWholeBloodMonths ?? 3,
    "Sangre total (hombre)",
  );
  if ("error" in maleWholeBloodMonths) return jsonError(maleWholeBloodMonths.error);

  const maleApheresisMonths = parseMonths(
    body.maleApheresisMonths,
    current.maleApheresisMonths ?? 1,
    "Aféresis (hombre)",
  );
  if ("error" in maleApheresisMonths) return jsonError(maleApheresisMonths.error);

  const whatsappMode = String(body.whatsappMode ?? current.whatsappMode);
  if (whatsappMode !== "wame" && whatsappMode !== "api" && whatsappMode !== "openwa") {
    return jsonError("Modo WhatsApp inválido");
  }

  const whatsappDailyLimit = Number(body.whatsappDailyLimit ?? current.whatsappDailyLimit ?? 1000);
  if (!Number.isFinite(whatsappDailyLimit) || whatsappDailyLimit < 1 || whatsappDailyLimit > 5000) {
    return jsonError("El límite diario de WhatsApp debe estar entre 1 y 5000");
  }

  const autoRemindersHour = Number(body.autoRemindersHour ?? current.autoRemindersHour ?? 8);
  if (!Number.isFinite(autoRemindersHour) || autoRemindersHour < 0 || autoRemindersHour > 23) {
    return jsonError("La hora de envío automático debe estar entre 0 y 23");
  }

  const apheresisMonths = femaleApheresisMonths.value;

  const settings = await prisma.settings.update({
    where: { id: "default" },
    data: {
      reminderDays,
      femaleWholeBloodMonths: femaleWholeBloodMonths.value,
      femaleApheresisMonths: apheresisMonths,
      maleWholeBloodMonths: maleWholeBloodMonths.value,
      maleApheresisMonths: apheresisMonths,
      smtpHost: String(body.smtpHost ?? current.smtpHost),
      smtpPort: Number(body.smtpPort ?? current.smtpPort) || 587,
      smtpUser: String(body.smtpUser ?? current.smtpUser),
      smtpPass,
      smtpFrom: String(body.smtpFrom ?? current.smtpFrom),
      appointmentLink: String(body.appointmentLink ?? current.appointmentLink),
      siteName: String(body.siteName ?? current.siteName),
      siteAddress: String(body.siteAddress ?? current.siteAddress),
      sitePhone: String(body.sitePhone ?? current.sitePhone),
      whatsappMode,
      whatsappAccessToken,
      whatsappPhoneNumberId: String(body.whatsappPhoneNumberId ?? current.whatsappPhoneNumberId),
      whatsappApiVersion: String(body.whatsappApiVersion ?? current.whatsappApiVersion),
      whatsappVerifyToken,
      whatsappOpenWaUrl: String(body.whatsappOpenWaUrl ?? current.whatsappOpenWaUrl),
      whatsappOpenWaApiKey,
      whatsappOpenWaSessionId: String(body.whatsappOpenWaSessionId ?? current.whatsappOpenWaSessionId),
      whatsappDailyLimit,
      autoRemindersEnabled: Boolean(body.autoRemindersEnabled ?? current.autoRemindersEnabled),
      autoRemindersHour,
      googleCalendarId: String(body.googleCalendarId ?? current.googleCalendarId),
      googleCredentialsJson,
      googleClientId: current.googleClientId,
      googleClientSecret: current.googleClientSecret,
      openwaWebhookSecret: String(body.openwaWebhookSecret ?? current.openwaWebhookSecret),
    },
  });

  return NextResponse.json(publicSettings(settings));
}
