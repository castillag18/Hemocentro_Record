/**
 * Conecta Google Calendar sin depender de cookies del navegador.
 *
 * 1. Ejecute: node scripts/connect-google-calendar.cjs
 * 2. Abra la URL que imprime y autorice con la cuenta del funcionario
 * 3. Copie el parámetro "code" de la URL de redirección (o la URL completa)
 * 4. Péguelo cuando el script lo pida
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");
const { PrismaClient } = require("@prisma/client");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function extractCode(input) {
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

async function connectViaApi(code) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL || "admin@hemocentro.local",
      password: process.env.SEED_ADMIN_PASSWORD || "Admin123!",
    }),
  });
  if (!loginRes.ok) throw new Error("Login admin falló — inicie sesión manualmente y use la página Citas");
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] || "";
  const res = await fetch(`${base}/api/google-calendar/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
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
    scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"],
  });

  console.log("\n=== Conectar Google Calendar ===\n");
  console.log("1) Abra esta URL:\n");
  console.log(url);
  console.log("\n2) Autorice con el correo del funcionario.");
  console.log("3) Copie la URL completa de redirección (aunque muestre error de sesión).\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await new Promise((resolve) => {
    rl.question("Pegue el code o la URL de redirección: ", resolve);
  });
  rl.close();

  const code = extractCode(pasted);
  if (!code) {
    console.error("No se encontró un code válido.");
    process.exit(1);
  }

  try {
    const viaApi = await connectViaApi(code);
    console.log("\nGoogle Calendar conectado vía API:");
    console.log(JSON.stringify(viaApi, null, 2));
    console.log("\nVerifique: node scripts/check-google-oauth.cjs");
    return;
  } catch (apiErr) {
    console.warn("API connect falló, guardando directo en BD:", apiErr.message);
  }

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error("\nRevoke acceso en https://myaccount.google.com/permissions e intente de nuevo.");
    process.exit(1);
  }

  const oauth2api = google.oauth2({ version: "v2", auth: oauth2 });
  oauth2api.setCredentials(tokens);
  const profile = await oauth2api.userinfo.get();
  const email = profile.data.email?.toLowerCase() || "";

  const p = new PrismaClient();
  const current = await p.settings.findUnique({ where: { id: "default" } });
  await p.settings.update({
    where: { id: "default" },
    data: {
      googleRefreshToken: tokens.refresh_token,
      googleAccessToken: tokens.access_token ?? undefined,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      googleConnectedEmail: email,
      googleCalendarId: current?.googleCalendarId || "primary",
    },
  });
  await p.$disconnect();

  console.log("\nGoogle Calendar conectado (BD directa):", email);
  console.log("Ejecute: npm run google:test-calendar");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
