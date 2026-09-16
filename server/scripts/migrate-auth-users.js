const fs = require('node:fs');
const { migrateUsers } = require('../services/user-migration');
const { createPostgresAuthRepository } = require('../repositories/postgresAuthRepository');
const { getPrismaClient, disconnectPrisma } = require('../db/prisma-client');

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (['--dry-run', '--apply'].includes(key)) options[key] = true;
    else if (['--file', '--confirm-source-sha256', '--environment', '--confirm-staging-service'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
    else throw new Error('invalid_arguments');
  }
  if (!options['--file'] || Boolean(options['--apply']) === Boolean(options['--dry-run'])) throw new Error('explicit_source_and_mode_required');
  if (options['--environment'] !== 'staging' || !options['--confirm-staging-service']) throw new Error('explicit_staging_target_required');
  return options;
}
async function main() {
  let code = 0;
  try {
    const options = parseArgs(process.argv.slice(2));
    if (process.env.NODE_ENV === 'production' || (process.env.RAILWAY_ENVIRONMENT_NAME && process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging')) throw new Error('production_forbidden');
    if (process.env.RAILWAY_SERVICE_ID !== options['--confirm-staging-service']) throw new Error('staging_service_confirmation_mismatch');
    const bytes = fs.readFileSync(options['--file']);
    const repository = createPostgresAuthRepository(getPrismaClient);
    const preview = await migrateUsers({ bytes, repository });
    console.log(JSON.stringify(preview, null, 2));
    if (options['--apply']) {
      const result = await migrateUsers({ bytes, repository, apply: true, confirmedHash: options['--confirm-source-sha256'] });
      console.log(JSON.stringify(result, null, 2));
    }
  } catch { console.error('Auth user migration stopped. Verify explicit source, staging target, source hash, record validity, and destination conflicts. No secret values are logged.'); code = 1; }
  finally { await disconnectPrisma(); }
  process.exitCode = code;
}
if (require.main === module) main();
module.exports = { parseArgs };
