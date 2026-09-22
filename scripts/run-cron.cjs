/**
 * Ejecuta el cron de recordatorios automáticos.
 * Programar cada hora: schtasks /Create /SC HOURLY /TN "HUAV-Reminders" /TR "npm run cron:reminders"
 */
const secret = process.env.CRON_SECRET ?? "hemocentro-cron-dev";
const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

fetch(`${base}/api/cron/reminders`, {
  method: "POST",
  headers: { "x-cron-secret": secret },
})
  .then(async (res) => {
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    if (!res.ok) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
