/**
 * Diagnóstico rápido en el servidor Linux (BD app, HUAV, OpenWA, cron).
 * Uso: npm run server:diagnose
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadEnv, buildHuavDatabaseUrl } = require("./load-env.cjs");

loadEnv();

function line(ok, label, detail = "") {
  const icon = ok ? "✓" : "❌";
  console.log(`${icon} ${label}${detail ? `: ${detail}` : ""}`);
  return ok;
}

function dbNameFromUrl(url) {
  if (!url) return "";
  try {
    const normalized = url.replace(/^mysql:\/\//, "http://");
    return decodeURIComponent(new URL(normalized).pathname.replace(/^\//, "").split("?")[0]);
  } catch {
    return "";
  }
}

async function checkOpenWa() {
  const url = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const sessions = data.sessions ?? data.activeSessions;
    return { ok: true, detail: sessions != null ? `${sessions} sesión(es)` : "respondiendo" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" Diagnóstico servidor — HUAV Recordatorio");
  console.log("══════════════════════════════════════════════════════════════\n");

  let failures = 0;

  const appDb = dbNameFromUrl(process.env.DATABASE_URL);
  const huavDb = (process.env.HUAV_DB_NAME || "huav").trim();
  if (appDb.toLowerCase() === huavDb.toLowerCase()) {
    failures += line(
      false,
      "DATABASE_URL",
      `apunta a «${appDb}» (debe ser hemocentro_app, NO huav corporativa)`,
    );
    console.log("   → Corrija .env: DATABASE_URL=...@192.168.1.4:3306/hemocentro_app\n");
  } else {
    line(true, "DATABASE_URL", `«${appDb || "?"}» separada de HUAV`);
  }

  const dbCheck = spawnSync(process.execPath, [path.join(__dirname, "check-db.cjs")], {
    encoding: "utf8",
    env: process.env,
  });
  if (dbCheck.status !== 0) {
    failures += 1;
    console.log(dbCheck.stdout || dbCheck.stderr || "check-db falló");
  } else {
    console.log(dbCheck.stdout.trim());
  }

  console.log("");
  const huavCheck = spawnSync(process.execPath, [path.join(__dirname, "check-huav-db.cjs")], {
    encoding: "utf8",
    env: process.env,
  });
  if (huavCheck.status !== 0) {
    failures += 1;
    console.log(huavCheck.stdout || huavCheck.stderr || "check-huav-db falló");
  } else {
    console.log(huavCheck.stdout.trim());
  }

  console.log("");
  const tsxCli = path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs");
  if (!line(fs.existsSync(tsxCli), "tsx (cron openwa:poll-inbox)", fs.existsSync(tsxCli) ? "instalado" : "FALTA — npm install")) {
    failures += 1;
  }

  const openwa = await checkOpenWa();
  if (!line(openwa.ok, "OpenWA", openwa.detail)) failures += 1;

  const sqlPath =
    process.env.HUAV_DONORS_SQL?.trim() || path.join(process.cwd(), "donantes_info.sql");
  if (!line(fs.existsSync(sqlPath), "donantes_info.sql", path.basename(sqlPath))) failures += 1;

  const pollLog = path.join(process.cwd(), "logs", "openwa-poll.log");
  if (fs.existsSync(pollLog)) {
    const tail = fs.readFileSync(pollLog, "utf8").split(/\r?\n/).slice(-5).join("\n");
    console.log("\nÚltimas líneas logs/openwa-poll.log:");
    console.log(tail || "(vacío)");
  } else {
    console.log("\n⚠ No existe logs/openwa-poll.log — ¿cron configurado?");
    console.log("  * * * * * cd /opt/Hemocentro_Record && npm run openwa:poll-inbox >> logs/openwa-poll.log 2>&1");
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  if (failures) {
    console.log(` ${failures} problema(s) detectado(s). Revise arriba.`);
    console.log("\n WhatsApp agendamiento — pruebas manuales:");
    console.log("   npm run openwa:diagnose");
    console.log("   npm run openwa:poll-inbox");
    process.exit(1);
  }

  console.log(" Todo OK en diagnóstico básico.");
  console.log("\n Si WhatsApp no responde al «Sí»:");
  console.log("   1. npm run openwa:diagnose  (donante identificado?)");
  console.log("   2. npm run openwa:poll-inbox (step: awaiting_slot_selection?)");
  console.log("   3. Verifique cron + sesión OpenWA con QR activo");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
