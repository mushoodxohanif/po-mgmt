/*
  Warnings:

  - Added the required column `unit_price` to the `vendor_po_version_lines` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "vendor_parts" ADD COLUMN     "unit_price" DECIMAL(12,2);

-- AlterTable: add nullable first so existing PO lines can be backfilled,
-- then enforce NOT NULL for all future rows (price is always a snapshot at
-- PO creation time going forward).
ALTER TABLE "vendor_po_version_lines" ADD COLUMN     "unit_price" DECIMAL(12,2);
UPDATE "vendor_po_version_lines" SET "unit_price" = 0 WHERE "unit_price" IS NULL;
ALTER TABLE "vendor_po_version_lines" ALTER COLUMN "unit_price" SET NOT NULL;
