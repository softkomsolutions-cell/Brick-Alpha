const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS = path.join(__dirname, '..', 'prisma', 'migrations');

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function sqlFor(name) {
  const file = path.join(MIGRATIONS, name, 'migration.sql');
  assert.ok(fs.existsSync(file), `migration.sql missing for ${name}`);
  return fs.readFileSync(file, 'utf8');
}

function withoutComments(sql) {
  return sql
    .split('\n')
    .filter(line => !/^\s*--/.test(line))
    .join('\n');
}

test('all migrations exist in timestamp order with a phase5 migration present', () => {
  const migrations = listMigrations();
  assert.ok(migrations.includes('20260918000001_phase5_connector_jobs'), 'phase5 migration must exist');
  assert.ok(migrations.includes('20260918000000_phase4_valuation_domain'), 'phase4 migration must stay');
  assert.ok(migrations.includes('20260916080000_init_backend_foundation'), 'phase0 foundation must stay');
  const timestamps = migrations.map(name => Number(name.slice(0, 14)));
  for (let index = 1; index < timestamps.length; index += 1) {
    assert.ok(timestamps[index] > timestamps[index - 1], `migrations out of order: ${migrations[index - 1]} -> ${migrations[index]}`);
  }
});

test('every prior migration is byte-for-byte append-only (never edited)', () => {
  const readBak = name => {
    const backup = path.join(MIGRATIONS, name, 'migration.sql.bak');
    return fs.existsSync(backup) ? fs.readFileSync(backup, 'utf8') : null;
  };
  const guarded = ['20260916080000_init_backend_foundation', '20260918000000_phase4_valuation_domain'];
  for (const name of guarded) {
    const current = sqlFor(name);
    const backup = readBak(name);
    if (backup) assert.equal(current, backup, `${name}/migration.sql changed`);
    const body = withoutComments(current);
    assert.ok(!/DROP\s+(TABLE|COLUMN|VIEW|INDEX|TYPE)/i.test(body), `${name} must not drop anything`);
    assert.ok(!/TRUNCATE/i.test(body), `${name} must not truncate`);
  }
});

test('phase5 migration only adds schema and never mutates existing tables destructively', () => {
  const sql = withoutComments(sqlFor('20260918000001_phase5_connector_jobs'));

  const destructive = /(DROP\s+(TABLE|VIEW|INDEX|TYPE|COLUMN)|TRUNCATE|ALTER\s+TABLE[^;]*DROP|DELETE\s+FROM|UPDATE\s+"?[^" ;]+\s+SET)/i;
  assert.ok(!destructive.test(sql), 'phase5 migration must be purely additive');

  const createTypes = sql.match(/CREATE\s+TYPE\s+"([^"]+)"/gi) || [];
  assert.ok(createTypes.some(statement => /ConnectorHealthState/i.test(statement)), 'must define ConnectorHealthState');
  assert.ok(createTypes.some(statement => /JobStatus/i.test(statement)), 'must define JobStatus');
  assert.ok(createTypes.some(statement => /JobType/i.test(statement)), 'must define JobType');

  assert.match(sql, /ALTER\s+TABLE\s+"ConnectorAccount"\s+ADD\s+COLUMN\s+"healthState"/i);
  assert.match(sql, /ALTER\s+TABLE\s+"ConnectorAccount"\s+ADD\s+COLUMN\s+"unavailableUntil"/i);
  assert.match(sql, /ALTER\s+TABLE\s+"ConnectorAccount"\s+ADD\s+COLUMN\s+"lastHealthCheckAt"/i);

  assert.match(sql, /CREATE\s+TABLE\s+"Job"/i);
  assert.match(sql, /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"Job"\("idempotencyKey"\)/i);
  assert.match(sql, /"runId"/i);
  const indexes = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*/gi) || [];
  assert.ok(indexes.some(statement => /"status"\s*,\s*"runAt"/.test(statement)), 'status/runAt index expected');
  assert.ok(indexes.some(statement => /"type"\s*,\s*"status"/.test(statement)), 'type/status index expected');
});

test('phase5 enums and columns are absent from every earlier migration (append-only boundary)', () => {
  const prior = [
    '20260916080000_init_backend_foundation',
    '20260918000000_phase4_valuation_domain',
  ];
  for (const name of prior) {
    const sql = sqlFor(name);
    assert.ok(!/\bConnectorHealthState\b/.test(sql), `ConnectorHealthState leaked into ${name}`);
    assert.ok(!/\bJobStatus\b/.test(sql), `JobStatus leaked into ${name}`);
    assert.ok(!/\bJobType\b/.test(sql), `JobType leaked into ${name}`);
    assert.ok(!/CREATE\s+TABLE[^;]*\bJob\b/i.test(sql), `Job table leaked into ${name}`);
  }
});

test('schema.prisma declares the Job model and connector health fields additively', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  assert.match(schema, /model\s+Job\s*\{/);
  assert.match(schema, /idempotencyKey\s+String\s+@unique/);
  assert.match(schema, /runId\s+String\?\s+@unique\s+@db\.Uuid/);
  assert.match(schema, /@@index\(\[status, runAt\]\)/);
  assert.match(schema, /@@index\(\[type, status\]\)/);
  assert.match(schema, /healthState\s+ConnectorHealthState\s+@default\(UNKNOWN\)/);
  assert.match(schema, /unavailableUntil\s+DateTime/);
  assert.match(schema, /lastHealthCheckAt\s+DateTime/);
  assert.match(schema, /enum\s+ConnectorHealthState/);
  assert.match(schema, /enum\s+JobStatus/);
  assert.match(schema, /enum\s+JobType/);
});