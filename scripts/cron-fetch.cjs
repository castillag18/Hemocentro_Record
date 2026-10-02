/**
 * POST a rutas /api/cron/* probando varias URLs base.
 * En la misma VM, 127.0.0.1 suele funcionar cuando la IP LAN (192.168.x.x) falla.
 */
function cronBaseUrls() {
  const port = process.env.PORT?.trim() || "3000";
  const candidates = [
    process.env.CRON_APP_URL?.trim(),
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
  ].filter(Boolean);

  const seen = new Set();
  return candidates.filter((raw) => {
    const base = raw.replace(/\/$/, "");
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });
}

async function postCron(pathWithQuery) {
  const secret = process.env.CRON_SECRET ?? "hemocentro-cron-dev";
  const bases = cronBaseUrls();
  if (!bases.length) {
    console.error("No hay URL base configurada (CRON_APP_URL o NEXT_PUBLIC_APP_URL).");
    process.exit(1);
  }

  let lastErr = null;
  for (const base of bases) {
    const url = `${base.replace(/\/$/, "")}${pathWithQuery}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-cron-secret": secret },
      });
      const body = await res.text();
      console.log("url:", url);
      console.log("status:", res.status);
      console.log(body);
      if (!res.ok) process.exit(1);
      return;
    } catch (err) {
      lastErr = err;
      const detail = err.cause?.code || err.cause?.message || err.message;
      console.error("failed:", url, detail);
    }
  }

  console.error("fetch failed — probó:", bases.join(", "));
  if (lastErr?.cause) console.error("último error:", lastErr.cause);
  console.error("¿La app está corriendo? (npm run start o npm run dev)");
  process.exit(1);
}

module.exports = { cronBaseUrls, postCron };
