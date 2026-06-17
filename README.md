# Purchase Order Management

A system for managing purchase orders from customer orders through vendor procurement, assembly, and fulfillment.

## Overview

We receive product orders from customers. Each order lists products and required quantities. Because we manufacture and assemble these products, we must first procure the parts needed to build them from various vendors.

```
Vendors → supply → Parts → make → Products → create → Purchase Order
```

## Flow

1. **Customer order** — A customer order is created in the system with the requested products and quantities.
2. **Vendor POs** — Based on the customer order, purchase orders are generated for the vendors that supply the parts required to make those products.
3. **Inventory check** — Part stock is tracked so POs are not created unnecessarily when inventory is sufficient.
4. **Vendor PO editing** — Vendor POs can be edited to add or remove parts as needed.
5. **Versioning** — Each vendor PO is version-controlled. The first version is auto-created from the customer order; subsequent changes create a new version. Each version is a separate PDF that can be viewed and downloaded.
6. **Delivery** — Once a vendor PO is marked as delivered and part requirements are satisfied, the customer PO is created.
7. **Customer PO** — The customer PO is created with validation checks when the order is ready. If required parts are unavailable, creation is blocked unless the user overrides the check.

## Features

- **CRUD** for vendors, parts, and products
- **Editable vendor POs** — Add or remove parts from vendor orders
- **Restocking** — Add parts to vendor POs that are not tied to a customer order but are needed to restock inventory
- **PO versioning** — Track changes to vendor POs with downloadable PDF versions per version
- **Validation with override** — Block customer PO creation when parts are missing, with optional user override

## Product SKU Import

Products can be added in two ways:

1. **Manually** — Create a product with model code and display name, then build its BOM from existing parts (parts must exist in the catalog first).
2. **Excel upload** — Upload one or more SKU spreadsheets (.xlsx) from the Products page. Each file represents a single product and lists the parts that make up that product.

Excel import will:

1. Extract product and part information from the spreadsheet
2. Persist that data to the database
3. Extract embedded BOM images and upload them to imgbb (when `IMGBB_API_KEY` is set)

Bulk import is also available via CLI for one-off migrations from a local folder.

## Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy environment variables and configure:

   ```bash
   cp .env.example .env
   ```

   Required variables:

   - `DATABASE_URL` — Neon PostgreSQL connection string
   - `IMGBB_API_KEY` — imgbb API key for BOM image uploads (optional; text import works without it)
   - `BLOB_READ_WRITE_TOKEN` — Vercel Blob token for vendor PO PDFs (optional; local fallback in dev)

   If the project is linked to Vercel, pull the Blob token with `bunx vercel env pull .env.vercel.tmp --environment=development --yes` and copy `BLOB_READ_WRITE_TOKEN` into `.env`.

3. Push the database schema:

   ```bash
   bun run db:push
   ```

4. (Optional) Bulk-import SKU Excel files from a local folder:

   ```bash
   bun run import:skus /path/to/excel/files
   ```

   Or use **Upload Excel files** on the Products page after starting the app.

5. Start the development server:

   ```bash
   bun run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Quality checks

```bash
bun run lint && bun run typecheck
```
