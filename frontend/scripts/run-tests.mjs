/**
 * Frontend unit-test runner.
 *
 * The render pipeline lives in plain ESM modules that Vite bundles with
 * extensionless relative imports; plain Node cannot resolve those. This
 * wrapper registers a tiny loader that retries with `.js` and runs the
 * node:test suite.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const loaderUrl = new URL("../tests/esm-extension-fix.mjs", import.meta.url).href;

const child = spawn(
  process.execPath,
  ["--test", path.join(here, "..", "tests")],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: `--loader=${loaderUrl}`,
    },
  },
);

child.once("error", (error) => {
  console.error(`Tests could not start: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});