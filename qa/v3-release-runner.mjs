import { spawn } from "node:child_process";

const ROOT = new URL("../", import.meta.url);
const BASE_URL = process.env.BRICK_ALPHA_QA_URL || "http://127.0.0.1:5000";

function spawnNode(args, options = {}) {
  return spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
}

async function waitForHealth(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error("Brick Alpha QA server did not become healthy");
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Child exited with code ${code} signal ${signal || "none"}`));
    });
  });
}

const server = spawnNode(["server/server.js"], {
  env: {
    ...process.env,
    PORT: "5000",
    AUTH_SECRET: process.env.AUTH_SECRET || "BrickAlphaBrowserQa2026SecureSecret1234567890",
    AUTH_PERSISTENCE_MODE: process.env.AUTH_PERSISTENCE_MODE || "legacy",
    FINANCIAL_PERSISTENCE_MODE: process.env.FINANCIAL_PERSISTENCE_MODE || "legacy",
    VALUATION_PERSISTENCE_MODE: process.env.VALUATION_PERSISTENCE_MODE || "legacy",
    CONNECTOR_PERSISTENCE_MODE: process.env.CONNECTOR_PERSISTENCE_MODE || "legacy",
    DEMO_MODE: process.env.DEMO_MODE || "true",
  },
});

try {
  await waitForHealth();
  const browserQa = spawnNode(["qa/v3-release-browser.mjs"], {
    env: { ...process.env, BRICK_ALPHA_QA_URL: BASE_URL },
  });
  await waitForExit(browserQa);
  console.log("Brick Alpha browser release QA passed.");
} finally {
  if (!server.killed) server.kill("SIGTERM");
}
