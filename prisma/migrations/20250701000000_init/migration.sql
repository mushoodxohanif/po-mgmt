-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" TEXT,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "image_urls" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "model_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "image_urls" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_parts" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "item_no" TEXT,
    "quantity" INTEGER NOT NULL,
    "remarks" TEXT,
    "image_side_url" TEXT,
    "image_front_url" TEXT,
    "image_bottom_url" TEXT,

    CONSTRAINT "product_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_parts" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,

    CONSTRAINT "vendor_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_pos" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_pos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_po_versions" (
    "id" SERIAL NOT NULL,
    "vendor_po_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_po_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_po_version_lines" (
    "id" SERIAL NOT NULL,
    "vendor_po_version_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "vendor_po_version_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parts_normalized_name_idx" ON "parts"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "products_model_code_idx" ON "products"("model_code");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_parts_vendor_part_idx" ON "vendor_parts"("vendor_id", "part_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_po_versions_po_version_idx" ON "vendor_po_versions"("vendor_po_id", "version_number");

-- AddForeignKey
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_pos" ADD CONSTRAINT "vendor_pos_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_po_versions" ADD CONSTRAINT "vendor_po_versions_vendor_po_id_fkey" FOREIGN KEY ("vendor_po_id") REFERENCES "vendor_pos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_po_version_lines" ADD CONSTRAINT "vendor_po_version_lines_vendor_po_version_id_fkey" FOREIGN KEY ("vendor_po_version_id") REFERENCES "vendor_po_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_po_version_lines" ADD CONSTRAINT "vendor_po_version_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
