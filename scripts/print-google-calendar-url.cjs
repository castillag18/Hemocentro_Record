/**
 * Imprime la URL de autorización de Google Calendar (sin cookies del navegador).
 * Luego use: npm run google:connect-calendar y pegue el code.
 */
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI?.trim() ||
  `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

if (!clientId || !clientSecret) {
  console.error("Defina GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
  ],
});

console.log("\nAbra esta URL y autorice Calendar:\n");
console.log(url);
console.log("\nLuego ejecute: npm run google:connect-calendar\n");
