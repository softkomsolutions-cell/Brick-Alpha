let prismaClient = null;

function getPrismaClient(environment = process.env) {
  if (prismaClient) {
    return prismaClient;
  }

  const { PrismaClient } = require("@prisma/client");
  const { requireDatabaseUrl } = require("../config/database");
  const { PrismaPg } = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl(environment), connectionTimeoutMillis: 5000, max: 5 });
  prismaClient = new PrismaClient({ adapter });
  return prismaClient;
}

async function disconnectPrisma() {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
}

module.exports = {
  disconnectPrisma,
  getPrismaClient,
};
