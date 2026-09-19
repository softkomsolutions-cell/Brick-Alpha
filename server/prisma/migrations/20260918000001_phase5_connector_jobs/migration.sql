-- Phase 5 connector jobs and refresh infrastructure.
-- Additive only: no DROP, no TRUNCATE, no destructive ALTER, no data backfill.

CREATE TYPE "ConnectorHealthState" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'RATE_LIMITED', 'AUTH_FAILED');

ALTER TABLE "ConnectorAccount" ADD COLUMN "healthState" "ConnectorHealthState" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "ConnectorAccount" ADD COLUMN "unavailableUntil" TIMESTAMPTZ(6);
ALTER TABLE "ConnectorAccount" ADD COLUMN "lastHealthCheckAt" TIMESTAMPTZ(6);

CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TYPE "JobType" AS ENUM ('CONNECTOR_HEALTH', 'CONNECTOR_REFRESH', 'VALUATION_REFRESH', 'MARKET_REFRESH');

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "provider" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "runId" TEXT,
    "correlationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "timeoutMs" INTEGER NOT NULL DEFAULT 45000,
    "retryPolicy" JSONB,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");
CREATE UNIQUE INDEX "Job_runId_key" ON "Job"("runId");
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");