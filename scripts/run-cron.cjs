/**
 * Ejecuta recordatorios automáticos (directo en Node; evita timeout HTTP con lotes grandes).
 * Programar cada hora: npm run cron:reminders:install-cron
 */
const path = require("path");
const { spawnSync } = require("child_process");

require("./load-env.cjs").loadEnv();

const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(process.cwd(), "scripts", "run-cron-direct.ts");
const args = [tsxCli, script, ...process.argv.slice(2)];

if (process.env.CRON_REMINDERS_USE_HTTP === "1") {
  const { postCron } = require("./cron-fetch.cjs");
  const force = process.env.CRON_REMINDERS_FORCE === "1" || process.argv.includes("--force");
  postCron(force ? "/api/cron/reminders?force=1" : "/api/cron/reminders");
} else {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
  process.exit(result.status ?? 1);
}
