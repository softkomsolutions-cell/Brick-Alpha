const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function emptySummary(filePath, checksum = null) {
  return {
    checksum,
    feedbackCount: 0,
    filePath,
    readyForMigration: false,
    tradeCount: 0,
    userCount: 0,
    userStateCount: 0,
    validation: "FAILED",
  };
}

function inspectLegacyStore(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return emptySummary(resolvedPath);
  }

  const raw = fs.readFileSync(resolvedPath);
  const checksum = crypto.createHash("sha256").update(raw).digest("hex");

  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return emptySummary(resolvedPath, checksum);
  }

  const users = Array.isArray(parsed?.users) ? parsed.users : null;
  const userStates = parsed?.userStates && typeof parsed.userStates === "object" && !Array.isArray(parsed.userStates)
    ? parsed.userStates
    : null;
  const trades = Array.isArray(parsed?.trades) ? parsed.trades : null;
  const feedbackItems = Array.isArray(parsed?.feedbackItems) ? parsed.feedbackItems : null;
  const valid = Boolean(users && userStates && trades && feedbackItems);
  const userStateValues = userStates ? Object.values(userStates) : [];
  const userTradeCount = userStateValues.reduce(
    (count, state) => count + (Array.isArray(state?.trades) ? state.trades.length : 0),
    0,
  );

  return {
    checksum,
    feedbackCount: feedbackItems?.length || 0,
    filePath: resolvedPath,
    readyForMigration: valid,
    tradeCount: (trades?.length || 0) + userTradeCount,
    userCount: users?.length || 0,
    userStateCount: userStates ? Object.keys(userStates).length : 0,
    validation: valid ? "PASSED" : "FAILED",
  };
}

function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function printSummary(summary) {
  console.log(`LEGACY STORE: ${summary.filePath}`);
  console.log(`CHECKSUM: ${summary.checksum || "unavailable"}`);
  console.log(`USERS: ${summary.userCount}`);
  console.log(`USER STATES: ${summary.userStateCount}`);
  console.log(`TRADES: ${summary.tradeCount}`);
  console.log(`FEEDBACK: ${summary.feedbackCount}`);
  console.log(`VALIDATION: ${summary.validation}`);
  console.log(`READY FOR MIGRATION: ${summary.readyForMigration ? "YES" : "NO"}`);
}

if (require.main === module) {
  const filePath = argumentValue(process.argv.slice(2), "--file");
  if (!filePath) {
    console.error("Usage: npm run db:legacy:inspect -- --file <path>");
    process.exitCode = 1;
  } else {
    const summary = inspectLegacyStore(filePath);
    printSummary(summary);
    process.exitCode = summary.readyForMigration ? 0 : 1;
  }
}

module.exports = {
  inspectLegacyStore,
};
