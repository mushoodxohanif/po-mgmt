import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  getPaginationOffset,
  PAGE_SIZE_OPTIONS,
  type PaginatedResult,
  type PaginationParams,
} from "@/lib/data-table/pagination";

export type YesNoFilter = "yes" | "no";

export type BaseListParams = PaginationParams & {
  q?: string;
};

export type PartsListParams = BaseListParams & {
  category?: string;
  hasVendors?: YesNoFilter;
};

export type ProductsListParams = BaseListParams & {
  hasBom?: YesNoFilter;
};

export type VendorsListParams = BaseListParams & {
  hasParts?: YesNoFilter;
};

export type VendorPosListParams = BaseListParams & {
  vendorId?: number;
};

function readStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = Array.isArray(searchParams[key])
    ? searchParams[key][0]
    : searchParams[key];
  const value = raw?.trim();
  return value ? value : undefined;
}

function readYesNoParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): YesNoFilter | undefined {
  const value = readStringParam(searchParams, key);
  return value === "yes" || value === "no" ? value : undefined;
}

function readPaginationParams(
  searchParams: Record<string, string | string[] | undefined>,
): PaginationParams {
  const rawPage = Array.isArray(searchParams.page)
    ? searchParams.page[0]
    : searchParams.page;
  const rawPageSize = Array.isArray(searchParams.pageSize)
    ? searchParams.pageSize[0]
    : searchParams.pageSize;

  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  const parsedPageSize = Number.parseInt(
    rawPageSize ?? String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    parsedPageSize as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? parsedPageSize
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

export function parseBaseListParams(
  searchParams: Record<string, string | string[] | undefined>,
): BaseListParams {
  return {
    ...readPaginationParams(searchParams),
    q: readStringParam(searchParams, "q"),
  };
}

export function parsePartsListParams(
  searchParams: Record<string, string | string[] | undefined>,
): PartsListParams {
  return {
    ...parseBaseListParams(searchParams),
    category: readStringParam(searchParams, "category"),
    hasVendors: readYesNoParam(searchParams, "hasVendors"),
  };
}

export function parseProductsListParams(
  searchParams: Record<string, string | string[] | undefined>,
): ProductsListParams {
  return {
    ...parseBaseListParams(searchParams),
    hasBom: readYesNoParam(searchParams, "hasBom"),
  };
}

export function parseVendorsListParams(
  searchParams: Record<string, string | string[] | undefined>,
): VendorsListParams {
  return {
    ...parseBaseListParams(searchParams),
    hasParts: readYesNoParam(searchParams, "hasParts"),
  };
}

export function parseVendorPosListParams(
  searchParams: Record<string, string | string[] | undefined>,
): VendorPosListParams {
  const rawVendorId = readStringParam(searchParams, "vendorId");
  const vendorId = rawVendorId ? Number.parseInt(rawVendorId, 10) : undefined;

  return {
    ...parseBaseListParams(searchParams),
    vendorId:
      vendorId !== undefined && Number.isFinite(vendorId) && vendorId > 0
        ? vendorId
        : undefined,
  };
}

export function hasActiveListFilters(
  params: Record<string, string | number | undefined>,
  keys: string[],
) {
  return keys.some((key) => {
    const value = params[key];
    return value !== undefined && value !== "";
  });
}

type ListHrefUpdates = Record<string, string | number | undefined | null>;

function toPageNumber(value: string | number) {
  return typeof value === "number" ? value : Number.parseInt(value, 10) || 1;
}

export function buildListHref(
  pathname: string,
  searchParams: URLSearchParams,
  updates: ListHrefUpdates,
) {
  const params = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === "") {
      params.delete(key);
      continue;
    }

    params.set(key, String(value));
  }

  if ("q" in updates || "category" in updates || "hasVendors" in updates) {
    if (updates.page === undefined) {
      params.delete("page");
    }
  }

  if ("hasBom" in updates && updates.page === undefined) {
    params.delete("page");
  }

  if ("hasParts" in updates && updates.page === undefined) {
    params.delete("page");
  }

  if ("vendorId" in updates && updates.page === undefined) {
    params.delete("page");
  }

  if (updates.page !== undefined && updates.page !== null) {
    const page = toPageNumber(updates.page);
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
  }

  if (updates.pageSize !== undefined && updates.pageSize !== null) {
    const pageSize = toPageNumber(updates.pageSize);
    if (pageSize === DEFAULT_PAGE_SIZE) {
      params.delete("pageSize");
    } else {
      params.set("pageSize", String(pageSize));
    }
    params.delete("page");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export { buildPaginatedResult, getPaginationOffset, type PaginatedResult };
