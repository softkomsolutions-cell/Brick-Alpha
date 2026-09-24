-- Phase 4 valuation domain.
-- Additive only: no DROP, no TRUNCATE, no destructive ALTER, no data backfill.

ALTER TABLE "ValuationEvidence" ADD COLUMN "provider" TEXT;