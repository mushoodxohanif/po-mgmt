import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type PartSpecs = Record<string, string>;

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const parts = pgTable(
  "parts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category"),
    specs: jsonb("specs").$type<PartSpecs>().notNull().default({}),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("parts_normalized_name_idx").on(table.normalizedName),
  ],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    modelCode: text("model_code").notNull(),
    displayName: text("display_name").notNull(),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("products_model_code_idx").on(table.modelCode)],
);

export const productParts = pgTable("product_parts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  partId: integer("part_id")
    .notNull()
    .references(() => parts.id, { onDelete: "cascade" }),
  itemNo: text("item_no"),
  quantity: integer("quantity").notNull(),
  remarks: text("remarks"),
  imageSideUrl: text("image_side_url"),
  imageFrontUrl: text("image_front_url"),
  imageBottomUrl: text("image_bottom_url"),
});

export const vendorParts = pgTable(
  "vendor_parts",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    partId: integer("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("vendor_parts_vendor_part_idx").on(
      table.vendorId,
      table.partId,
    ),
  ],
);

export const vendorPos = pgTable("vendor_pos", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vendorPoVersions = pgTable(
  "vendor_po_versions",
  {
    id: serial("id").primaryKey(),
    vendorPoId: integer("vendor_po_id")
      .notNull()
      .references(() => vendorPos.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    pdfUrl: text("pdf_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_po_versions_po_version_idx").on(
      table.vendorPoId,
      table.versionNumber,
    ),
  ],
);

export const vendorPoVersionLines = pgTable("vendor_po_version_lines", {
  id: serial("id").primaryKey(),
  vendorPoVersionId: integer("vendor_po_version_id")
    .notNull()
    .references(() => vendorPoVersions.id, { onDelete: "cascade" }),
  partId: integer("part_id")
    .notNull()
    .references(() => parts.id),
  quantity: integer("quantity").notNull(),
});

export const vendorsRelations = relations(vendors, ({ many }) => ({
  vendorParts: many(vendorParts),
  vendorPos: many(vendorPos),
}));

export const partsRelations = relations(parts, ({ many }) => ({
  productParts: many(productParts),
  vendorParts: many(vendorParts),
  vendorPoVersionLines: many(vendorPoVersionLines),
}));

export const productsRelations = relations(products, ({ many }) => ({
  productParts: many(productParts),
}));

export const productPartsRelations = relations(productParts, ({ one }) => ({
  product: one(products, {
    fields: [productParts.productId],
    references: [products.id],
  }),
  part: one(parts, {
    fields: [productParts.partId],
    references: [parts.id],
  }),
}));

export const vendorPartsRelations = relations(vendorParts, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorParts.vendorId],
    references: [vendors.id],
  }),
  part: one(parts, {
    fields: [vendorParts.partId],
    references: [parts.id],
  }),
}));

export const vendorPosRelations = relations(vendorPos, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [vendorPos.vendorId],
    references: [vendors.id],
  }),
  versions: many(vendorPoVersions),
}));

export const vendorPoVersionsRelations = relations(
  vendorPoVersions,
  ({ one, many }) => ({
    vendorPo: one(vendorPos, {
      fields: [vendorPoVersions.vendorPoId],
      references: [vendorPos.id],
    }),
    lines: many(vendorPoVersionLines),
  }),
);

export const vendorPoVersionLinesRelations = relations(
  vendorPoVersionLines,
  ({ one }) => ({
    vendorPoVersion: one(vendorPoVersions, {
      fields: [vendorPoVersionLines.vendorPoVersionId],
      references: [vendorPoVersions.id],
    }),
    part: one(parts, {
      fields: [vendorPoVersionLines.partId],
      references: [parts.id],
    }),
  }),
);

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

export type Part = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductPart = typeof productParts.$inferSelect;
export type NewProductPart = typeof productParts.$inferInsert;

export type VendorPart = typeof vendorParts.$inferSelect;
export type NewVendorPart = typeof vendorParts.$inferInsert;

export type VendorPo = typeof vendorPos.$inferSelect;
export type NewVendorPo = typeof vendorPos.$inferInsert;

export type VendorPoVersion = typeof vendorPoVersions.$inferSelect;
export type NewVendorPoVersion = typeof vendorPoVersions.$inferInsert;

export type VendorPoVersionLine = typeof vendorPoVersionLines.$inferSelect;
export type NewVendorPoVersionLine = typeof vendorPoVersionLines.$inferInsert;
