import { prisma } from "./prisma";
import { createSessionToken } from "./auth";
import { extractGoogleAuthCode } from "./google-calendar-connect";
import { exchangeGoogleCode } from "./google-oauth";
import { getSettings } from "./settings";
import { syncPendingAppointmentsToCalendar } from "./google-calendar";

export async function loginWithGoogleCode(codeInput: string) {
  const code = extractGoogleAuthCode(codeInput);
  if (!code) throw new Error("Código OAuth inválido");

  let googleUser;
  try {
    googleUser = await exchangeGoogleCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid_grant|expired|revoked/i.test(message)) {
      throw new Error(
        "El código OAuth expiró o ya se usó. Vuelva a iniciar sesión con Google y pegue la URL de inmediato.",
      );
    }
    throw error;
  }

  if (!googleUser.email) throw new Error("Google no devolvió correo");

  const admin = await prisma.adminUser.findFirst({
    where: { email: googleUser.email.toLowerCase(), active: true },
  });
  if (!admin) {
    throw new Error(
      `El correo ${googleUser.email} no está registrado. Un administrador debe crearlo en Usuarios.`,
    );
  }

  const current = await getSettings();
  const refreshToken = googleUser.refreshToken ?? current.googleRefreshToken;
  let calendarSync = { synced: 0, failed: 0 };
  if (refreshToken) {
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
    calendarSync = await syncPendingAppointmentsToCalendar(updated);
  }

  const token = await createSessionToken({ userId: admin.id, email: admin.email });

  return {
    token,
    email: admin.email,
    calendarConnected: Boolean(refreshToken),
    ...calendarSync,
  };
}
