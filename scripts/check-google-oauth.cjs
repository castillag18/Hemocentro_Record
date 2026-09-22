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
const p = new PrismaClient();

async function main() {
  const settings = await p.settings.findUnique({
    where: { id: "default" },
    select: {
      googleConnectedEmail: true,
      googleRefreshToken: true,
      googleClientId: true,
      googleCalendarId: true,
    },
  });
  const users = await p.adminUser.findMany({ select: { email: true, active: true } });
  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN?.trim() || settings?.googleRefreshToken?.trim() || "";
  const credentialsJson =
    process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON?.trim() || settings?.googleCredentialsJson?.trim() || "";
  console.log(
    JSON.stringify(
      {
        googleConnectedEmail:
          process.env.GOOGLE_CONNECTED_EMAIL?.trim() || settings?.googleConnectedEmail || "",
        hasRefreshToken: Boolean(refreshToken),
        hasServiceAccount: Boolean(credentialsJson),
        calendarConfigured: Boolean(refreshToken || credentialsJson),
        hasOAuthEnv: Boolean(
          process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
        ),
        calendarId:
          process.env.GOOGLE_CALENDAR_ID?.trim() || settings?.googleCalendarId || "primary",
        adminUsers: users,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
