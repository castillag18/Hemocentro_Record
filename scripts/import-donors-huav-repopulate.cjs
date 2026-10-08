/**
 * Repoblar tabla donor desde HUAV (borra donantes + citas/recordatorios ligados).
 * Uso: npm run import:donors:huav:repopulate -- --yes
 */
const path = require("path");
const { spawnSync } = require("child_process");

require("./load-env.cjs").loadEnv();
require("./guard-app-database.cjs");

const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(process.cwd(), "scripts", "repopulate-donors-from-huav.ts");
const args = [tsxCli, script, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 1);
