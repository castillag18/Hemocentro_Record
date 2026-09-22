import { google } from "googleapis";
import type { Settings } from "@prisma/client";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function getGoogleRedirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/google/callback`
  );
}

export function getGoogleJavascriptOrigin() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export function googleOAuthEnvConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export async function resolveGoogleOAuthConfig() {
  const redirectUri = getGoogleRedirectUri();
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
    redirectUri,
  };
}

export async function googleOAuthConfigured() {
  const { clientId, clientSecret } = await resolveGoogleOAuthConfig();
  return Boolean(clientId && clientSecret);
}

export async function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = await resolveGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

const LOGIN_SCOPES = ["openid", "email", "profile"];

export async function getGoogleAuthUrl(
  state: string,
  options: { mode: "login" | "calendar"; requestCalendar?: boolean },
) {
  const client = await createOAuth2Client();
  const requestCalendar = options.requestCalendar ?? options.mode === "calendar";
  const scopes = requestCalendar ? [...LOGIN_SCOPES, CALENDAR_SCOPE] : LOGIN_SCOPES;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: requestCalendar ? "consent" : "select_account",
    scope: scopes,
    state,
  });
}

export async function exchangeGoogleCode(code: string) {
  const client = await createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const email = profile.data.email?.toLowerCase() ?? "";

  return {
    email,
    name: profile.data.name ?? "",
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export function googleCalendarConfigured(settings: Settings) {
  const hasServiceAccount = Boolean(settings.googleCalendarId && settings.googleCredentialsJson);
  const hasOAuth = Boolean(settings.googleRefreshToken);
  return hasServiceAccount || hasOAuth;
}

async function getOAuthCalendarClient(settings: Settings) {
  if (!settings.googleRefreshToken) {
    throw new Error("Google Calendar OAuth no conectado");
  }

  const client = await createOAuth2Client();
  client.setCredentials({
    refresh_token: settings.googleRefreshToken,
    access_token: settings.googleAccessToken ?? undefined,
    expiry_date: settings.googleTokenExpiry?.getTime(),
  });

  if (
    settings.googleTokenExpiry &&
    settings.googleTokenExpiry.getTime() < Date.now() + 60_000
  ) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    return { client, refreshed: credentials };
  }

  return { client, refreshed: null };
}

export async function getCalendarAuth(settings: Settings) {
  if (settings.googleRefreshToken) {
    const { client, refreshed } = await getOAuthCalendarClient(settings);
    return { auth: client, refreshed };
  }

  if (settings.googleCredentialsJson) {
    const credentials = JSON.parse(settings.googleCredentialsJson) as Record<string, string>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    return { auth, refreshed: null };
  }

  throw new Error("Google Calendar no está configurado");
}

export { CALENDAR_SCOPE };
