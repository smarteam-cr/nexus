-- AlterTable
ALTER TABLE "HubspotAccount" ADD COLUMN     "portalSnapshot" JSONB,
ADD COLUMN     "portalSnapshotAt" TIMESTAMP(3);
