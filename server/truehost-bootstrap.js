"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const appRoot = path.resolve(__dirname, "..");
const trueHostHome = "/home/wwcgbqzj";
const marker = path.join(trueHostHome, "brickalpha-bootstrap.done");
const lockFile = path.join(trueHostHome, "brickalpha-bootstrap.lock");
const logFile = path.join(trueHostHome, "brickalpha-bootstrap.log");

if (appRoot.startsWith(trueHostHome + "/") && !fs.existsSync(marker) && !fs.existsSync(lockFile)) {
  fs.writeFileSync(lockFile, String(process.pid), "utf8");
  const npm = "/opt/alt/alt-nodejs22/root/usr/bin/npm";
  const out = fs.openSync(logFile, "a");
  const child = spawn(npm, ["--prefix", "frontend", "run", "build"], {
    cwd: appRoot,
    env: {
      ...process.env,
      PATH: "/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:/usr/bin:/bin",
    },
    stdio: ["ignore", out, out],
  });

  child.on("error", (error) => {
    fs.appendFileSync(logFile, "\nTrueHost frontend build failed to start: " + error.message + "\n");
    try { fs.unlinkSync(lockFile); } catch {}
  });

  child.on("close", (code) => {
    fs.appendFileSync(logFile, "\nTrueHost frontend build exit code: " + code + "\n");
    if (code === 0) fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    try { fs.unlinkSync(lockFile); } catch {}
  });
}
