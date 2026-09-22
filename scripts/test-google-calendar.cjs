/**
 * Prueba creación de evento en Google Calendar.
 * Requiere Google Calendar conectado (UI) o GOOGLE_REFRESH_TOKEN / GOOGLE_CALENDAR_CREDENTIALS_JSON en .env
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN?.trim() || settings?.googleRefreshToken?.trim() || "";
  const credentialsJson =
    process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON?.trim() || settings?.googleCredentialsJson?.trim() || "";
  const calendarId =
    process.env.GOOGLE_CALENDAR_ID?.trim() || settings?.googleCalendarId?.trim() || "primary";

  console.log("Calendar config:", {
    hasRefreshToken: Boolean(refreshToken),
    hasServiceAccount: Boolean(credentialsJson),
    calendarId,
    connectedEmail: settings?.googleConnectedEmail || process.env.GOOGLE_CONNECTED_EMAIL || "",
  });

  if (!refreshToken && !credentialsJson) {
    console.error("\nGoogle Calendar NO conectado.");
    console.error("Conecte en Configuración → Conectar Google Calendar");
    console.error("O defina GOOGLE_REFRESH_TOKEN / GOOGLE_CALENDAR_CREDENTIALS_JSON en .env");
    process.exit(1);
  }

  const { google } = require("googleapis");

  let auth;
  if (refreshToken) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;
    if (!clientId || !clientSecret) {
      console.error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env");
      process.exit(1);
    }
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2.setCredentials({ refresh_token: refreshToken });
    auth = oauth2;
  } else {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
  }

  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date(Date.now() + 7 * 86400000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 3600000);

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: "Prueba HUAV — donación de sangre",
      description: "Evento de prueba generado por scripts/test-google-calendar.cjs",
      location: settings?.siteAddress || "Carrera 13 # 13c-39, Valledupar, Cesar",
      start: { dateTime: start.toISOString(), timeZone: "America/Bogota" },
      end: { dateTime: end.toISOString(), timeZone: "America/Bogota" },
    },
  });

  console.log("\nEvento creado OK:");
  console.log("  id:", event.data.id);
  console.log("  htmlLink:", event.data.htmlLink);
  await p.$disconnect();
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
