const DATABASE_PROTOCOL = /^(postgres|postgresql):\/\//i;

function readDatabaseConfig(environment = process.env) {
  const url = String(environment.DATABASE_URL || "").trim();
  const nodeEnvironment = String(
    environment.NODE_ENV || (environment.COLLECTTRADE_TEST === "1" ? "test" : "development"),
  ).toLowerCase();

  return {
    configured: Boolean(url),
    environment: ["test", "development", "staging", "production"].includes(nodeEnvironment)
      ? nodeEnvironment
      : "development",
    url: url || null,
  };
}

function validateDatabaseConfig(config = readDatabaseConfig()) {
  if (!config.configured) {
    return {
      ...config,
      valid: false,
      reason: "not_configured",
    };
  }

  if (!DATABASE_PROTOCOL.test(config.url)) {
    return {
      ...config,
      valid: false,
      reason: "invalid_postgresql_url",
    };
  }

  return {
    ...config,
    valid: true,
    reason: null,
  };
}

function requireDatabaseUrl(environment = process.env) {
  const config = validateDatabaseConfig(readDatabaseConfig(environment));
  if (!config.valid) {
    throw new Error(config.reason === "not_configured" ? "DATABASE_URL is not configured" : config.reason);
  }
  return config.url;
}

async function getDatabaseHealth(environment = process.env) {
  const config = validateDatabaseConfig(readDatabaseConfig(environment));

  if (!config.configured) {
    return {
      status: "not_configured",
      configured: false,
      environment: config.environment,
    };
  }

  if (!config.valid) {
    return {
      status: "invalid_configuration",
      configured: true,
      environment: config.environment,
      detail: config.reason,
    };
  }

  try {
    const { getPrismaClient } = require("../db/prisma-client");
    const prisma = getPrismaClient(environment);
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "online",
      configured: true,
      environment: config.environment,
    };
  } catch (error) {
    return {
      status: "error",
      configured: true,
      environment: config.environment,
      detail: "database_check_failed",
    };
  }
}

module.exports = {
  getDatabaseHealth,
  readDatabaseConfig,
  requireDatabaseUrl,
  validateDatabaseConfig,
};
