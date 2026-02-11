/*
  Warnings:

  - You are about to drop the column `base_price_per_hour` on the `Establishment` table. All the data in the column will be lost.
  - You are about to drop the column `discount_percentage_over_90min` on the `Establishment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Establishment" DROP COLUMN "base_price_per_hour",
DROP COLUMN "discount_percentage_over_90min";
