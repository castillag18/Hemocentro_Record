require("./load-env.cjs").loadEnv();

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET ?? "hemocentro-cron-dev";

async function main() {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/openwa-inbox`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  const body = await res.text();
  console.log("status:", res.status);
  console.log(body);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
