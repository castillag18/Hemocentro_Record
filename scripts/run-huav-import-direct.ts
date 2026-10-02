/**
 * Importación HUAV directa (Prisma + MySQL huav). Uso en servidor y cron 3:00 AM.
 * incremental (default): donantes_info_nightly.sql
 * full: donantes_info.sql sin LIMIT
 */
import { createRequire } from "module";
import { importDonorsFromHuav, type HuavImportMode } from "../lib/import-donors-huav";

const require = createRequire(import.meta.url);
require("./load-env.cjs").loadEnv();

function parseMode(): HuavImportMode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  if (arg?.split("=")[1] === "full") return "full";
  if (process.env.HUAV_IMPORT_MODE?.trim().toLowerCase() === "full") return "full";
  return "incremental";
}

async function main() {
  const mode = parseMode();
  console.log(`Modo importación HUAV: ${mode}`);
  const result = await importDonorsFromHuav({ mode });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
