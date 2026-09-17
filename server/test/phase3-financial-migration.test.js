const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectLegacyFinancialStore } = require('../services/financial-migration-inspector');

test('financial inspector is explicit-source, dry-run and refuses to invent missing acquisition history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brick-alpha-financial-'));
  const source = path.join(dir, 'app-store.json');
  const payload = JSON.stringify({
    users: [{ id: 'u1' }],
    userStates: { u1: { trades: [
      { id: 't1', quantity: 2, currency: 'ZAR', acquisitionPrice: 1000, status: 'open' },
      { id: 't2', quantity: 1, currency: 'ZAR', status: 'closed', pnlAmount: 500 },
      { id: 't2', quantity: 0, currency: 'ZAR', status: 'closed' },
    ] } },
  });
  fs.writeFileSync(source, payload);
  const report = inspectLegacyFinancialStore(source);
  assert.equal(report.dryRun, true);
  assert.equal(report.policy.writePerformed, false);
  assert.equal(report.sha256, crypto.createHash('sha256').update(payload).digest('hex'));
  assert.equal(report.counts.users, 1);
  assert.equal(report.counts.trades, 3);
  assert.equal(report.counts.duplicates, 1);
  assert.equal(report.counts.invalid, 1);
  assert.equal(report.counts.ambiguous, 2);
  assert.equal(report.totals.explicitCostBasis, 2000);
  assert.equal(report.totals.legacyRealized, 500);
  assert.match(report.policy.acquisitionPrice, /never inferred/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('financial inspector requires the caller to name the source snapshot', () => {
  assert.throws(() => inspectLegacyFinancialStore(), /legacy_financial_source_required/);
});
