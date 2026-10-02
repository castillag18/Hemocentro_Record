/**
 * Ejecuta el cron de recordatorios automáticos.
 * Programar cada hora: schtasks /Create /SC HOURLY /TN "HUAV-Reminders" /TR "npm run cron:reminders"
 */
require("./load-env.cjs").loadEnv();
const { postCron } = require("./cron-fetch.cjs");

const force = process.env.CRON_REMINDERS_FORCE === "1" || process.argv.includes("--force");
const path = force ? "/api/cron/reminders?force=1" : "/api/cron/reminders";

postCron(path);
