"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appRoot = path.resolve(__dirname, "..");
const trueHostHome = "/home/wwcgbqzj";
const marker = path.join(trueHostHome, "brickalpha-bootstrap.done");
const logFile = path.join(trueHostHome, "brickalpha-bootstrap.log");

if (appRoot.startsWith(trueHostHome + "/") && !fs.existsSync(marker)) {
  const npm = "/opt/alt/alt-nodejs22/root/usr/bin/npm";
  const env = {
    ...process.env,
    PATH: "/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:/usr/bin:/bin",
  };
  const lines = [];

  const run = (label, args) => {
    lines.push(`--- ${label} ---`);
    const result = spawnSync(npm, args, {
      cwd: appRoot,
      env,
      encoding: "utf8",
      timeout: 10 * 60 * 1000,
    });
    lines.push(result.stdout || "");
    lines.push(result.stderr || "");
    if (result.error || result.status !== 0) {
      lines.push(`${label} failed: ${result.error?.message || `exit ${result.status}`}`);
      fs.writeFileSync(logFile, lines.join("\n"), "utf8");
      throw result.error || new Error(`${label} failed with exit ${result.status}`);
    }
  };

  run("Prisma generate", ["--prefix", "server", "run", "db:generate"]);
  run("Frontend build", ["--prefix", "frontend", "run", "build"]);
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  lines.push("TrueHost bootstrap completed successfully.");
  fs.writeFileSync(logFile, lines.join("\n"), "utf8");
}
