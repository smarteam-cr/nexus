-- CreateTable
CREATE TABLE "Knowledge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Knowledge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HubspotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
