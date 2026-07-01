import { prisma } from "@/lib/db";
import { decimalToNumber } from "@/lib/services/money";
import { createVendorPo } from "@/lib/services/vendor-po";

export type BuildPlanEntry = {
  productId: number;
  buildQuantity: number;
};

export type VendorOption = {
  id: number;
  name: string;
  unitPrice: number | null;
};

export type PartDemandSource = {
  productId: number;
  productDisplayName: string;
  productModelCode: string;
  bomQuantity: number;
  buildQuantity: number;
  subtotal: number;
};

export type PartDemandLine = {
  partId: number;
  partName: string;
  totalQuantity: number;
  sources: PartDemandSource[];
  vendorOptions: VendorOption[];
  resolvedVendorId: number | null;
  resolvedUnitPrice: number | null;
  lineTotal: number | null;
  status: "resolved" | "unassigned" | "ambiguous" | "unpriced";
};

export type VendorGroup = {
  vendorId: number;
  vendorName: string;
  lines: {
    partId: number;
    partName: string;
    quantity: number;
    unitPrice: number;
  }[];
  total: number;
};

export type BuildPlanPreview = {
  parts: PartDemandLine[];
  vendorGroups: VendorGroup[];
  unassignedCount: number;
  ambiguousCount: number;
  unpricedCount: number;
};

export type BuildPlanPreviewResult =
  | { ok: false; error: string }
  | { ok: true; preview: BuildPlanPreview };

function validateEntries(entries: BuildPlanEntry[]): string | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "Add at least one product to the build plan";
  }

  const productIds = entries.map((entry) => entry.productId);
  if (new Set(productIds).size !== productIds.length) {
    return "Each product can only appear once in the build plan";
  }

  for (const entry of entries) {
    if (!Number.isInteger(entry.productId) || entry.productId <= 0) {
      return "Select a product for every row";
    }
    if (!Number.isInteger(entry.buildQuantity) || entry.buildQuantity <= 0) {
      return "Build quantities must be positive whole numbers";
    }
  }

  return null;
}

export async function buildDemandPreview(
  entries: BuildPlanEntry[],
  vendorOverrides: Record<number, number> = {},
): Promise<BuildPlanPreviewResult> {
  const validationError = validateEntries(entries);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const productIds = entries.map((entry) => entry.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { productParts: { include: { part: true } } },
  });

  if (products.length !== new Set(productIds).size) {
    return {
      ok: false,
      error: "One or more selected products no longer exist",
    };
  }

  const emptyBomProducts = products.filter(
    (product) => product.productParts.length === 0,
  );
  if (emptyBomProducts.length > 0) {
    const names = emptyBomProducts.map((p) => p.displayName).join(", ");
    return {
      ok: false,
      error: `These products have no BOM lines yet, so a PO can't be generated: ${names}`,
    };
  }

  const buildQtyByProduct = new Map(
    entries.map((entry) => [entry.productId, entry.buildQuantity]),
  );

  const demandMap = new Map<
    number,
    { partName: string; total: number; sources: PartDemandSource[] }
  >();

  for (const product of products) {
    const buildQuantity = buildQtyByProduct.get(product.id) ?? 0;
    for (const line of product.productParts) {
      const subtotal = line.quantity * buildQuantity;
      const source: PartDemandSource = {
        productId: product.id,
        productDisplayName: product.displayName,
        productModelCode: product.modelCode,
        bomQuantity: line.quantity,
        buildQuantity,
        subtotal,
      };

      const existing = demandMap.get(line.partId);
      if (existing) {
        existing.total += subtotal;
        existing.sources.push(source);
      } else {
        demandMap.set(line.partId, {
          partName: line.part.name,
          total: subtotal,
          sources: [source],
        });
      }
    }
  }

  const partIds = [...demandMap.keys()];
  const vendorAssignments = await prisma.vendorPart.findMany({
    where: { partId: { in: partIds } },
    include: { vendor: true },
  });

  const vendorsByPart = new Map<number, VendorOption[]>();
  for (const assignment of vendorAssignments) {
    const list = vendorsByPart.get(assignment.partId) ?? [];
    list.push({
      id: assignment.vendor.id,
      name: assignment.vendor.name,
      unitPrice: decimalToNumber(assignment.unitPrice),
    });
    vendorsByPart.set(assignment.partId, list);
  }

  const parts: PartDemandLine[] = [];
  const vendorGroupMap = new Map<number, VendorGroup>();
  let unassignedCount = 0;
  let ambiguousCount = 0;
  let unpricedCount = 0;

  for (const partId of partIds) {
    const demand = demandMap.get(partId);
    if (!demand) continue;

    const vendorOptions = (vendorsByPart.get(partId) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    let resolvedVendorId: number | null = null;
    let resolvedUnitPrice: number | null = null;
    let status: PartDemandLine["status"];

    if (vendorOptions.length === 0) {
      status = "unassigned";
      unassignedCount++;
    } else if (vendorOptions.length === 1) {
      resolvedVendorId = vendorOptions[0].id;
      resolvedUnitPrice = vendorOptions[0].unitPrice;
      status = resolvedUnitPrice === null ? "unpriced" : "resolved";
    } else {
      const override = vendorOverrides[partId];
      const overrideOption = vendorOptions.find(
        (option) => option.id === override,
      );

      if (overrideOption) {
        resolvedVendorId = overrideOption.id;
        resolvedUnitPrice = overrideOption.unitPrice;
        status = resolvedUnitPrice === null ? "unpriced" : "resolved";
      } else {
        status = "ambiguous";
      }
    }

    if (status === "unpriced") unpricedCount++;
    if (status === "ambiguous") ambiguousCount++;

    const lineTotal =
      resolvedUnitPrice !== null ? demand.total * resolvedUnitPrice : null;

    parts.push({
      partId,
      partName: demand.partName,
      totalQuantity: demand.total,
      sources: [...demand.sources].sort((a, b) =>
        a.productDisplayName.localeCompare(b.productDisplayName),
      ),
      vendorOptions,
      resolvedVendorId,
      resolvedUnitPrice,
      lineTotal,
      status,
    });

    if (resolvedVendorId !== null && resolvedUnitPrice !== null) {
      const vendorName = vendorOptions.find(
        (option) => option.id === resolvedVendorId,
      )?.name;
      if (vendorName) {
        let group = vendorGroupMap.get(resolvedVendorId);
        if (!group) {
          group = {
            vendorId: resolvedVendorId,
            vendorName,
            lines: [],
            total: 0,
          };
          vendorGroupMap.set(resolvedVendorId, group);
        }
        group.lines.push({
          partId,
          partName: demand.partName,
          quantity: demand.total,
          unitPrice: resolvedUnitPrice,
        });
        group.total += demand.total * resolvedUnitPrice;
      }
    }
  }

  parts.sort((a, b) => a.partName.localeCompare(b.partName));
  const vendorGroups = [...vendorGroupMap.values()].sort((a, b) =>
    a.vendorName.localeCompare(b.vendorName),
  );

  return {
    ok: true,
    preview: {
      parts,
      vendorGroups,
      unassignedCount,
      ambiguousCount,
      unpricedCount,
    },
  };
}

export type GenerateBuildPlanResult = {
  success: boolean;
  error?: string;
  createdPos: { vendorPoId: number; vendorName: string }[];
  partialFailure?: boolean;
};

export async function generateVendorPosFromBuildPlan(
  entries: BuildPlanEntry[],
  vendorOverrides: Record<number, number> = {},
): Promise<GenerateBuildPlanResult> {
  const result = await buildDemandPreview(entries, vendorOverrides);
  if (!result.ok) {
    return { success: false, error: result.error, createdPos: [] };
  }

  const { preview } = result;

  if (preview.unassignedCount > 0) {
    const names = preview.parts
      .filter((part) => part.status === "unassigned")
      .map((part) => part.partName);
    return {
      success: false,
      createdPos: [],
      error: `Assign a vendor to these part(s) before generating POs: ${names.join(", ")}`,
    };
  }

  if (preview.ambiguousCount > 0) {
    const names = preview.parts
      .filter((part) => part.status === "ambiguous")
      .map((part) => part.partName);
    return {
      success: false,
      createdPos: [],
      error: `Choose a vendor for these part(s) — more than one vendor is assigned: ${names.join(", ")}`,
    };
  }

  if (preview.unpricedCount > 0) {
    const names = preview.parts
      .filter((part) => part.status === "unpriced")
      .map((part) => part.partName);
    return {
      success: false,
      createdPos: [],
      error: `Set a unit price for these part(s) on the vendor page before generating POs: ${names.join(", ")}`,
    };
  }

  if (preview.vendorGroups.length === 0) {
    return {
      success: false,
      createdPos: [],
      error: "No parts to order",
    };
  }

  const createdPos: { vendorPoId: number; vendorName: string }[] = [];

  for (const group of preview.vendorGroups) {
    const lines = group.lines.map((line) => ({
      partId: line.partId,
      quantity: line.quantity,
    }));

    const poResult = await createVendorPo(group.vendorId, lines);

    if (!poResult.success || !poResult.vendorPoId) {
      const createdSoFar =
        createdPos.length > 0
          ? ` Purchase orders were already created for: ${createdPos
              .map((po) => po.vendorName)
              .join(", ")}.`
          : "";
      return {
        success: false,
        createdPos,
        partialFailure: createdPos.length > 0,
        error: `Failed to create PO for ${group.vendorName}: ${
          poResult.error ?? "unknown error"
        }.${createdSoFar}`,
      };
    }

    createdPos.push({
      vendorPoId: poResult.vendorPoId,
      vendorName: group.vendorName,
    });
  }

  return { success: true, createdPos };
}
