let prismaClient = null;

function getPrismaClient(environment = process.env) {
  if (prismaClient) {
    return prismaClient;
  }

  const { PrismaClient } = require("@prisma/client");
  const { requireDatabaseUrl } = require("../config/database");
  requireDatabaseUrl(environment);

  prismaClient = new PrismaClient();
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
