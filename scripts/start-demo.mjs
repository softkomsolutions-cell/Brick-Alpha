import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5000);
const demoDataDir = path.join(repoRoot, "server", "data", "demo");

const demoEnv = {
  ...process.env,
  DEMO_MODE: "true",
  NODE_ENV: "development",
  AUTH_PERSISTENCE_MODE: "legacy",
  FINANCIAL_PERSISTENCE_MODE: "legacy",
  VALUATION_PERSISTENCE_MODE: "legacy",
  CONNECTOR_PERSISTENCE_MODE: "legacy",
  COLLECTTRADE_DATA_DIR: demoDataDir,
  COLLECTTRADE_STORE_FILE: path.join(demoDataDir, "app-store.json"),
  COLLECTTRADE_SHARE_STATUS_FILE: path.join(demoDataDir, "share-status.json"),
};
for (const key of [
  "DATABASE_URL",
  "DATABASE_URL_TUNNEL_PORT",
  "TWELVE_DATA_API_KEY",
  "COLLECTTRADE_DISABLE_RUNTIME",
  "COLLECTTRADE_TEST",
  "RAILWAY_ENVIRONMENT_NAME",
]) {
  delete demoEnv[key];
}

console.log("");
console.log("Brick Alpha · DEMO MODE");
console.log("-----------------------");
console.log(`URL: http://localhost:${port}`);
console.log("Account: use 'Enter Demo' on the login screen (seeded portfolio + watchlist).");
console.log("Local demo: seeded LEGO prices, paper purchases, and local news. Keep this terminal open.");
console.log("");

let child;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: repoRoot, env: demoEnv, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? (stopping ? 0 : 1)));
  });
}

try {
  // npm supplies its CLI path, avoiding a shell and npm.cmd child-process trees on Windows.
  if (!process.env.npm_execpath) throw new Error("Start with npm run demo from the repository root.");
  const buildCode = await run([process.env.npm_execpath, "--prefix", "frontend", "run", "build"]);
  if (buildCode || stopping) {
    process.exitCode = buildCode;
  } else {
    process.exitCode = await run([path.join(repoRoot, "server", "server.js")]);
  }
} catch (error) {
  console.error(`Demo could not start: ${error.message}`);
  process.exitCode = 1;
}
