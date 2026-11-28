-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "LoyaltyType" AS ENUM ('EARN', 'REDEEM', 'REFUND', 'REVOKE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promotionCode" TEXT,
ADD COLUMN     "subtotalAmount" INTEGER NOT NULL DEFAULT 0;

-- DataMigration: Backfill subtotalAmount from totalAmount for existing orders
UPDATE "Order" SET "subtotalAmount" = "totalAmount";

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "LoyaltyType" NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_userId_idx" ON "LoyaltyTransaction"("userId");

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
