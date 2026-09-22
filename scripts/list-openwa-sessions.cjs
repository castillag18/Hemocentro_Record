const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  const base = (s?.whatsappOpenWaUrl || process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(
    /\/$/,
    "",
  );
  const key = s?.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const headers = { "Content-Type": "application/json" };
  if (key) headers["X-API-Key"] = key;

  const res = await fetch(`${base}/api/sessions`, { headers });
  const data = await res.json().catch(() => []);
  const sessions = Array.isArray(data)
    ? data.map((x) => ({
        id: `${String(x.id).slice(0, 8)}...`,
        name: x.name,
        status: x.status ?? x.state,
        phone: x.phone ? "set" : null,
      }))
    : { error: data };

  console.log(JSON.stringify({ httpStatus: res.status, storedSessionId: s?.whatsappOpenWaSessionId?.slice(0, 8) + "...", sessions }, null, 2));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
