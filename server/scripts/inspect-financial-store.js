const path = require('node:path');
const { inspectLegacyFinancialStore } = require('../services/financial-migration-inspector');

const sourceArg = process.argv.find(arg => arg.startsWith('--source='));
if (!sourceArg) {
  console.error('Usage: node scripts/inspect-financial-store.js --source=/absolute/path/to/app-store.json');
  process.exitCode = 2;
} else {
  const source = path.resolve(sourceArg.slice('--source='.length));
  console.log(JSON.stringify(inspectLegacyFinancialStore(source), null, 2));
}
