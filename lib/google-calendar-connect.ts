import { prisma } from "./prisma";
import { exchangeGoogleCode } from "./google-oauth";
import { syncPendingAppointmentsToCalendar } from "./google-calendar";
import { getSettings } from "./settings";

export function extractGoogleAuthCode(input: string) {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.includes("code=")) {
    try {
      const url = new URL(raw.startsWith("http") ? raw : `http://local?${raw.replace(/^\?/, "")}`);
      return url.searchParams.get("code") || "";
    } catch {
      const match = raw.match(/[?&]code=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : raw;
    }
  }
  return raw;
}

export async function connectGoogleCalendarFromCode(codeInput: string) {
  const code = extractGoogleAuthCode(codeInput);
  if (!code) throw new Error("Código OAuth inválido");

  let googleUser;
  try {
    googleUser = await exchangeGoogleCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid_grant|expired|revoked/i.test(message)) {
      throw new Error(
        "El código OAuth expiró o ya se usó. Pulse «Conectar Google Calendar» de nuevo y complete el flujo en menos de 1 minuto.",
      );
    }
    throw error;
  }
  if (!googleUser.email) throw new Error("Google no devolvió correo");

  const current = await getSettings();
  const refreshToken = googleUser.refreshToken ?? current.googleRefreshToken;
  if (!refreshToken) {
    throw new Error(
      "Google no entregó permiso persistente. Revoke el acceso en myaccount.google.com/permissions e intente de nuevo.",
    );
  }

  await prisma.settings.update({
    where: { id: "default" },
    data: {
      googleRefreshToken: refreshToken,
      googleAccessToken: googleUser.accessToken ?? undefined,
      googleTokenExpiry: googleUser.expiryDate ?? undefined,
      googleConnectedEmail: googleUser.email,
      googleCalendarId: current.googleCalendarId || "primary",
    },
  });

  const updated = await getSettings();
  const sync = await syncPendingAppointmentsToCalendar(updated);

  return {
    email: googleUser.email,
    hadNewRefreshToken: Boolean(googleUser.refreshToken),
    ...sync,
  };
}
