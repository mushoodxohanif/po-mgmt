import type { Prisma } from "@prisma/client";
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
import { prisma } from "@/lib/db";
import {
  asImageUrls,
  asPartSpecs,
  mapVendorPoVersionLine,
} from "@/lib/db/types";

function buildPartsSearchCondition(
  query?: string,
): Prisma.PartWhereInput | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;

  return {
    OR: [
      { name: { contains: trimmed, mode: "insensitive" } },
      { description: { contains: trimmed, mode: "insensitive" } },
      { category: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}

function buildProductsSearchCondition(
  query?: string,
): Prisma.ProductWhereInput | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;

  return {
    OR: [
      { displayName: { contains: trimmed, mode: "insensitive" } },
      { modelCode: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}

function buildVendorsSearchCondition(
  query?: string,
): Prisma.VendorWhereInput | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;

  return {
    OR: [
      { name: { contains: trimmed, mode: "insensitive" } },
      { contactName: { contains: trimmed, mode: "insensitive" } },
      { email: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}

function buildPartsWhere(params: PartsListParams): Prisma.PartWhereInput {
  const conditions: Prisma.PartWhereInput[] = [];

  const search = buildPartsSearchCondition(params.q);
  if (search) conditions.push(search);

  if (params.category) {
    conditions.push({ category: params.category });
  }

  if (params.hasVendors === "yes") {
    conditions.push({ vendorParts: { some: {} } });
  } else if (params.hasVendors === "no") {
    conditions.push({ vendorParts: { none: {} } });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function buildProductsWhere(
  params: ProductsListParams,
): Prisma.ProductWhereInput {
  const conditions: Prisma.ProductWhereInput[] = [];

  const search = buildProductsSearchCondition(params.q);
  if (search) conditions.push(search);

  if (params.hasBom === "yes") {
    conditions.push({ productParts: { some: {} } });
  } else if (params.hasBom === "no") {
    conditions.push({ productParts: { none: {} } });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function buildVendorsWhere(params: VendorsListParams): Prisma.VendorWhereInput {
  const conditions: Prisma.VendorWhereInput[] = [];

  const search = buildVendorsSearchCondition(params.q);
  if (search) conditions.push(search);

  if (params.hasParts === "yes") {
    conditions.push({ vendorParts: { some: {} } });
  } else if (params.hasParts === "no") {
    conditions.push({ vendorParts: { none: {} } });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function getPartsPaginated(params: PartsListParams) {
  const offset = getPaginationOffset(params);
  const where = buildPartsWhere(params);

  const [total, rows] = await Promise.all([
    prisma.part.count({ where }),
    prisma.part.findMany({
      where,
      orderBy: { name: "asc" },
      skip: offset,
      take: params.pageSize,
      include: {
        _count: {
          select: {
            vendorParts: true,
            productParts: true,
          },
        },
      },
    }),
  ]);

  const mappedRows = rows.map((part) => ({
    id: part.id,
    name: part.name,
    normalizedName: part.normalizedName,
    category: part.category,
    specs: asPartSpecs(part.specs),
    imageUrls: asImageUrls(part.imageUrls),
    description: part.description,
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
    vendorCount: part._count.vendorParts,
    productCount: part._count.productParts,
  }));

  return buildPaginatedResult(mappedRows, total, params);
}

export type PartListRow = Awaited<
  ReturnType<typeof getPartsPaginated>
>["rows"][number];

export async function getProductsPaginated(params: ProductsListParams) {
  const offset = getPaginationOffset(params);
  const where = buildProductsWhere(params);

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { displayName: "asc" },
      skip: offset,
      take: params.pageSize,
      include: {
        _count: {
          select: { productParts: true },
        },
      },
    }),
  ]);

  const mappedRows = rows.map((product) => ({
    id: product.id,
    modelCode: product.modelCode,
    displayName: product.displayName,
    imageUrls: asImageUrls(product.imageUrls),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    bomLineCount: product._count.productParts,
  }));

  return buildPaginatedResult(mappedRows, total, params);
}

export type ProductListRow = Awaited<
  ReturnType<typeof getProductsPaginated>
>["rows"][number];

export async function getVendorsPaginated(params: VendorsListParams) {
  const offset = getPaginationOffset(params);
  const where = buildVendorsWhere(params);

  const [total, rows] = await Promise.all([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
      skip: offset,
      take: params.pageSize,
      include: {
        _count: {
          select: { vendorParts: true },
        },
      },
    }),
  ]);

  const mappedRows = rows.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    contactName: vendor.contactName,
    email: vendor.email,
    phone: vendor.phone,
    address: vendor.address,
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt,
    partCount: vendor._count.vendorParts,
  }));

  return buildPaginatedResult(mappedRows, total, params);
}

export type VendorListRow = Awaited<
  ReturnType<typeof getVendorsPaginated>
>["rows"][number];

async function buildVendorPoWhere(
  params: VendorPosListParams,
): Promise<Prisma.VendorPoWhereInput> {
  const conditions: Prisma.VendorPoWhereInput[] = [];

  if (params.vendorId) {
    conditions.push({ vendorId: params.vendorId });
  }

  const trimmed = params.q?.trim();
  if (trimmed) {
    const searchConditions: Prisma.VendorPoWhereInput[] = [];
    const asNumber = Number.parseInt(trimmed, 10);

    if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
      searchConditions.push({ id: asNumber });
    }

    const matchingVendors = await prisma.vendor.findMany({
      where: { name: { contains: trimmed, mode: "insensitive" } },
      select: { id: true },
    });

    if (matchingVendors.length > 0) {
      searchConditions.push({
        vendorId: { in: matchingVendors.map((vendor) => vendor.id) },
      });
    }

    if (searchConditions.length > 0) {
      conditions.push({ OR: searchConditions });
    } else {
      conditions.push({ id: -1 });
    }
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function getVendorPosPaginated(
  params: VendorPosListParams,
): Promise<PaginatedResult<Awaited<ReturnType<typeof getVendorPos>>[number]>> {
  const offset = getPaginationOffset(params);
  const where = await buildVendorPoWhere(params);

  const [total, rawRows] = await Promise.all([
    prisma.vendorPo.count({ where }),
    prisma.vendorPo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: params.pageSize,
      include: {
        vendor: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { lines: true },
        },
      },
    }),
  ]);

  const rows = rawRows.map((po) => ({
    ...po,
    versions: po.versions.map((version) => ({
      ...version,
      lines: version.lines.map(mapVendorPoVersionLine),
    })),
  }));

  return buildPaginatedResult(rows, total, params);
}

export type VendorPoListRow = Awaited<
  ReturnType<typeof getVendorPosPaginated>
>["rows"][number];
