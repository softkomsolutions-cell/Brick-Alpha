-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('COLLECTIBLE', 'MARKET_INSTRUMENT');

-- CreateEnum
CREATE TYPE "HoldingStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "TransactionSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('PAPER', 'LIVE', 'SIMULATED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('BROKER', 'MARKETPLACE', 'SHIPPING', 'STORAGE', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('FRESH', 'STALE', 'UNAVAILABLE', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'ONLINE', 'ERROR', 'MANUAL_SETUP', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'RSI_ABOVE', 'RSI_BELOW');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'UX', 'IMPROVEMENT', 'CONTENT');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWING', 'PLANNED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('NEW', 'QUOTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportReviewStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'APPROVED', 'REJECTED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'CREATED', 'CONFLICT', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordSalt" TEXT,
    "passwordResetRequestedAt" TIMESTAMPTZ(6),
    "role" "UserRole" NOT NULL DEFAULT 'PARTNER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastLoginAt" TIMESTAMPTZ(6),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "preferredRegion" TEXT NOT NULL DEFAULT 'south-africa',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "riskMode" TEXT NOT NULL DEFAULT 'balanced',
    "subscriptionTier" TEXT NOT NULL DEFAULT 'starter',
    "alertPreferences" JSONB,
    "routinePreferences" JSONB,
    "executionProfiles" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "lastSeenAt" TIMESTAMPTZ(6),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'ZAR',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "assetType" "AssetType" NOT NULL,
    "symbol" TEXT,
    "name" TEXT NOT NULL,
    "currency" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collectible" (
    "assetId" UUID NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "sku" TEXT,
    "description" TEXT,
    "theme" TEXT,
    "condition" TEXT,
    "rarity" TEXT,
    "expectedRetirementDate" TIMESTAMPTZ(6),
    "actualRetirementDate" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Collectible_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "MarketInstrument" (
    "assetId" UUID NOT NULL,
    "ticker" TEXT NOT NULL,
    "desk" TEXT,
    "providerSymbol" TEXT,
    "exchange" TEXT,
    "quoteCurrency" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MarketInstrument_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "portfolioId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "status" "HoldingStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" DECIMAL(20,8) NOT NULL,
    "averageCost" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(20,8) NOT NULL,
    "currentPrice" DECIMAL(20,8),
    "currentValue" DECIMAL(20,8),
    "currency" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingLot" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "holdingId" UUID NOT NULL,
    "sourceTransactionId" UUID,
    "quantity" DECIMAL(20,8) NOT NULL,
    "remainingQuantity" DECIMAL(20,8) NOT NULL,
    "unitCost" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "HoldingLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "portfolioId" UUID NOT NULL,
    "holdingId" UUID,
    "assetId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "side" "TransactionSide",
    "quantity" DECIMAL(20,8) NOT NULL,
    "unitPrice" DECIMAL(20,8),
    "grossAmount" DECIMAL(20,8),
    "netAmount" DECIMAL(20,8),
    "currency" TEXT NOT NULL,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleAllocation" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "holdingLotId" UUID NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(20,8) NOT NULL,
    "proceeds" DECIMAL(20,8) NOT NULL,
    "realizedPnl" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "mode" "ExecutionMode" NOT NULL,
    "providerId" TEXT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "externalOrderId" TEXT,
    "externalClientOrderId" TEXT,
    "requestedQuantity" DECIMAL(20,8),
    "filledQuantity" DECIMAL(20,8),
    "requestedPrice" DECIMAL(20,8),
    "filledPrice" DECIMAL(20,8),
    "currency" TEXT,
    "failureReason" TEXT,
    "rawPayload" JSONB,
    "submittedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fee" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "type" "FeeType" NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "assetId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "providerRecordId" TEXT,
    "status" "ValuationStatus" NOT NULL DEFAULT 'FRESH',
    "value" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "confidence" DECIMAL(5,2),
    "asOf" TIMESTAMPTZ(6) NOT NULL,
    "rawPayload" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationEvidence" (
    "id" UUID NOT NULL,
    "valuationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLabel" TEXT,
    "observedAt" TIMESTAMPTZ(6),
    "salePrice" DECIMAL(20,8),
    "currency" TEXT,
    "condition" TEXT,
    "notes" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrickAlphaAssessment" (
    "id" UUID NOT NULL,
    "valuationId" UUID,
    "assetId" UUID NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "grade" TEXT,
    "recommendation" TEXT NOT NULL,
    "confidence" DECIMAL(5,2),
    "estimatedRoi" DECIMAL(12,4),
    "projectedRoi" DECIMAL(12,4),
    "retirementStatus" TEXT,
    "retirementProbability" DECIMAL(5,2),
    "factorScores" JSONB NOT NULL,
    "breakdown" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BrickAlphaAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "encryptedCredentials" TEXT,
    "config" JSONB,
    "lastTestAt" TIMESTAMPTZ(6),
    "lastSyncAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConnectorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSnapshot" (
    "id" UUID NOT NULL,
    "connectorAccountId" UUID NOT NULL,
    "fetchedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAssets" INTEGER,
    "fundedAssets" INTEGER,
    "rawPayload" JSONB,

    CONSTRAINT "ConnectorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorBalance" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "available" DECIMAL(20,8) NOT NULL,
    "reserved" DECIMAL(20,8) NOT NULL,
    "total" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "ConnectorBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assetId" UUID,
    "ticker" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "desk" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assetId" UUID,
    "ticker" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "desk" TEXT,
    "kind" "AlertKind" NOT NULL,
    "threshold" DECIMAL(20,8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMPTZ(6),
    "lastTriggerState" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "alertRuleId" UUID,
    "ticker" TEXT,
    "label" TEXT,
    "desk" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'alert',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "authorUserId" UUID,
    "resolverUserId" UUID,
    "title" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "severity" "FeedbackSeverity" NOT NULL,
    "area" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRequest" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "userId" UUID NOT NULL,
    "reference" TEXT,
    "channel" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "customerName" TEXT NOT NULL,
    "company" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "subject" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "quotedAmount" DECIMAL(20,2),
    "followUpAt" TIMESTAMPTZ(6),
    "catalogSelection" JSONB,
    "printDetails" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IntakeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "ownerUserId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourcePath" TEXT,
    "checksum" TEXT,
    "reviewStatus" "ImportReviewStatus" NOT NULL DEFAULT 'RECEIVED',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportPosition" (
    "id" UUID NOT NULL,
    "legacyId" TEXT,
    "batchId" UUID NOT NULL,
    "assetId" UUID,
    "identifier" TEXT NOT NULL,
    "name" TEXT,
    "quantity" DECIMAL(20,8) NOT NULL,
    "purchasePrice" DECIMAL(20,8),
    "currentValue" DECIMAL(20,8),
    "currency" TEXT,
    "sourceRef" TEXT,
    "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "rawData" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ImportPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportEvidence" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "positionId" UUID,
    "evidenceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourcePath" TEXT,
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportReview" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "positionId" UUID,
    "reviewerUserId" UUID,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacySnapshot" (
    "id" UUID NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "formatVersion" TEXT,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "userStateCount" INTEGER NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackCount" INTEGER NOT NULL DEFAULT 0,
    "migrationStatus" TEXT NOT NULL DEFAULT 'INSPECTED',
    "metadata" JSONB,
    "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyId_key" ON "User"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_legacyId_key" ON "Portfolio"("legacyId");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_legacyId_key" ON "Asset"("legacyId");

-- CreateIndex
CREATE INDEX "Asset_name_idx" ON "Asset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetType_symbol_key" ON "Asset"("assetType", "symbol");

-- CreateIndex
CREATE INDEX "Collectible_sku_idx" ON "Collectible"("sku");

-- CreateIndex
CREATE INDEX "Collectible_brand_category_idx" ON "Collectible"("brand", "category");

-- CreateIndex
CREATE INDEX "MarketInstrument_desk_idx" ON "MarketInstrument"("desk");

-- CreateIndex
CREATE UNIQUE INDEX "MarketInstrument_ticker_exchange_key" ON "MarketInstrument"("ticker", "exchange");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_legacyId_key" ON "Holding"("legacyId");

-- CreateIndex
CREATE INDEX "Holding_portfolioId_status_idx" ON "Holding"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "Holding_assetId_idx" ON "Holding"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_portfolioId_assetId_status_key" ON "Holding"("portfolioId", "assetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HoldingLot_legacyId_key" ON "HoldingLot"("legacyId");

-- CreateIndex
CREATE INDEX "HoldingLot_holdingId_remainingQuantity_idx" ON "HoldingLot"("holdingId", "remainingQuantity");

-- CreateIndex
CREATE INDEX "HoldingLot_sourceTransactionId_idx" ON "HoldingLot"("sourceTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_legacyId_key" ON "Transaction"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_occurredAt_idx" ON "Transaction"("portfolioId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_assetId_occurredAt_idx" ON "Transaction"("assetId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_holdingId_idx" ON "Transaction"("holdingId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalProvider_externalId_key" ON "Transaction"("externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "SaleAllocation_transactionId_idx" ON "SaleAllocation"("transactionId");

-- CreateIndex
CREATE INDEX "SaleAllocation_holdingLotId_idx" ON "SaleAllocation"("holdingLotId");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_transactionId_key" ON "Execution"("transactionId");

-- CreateIndex
CREATE INDEX "Execution_status_createdAt_idx" ON "Execution"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_providerId_externalOrderId_key" ON "Execution"("providerId", "externalOrderId");

-- CreateIndex
CREATE INDEX "Fee_transactionId_idx" ON "Fee"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_legacyId_key" ON "Valuation"("legacyId");

-- CreateIndex
CREATE INDEX "Valuation_assetId_asOf_idx" ON "Valuation"("assetId", "asOf");

-- CreateIndex
CREATE INDEX "Valuation_source_providerRecordId_idx" ON "Valuation"("source", "providerRecordId");

-- CreateIndex
CREATE INDEX "ValuationEvidence_valuationId_idx" ON "ValuationEvidence"("valuationId");

-- CreateIndex
CREATE UNIQUE INDEX "BrickAlphaAssessment_valuationId_key" ON "BrickAlphaAssessment"("valuationId");

-- CreateIndex
CREATE INDEX "BrickAlphaAssessment_assetId_createdAt_idx" ON "BrickAlphaAssessment"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "BrickAlphaAssessment_recommendation_idx" ON "BrickAlphaAssessment"("recommendation");

-- CreateIndex
CREATE INDEX "ConnectorAccount_provider_status_idx" ON "ConnectorAccount"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAccount_userId_provider_key" ON "ConnectorAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "ConnectorSnapshot_connectorAccountId_fetchedAt_idx" ON "ConnectorSnapshot"("connectorAccountId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorBalance_snapshotId_currency_key" ON "ConnectorBalance"("snapshotId", "currency");

-- CreateIndex
CREATE INDEX "WatchlistItem_userId_updatedAt_idx" ON "WatchlistItem"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_ticker_key" ON "WatchlistItem"("userId", "ticker");

-- CreateIndex
CREATE INDEX "AlertRule_userId_enabled_idx" ON "AlertRule"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_userId_ticker_kind_threshold_key" ON "AlertRule"("userId", "ticker", "kind", "threshold");

-- CreateIndex
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_legacyId_key" ON "Feedback"("legacyId");

-- CreateIndex
CREATE INDEX "Feedback_status_updatedAt_idx" ON "Feedback"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Feedback_authorUserId_idx" ON "Feedback"("authorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeRequest_legacyId_key" ON "IntakeRequest"("legacyId");

-- CreateIndex
CREATE INDEX "IntakeRequest_userId_status_idx" ON "IntakeRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_legacyId_key" ON "ImportBatch"("legacyId");

-- CreateIndex
CREATE INDEX "ImportBatch_ownerUserId_reviewStatus_idx" ON "ImportBatch"("ownerUserId", "reviewStatus");

-- CreateIndex
CREATE INDEX "ImportBatch_checksum_idx" ON "ImportBatch"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "ImportPosition_legacyId_key" ON "ImportPosition"("legacyId");

-- CreateIndex
CREATE INDEX "ImportPosition_batchId_reconciliationStatus_idx" ON "ImportPosition"("batchId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "ImportPosition_identifier_idx" ON "ImportPosition"("identifier");

-- CreateIndex
CREATE INDEX "ImportEvidence_batchId_idx" ON "ImportEvidence"("batchId");

-- CreateIndex
CREATE INDEX "ImportEvidence_positionId_idx" ON "ImportEvidence"("positionId");

-- CreateIndex
CREATE INDEX "ImportReview_batchId_reviewedAt_idx" ON "ImportReview"("batchId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ImportReview_positionId_idx" ON "ImportReview"("positionId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_occurredAt_idx" ON "AuditEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_occurredAt_idx" ON "AuditEvent"("action", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegacySnapshot_checksum_key" ON "LegacySnapshot"("checksum");

-- CreateIndex
CREATE INDEX "LegacySnapshot_sourcePath_capturedAt_idx" ON "LegacySnapshot"("sourcePath", "capturedAt");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collectible" ADD CONSTRAINT "Collectible_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketInstrument" ADD CONSTRAINT "MarketInstrument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingLot" ADD CONSTRAINT "HoldingLot_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingLot" ADD CONSTRAINT "HoldingLot_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleAllocation" ADD CONSTRAINT "SaleAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleAllocation" ADD CONSTRAINT "SaleAllocation_holdingLotId_fkey" FOREIGN KEY ("holdingLotId") REFERENCES "HoldingLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationEvidence" ADD CONSTRAINT "ValuationEvidence_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrickAlphaAssessment" ADD CONSTRAINT "BrickAlphaAssessment_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrickAlphaAssessment" ADD CONSTRAINT "BrickAlphaAssessment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAccount" ADD CONSTRAINT "ConnectorAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSnapshot" ADD CONSTRAINT "ConnectorSnapshot_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "ConnectorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorBalance" ADD CONSTRAINT "ConnectorBalance_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ConnectorSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_resolverUserId_fkey" FOREIGN KEY ("resolverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportPosition" ADD CONSTRAINT "ImportPosition_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportPosition" ADD CONSTRAINT "ImportPosition_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportEvidence" ADD CONSTRAINT "ImportEvidence_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportEvidence" ADD CONSTRAINT "ImportEvidence_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ImportPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportReview" ADD CONSTRAINT "ImportReview_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportReview" ADD CONSTRAINT "ImportReview_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ImportPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportReview" ADD CONSTRAINT "ImportReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
