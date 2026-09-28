import { createRequire } from "module";
import { pollOpenWaInbox } from "../lib/openwa-inbox-poll";
import { prisma } from "../lib/prisma";

const require = createRequire(import.meta.url);
require("./load-env.cjs").loadEnv();

async function main() {
  console.log("mode: direct (BD + OpenWA, sin HTTP a la app)");
  const result = await pollOpenWaInbox();
  console.log(JSON.stringify(result, null, 2));
  if (result.error) {
    console.error("error:", result.error);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
