const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  if (!s) {
    console.log(JSON.stringify({ error: "no settings" }));
    return;
  }

  const base = (s.whatsappOpenWaUrl || "http://localhost:2785").replace(/\/$/, "");
  const uuid = s.whatsappOpenWaSessionId;
  const key = s.whatsappOpenWaApiKey || process.env.WHATSAPP_OPENWA_API_KEY || "";
  const headers = { "Content-Type": "application/json" };
  if (key) headers["X-API-Key"] = key;

  const health = await fetch(`${base}/api/health`, { headers }).then((r) => ({
    ok: r.ok,
    status: r.status,
  }));

  let session = null;
  if (uuid) {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}`, { headers });
    const data = await res.json().catch(() => ({}));
    session = {
      httpStatus: res.status,
      status: data.status ?? data.state ?? null,
      phone: data.phone ?? null,
      pushName: data.pushName ?? null,
      error: data.error ?? data.message ?? null,
    };
  }

  console.log(
    JSON.stringify({
      hasApiKey: Boolean(key.trim()),
      sessionIdStored: uuid ? `${uuid.slice(0, 8)}...` : null,
      isUuid: /^[0-9a-f-]{36}$/i.test(uuid || ""),
      health,
      session,
    }),
  );

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
