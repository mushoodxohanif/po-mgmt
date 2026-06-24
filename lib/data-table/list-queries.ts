import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { getVendorPos } from "@/lib/actions/vendor-pos";
import type {
  PartsListParams,
  ProductsListParams,
  VendorPosListParams,
  VendorsListParams,
} from "@/lib/data-table/list-params";
import {
  buildPaginatedResult,
  getPaginationOffset,
  type PaginatedResult,
} from "@/lib/data-table/list-params";
import { db } from "@/lib/db";
import {
  parts,
  productParts,
  products,
  vendorParts,
  vendorPos,
  vendors,
} from "@/lib/db/schema";

function buildPartsSearchCondition(query?: string): SQL | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;

  const pattern = `%${trimmed}%`;
  return or(
    ilike(parts.name, pattern),
    ilike(parts.description, pattern),
    ilike(parts.category, pattern),
  );
}

function buildProductsSearchCondition(query?: string): SQL | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;

  const pattern = `%${trimmed}%`;
  return or(
    ilike(products.displayName, pattern),
    ilike(products.modelCode, pattern),
  );
}

function buildVendorsSearchCondition(query?: string): SQL | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;

  const pattern = `%${trimmed}%`;
  return or(
    ilike(vendors.name, pattern),
    ilike(vendors.contactName, pattern),
    ilike(vendors.email, pattern),
  );
}

function buildVendorPartsExists() {
  return exists(
    db
      .select({ one: sql`1` })
      .from(vendorParts)
      .where(eq(vendorParts.partId, parts.id)),
  );
}

function buildVendorPartLinksExists() {
  return exists(
    db
      .select({ one: sql`1` })
      .from(vendorParts)
      .where(eq(vendorParts.vendorId, vendors.id)),
  );
}

function buildProductBomExists() {
  return exists(
    db
      .select({ one: sql`1` })
      .from(productParts)
      .where(eq(productParts.productId, products.id)),
  );
}

export async function getPartsPaginated(params: PartsListParams) {
  const offset = getPaginationOffset(params);
  const vendorLinkExists = buildVendorPartsExists();

  const conditions = [
    buildPartsSearchCondition(params.q),
    params.category ? eq(parts.category, params.category) : undefined,
    params.hasVendors === "yes"
      ? vendorLinkExists
      : params.hasVendors === "no"
        ? not(vendorLinkExists)
        : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ total: count() }).from(parts).where(whereClause),
    db
      .select({
        id: parts.id,
        name: parts.name,
        normalizedName: parts.normalizedName,
        category: parts.category,
        specs: parts.specs,
        imageUrls: parts.imageUrls,
        description: parts.description,
        createdAt: parts.createdAt,
        updatedAt: parts.updatedAt,
        vendorCount: count(vendorParts.id),
        productCount: count(productParts.id),
      })
      .from(parts)
      .leftJoin(vendorParts, eq(vendorParts.partId, parts.id))
      .leftJoin(productParts, eq(productParts.partId, parts.id))
      .where(whereClause)
      .groupBy(parts.id)
      .orderBy(asc(parts.name))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return buildPaginatedResult(rows, totalResult[0]?.total ?? 0, params);
}

export type PartListRow = Awaited<
  ReturnType<typeof getPartsPaginated>
>["rows"][number];

export async function getProductsPaginated(params: ProductsListParams) {
  const offset = getPaginationOffset(params);
  const bomExists = buildProductBomExists();

  const conditions = [
    buildProductsSearchCondition(params.q),
    params.hasBom === "yes"
      ? bomExists
      : params.hasBom === "no"
        ? not(bomExists)
        : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ total: count() }).from(products).where(whereClause),
    db
      .select({
        id: products.id,
        modelCode: products.modelCode,
        displayName: products.displayName,
        imageUrls: products.imageUrls,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        bomLineCount: count(productParts.id),
      })
      .from(products)
      .leftJoin(productParts, eq(productParts.productId, products.id))
      .where(whereClause)
      .groupBy(products.id)
      .orderBy(asc(products.displayName))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return buildPaginatedResult(rows, totalResult[0]?.total ?? 0, params);
}

export type ProductListRow = Awaited<
  ReturnType<typeof getProductsPaginated>
>["rows"][number];

export async function getVendorsPaginated(params: VendorsListParams) {
  const offset = getPaginationOffset(params);
  const partLinkExists = buildVendorPartLinksExists();

  const conditions = [
    buildVendorsSearchCondition(params.q),
    params.hasParts === "yes"
      ? partLinkExists
      : params.hasParts === "no"
        ? not(partLinkExists)
        : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ total: count() }).from(vendors).where(whereClause),
    db
      .select({
        id: vendors.id,
        name: vendors.name,
        contactName: vendors.contactName,
        email: vendors.email,
        phone: vendors.phone,
        address: vendors.address,
        createdAt: vendors.createdAt,
        updatedAt: vendors.updatedAt,
        partCount: count(vendorParts.id),
      })
      .from(vendors)
      .leftJoin(vendorParts, eq(vendorParts.vendorId, vendors.id))
      .where(whereClause)
      .groupBy(vendors.id)
      .orderBy(asc(vendors.name))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return buildPaginatedResult(rows, totalResult[0]?.total ?? 0, params);
}

export type VendorListRow = Awaited<
  ReturnType<typeof getVendorsPaginated>
>["rows"][number];

async function buildVendorPoWhereClause(params: VendorPosListParams) {
  const conditions: SQL[] = [];

  if (params.vendorId) {
    conditions.push(eq(vendorPos.vendorId, params.vendorId));
  }

  const trimmed = params.q?.trim();
  if (trimmed) {
    const searchConditions: SQL[] = [];
    const asNumber = Number.parseInt(trimmed, 10);

    if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
      searchConditions.push(eq(vendorPos.id, asNumber));
    }

    const matchingVendors = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(ilike(vendors.name, `%${trimmed}%`));

    if (matchingVendors.length > 0) {
      searchConditions.push(
        inArray(
          vendorPos.vendorId,
          matchingVendors.map((vendor) => vendor.id),
        ),
      );
    }

    if (searchConditions.length > 0) {
      const searchClause = or(...searchConditions);
      conditions.push(searchClause ?? sql`false`);
    } else {
      conditions.push(sql`false`);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getVendorPosPaginated(
  params: VendorPosListParams,
): Promise<PaginatedResult<Awaited<ReturnType<typeof getVendorPos>>[number]>> {
  const offset = getPaginationOffset(params);
  const whereClause = await buildVendorPoWhereClause(params);

  const [totalResult, rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(vendorPos)
      .innerJoin(vendors, eq(vendorPos.vendorId, vendors.id))
      .where(whereClause),
    db.query.vendorPos.findMany({
      where: whereClause,
      orderBy: [desc(vendorPos.createdAt)],
      limit: params.pageSize,
      offset,
      with: {
        vendor: true,
        versions: {
          orderBy: (versions, { desc: descVersion }) => [
            descVersion(versions.versionNumber),
          ],
          limit: 1,
          with: { lines: true },
        },
      },
    }),
  ]);

  return buildPaginatedResult(rows, totalResult[0]?.total ?? 0, params);
}

export type VendorPoListRow = Awaited<
  ReturnType<typeof getVendorPosPaginated>
>["rows"][number];
