/**
 * Ejecuta el cron de recordatorios automáticos.
 * Programar cada hora: schtasks /Create /SC HOURLY /TN "HUAV-Reminders" /TR "npm run cron:reminders"
 */
require("./load-env.cjs").loadEnv();
const { postCron } = require("./cron-fetch.cjs");

postCron("/api/cron/reminders");
