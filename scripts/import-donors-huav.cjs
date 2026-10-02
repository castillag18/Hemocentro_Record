/**
 * Importa donantes desde la BD HUAV (delega en lib/import-donors-huav.ts).
 * Uso: npm run import:donors:huav
 */
const path = require("path");
const { spawnSync } = require("child_process");

require("./load-env.cjs").loadEnv();

const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(process.cwd(), "scripts", "run-huav-import-direct.ts");
const args = [tsxCli, script, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 1);
