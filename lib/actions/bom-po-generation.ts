"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, actionError } from "@/lib/actions/types";
import { prisma } from "@/lib/db";
import {
  type BuildPlanEntry,
  type BuildPlanPreview,
  buildDemandPreview,
  generateVendorPosFromBuildPlan,
} from "@/lib/services/bom-po-generation";

export type ProductOptionForBuildPlan = {
  id: number;
  modelCode: string;
  displayName: string;
  bomLineCount: number;
};

export async function getProductsForBuildPlan(): Promise<
  ProductOptionForBuildPlan[]
> {
  const products = await prisma.product.findMany({
    orderBy: { displayName: "asc" },
    include: { _count: { select: { productParts: true } } },
  });

  return products.map((product) => ({
    id: product.id,
    modelCode: product.modelCode,
    displayName: product.displayName,
    bomLineCount: product._count.productParts,
  }));
}

function sanitizeEntries(entries: unknown): BuildPlanEntry[] | null {
  if (!Array.isArray(entries)) return null;

  const sanitized: BuildPlanEntry[] = [];
  for (const entry of entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("productId" in entry) ||
      !("buildQuantity" in entry)
    ) {
      return null;
    }
    const productId = Number((entry as Record<string, unknown>).productId);
    const buildQuantity = Number(
      (entry as Record<string, unknown>).buildQuantity,
    );
    if (!Number.isFinite(productId) || !Number.isFinite(buildQuantity)) {
      return null;
    }
    sanitized.push({ productId, buildQuantity });
  }

  return sanitized;
}

function sanitizeOverrides(overrides: unknown): Record<number, number> {
  if (
    typeof overrides !== "object" ||
    overrides === null ||
    Array.isArray(overrides)
  ) {
    return {};
  }

  const sanitized: Record<number, number> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const partId = Number(key);
    const vendorId = Number(value);
    if (Number.isFinite(partId) && Number.isFinite(vendorId)) {
      sanitized[partId] = vendorId;
    }
  }

  return sanitized;
}

export async function previewBuildPlanAction(
  rawEntries: unknown,
  rawOverrides: unknown = {},
): Promise<
  | { success: true; preview: BuildPlanPreview }
  | { success: false; error: string }
> {
  const entries = sanitizeEntries(rawEntries);
  if (!entries) {
    return { success: false, error: "Invalid build plan" };
  }

  const overrides = sanitizeOverrides(rawOverrides);
  const result = await buildDemandPreview(entries, overrides);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return { success: true, preview: result.preview };
}

export async function generateVendorPosFromBuildPlanAction(
  rawEntries: unknown,
  rawOverrides: unknown = {},
): Promise<
  ActionResult & {
    createdPos?: { vendorPoId: number; vendorName: string }[];
    partialFailure?: boolean;
  }
> {
  const entries = sanitizeEntries(rawEntries);
  if (!entries) {
    return actionError("Invalid build plan");
  }

  const overrides = sanitizeOverrides(rawOverrides);
  const result = await generateVendorPosFromBuildPlan(entries, overrides);

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to generate purchase orders",
      createdPos: result.createdPos,
      partialFailure: result.partialFailure,
    };
  }

  revalidatePath("/vendor-pos");
  revalidatePath("/");
  for (const po of result.createdPos) {
    revalidatePath(`/vendor-pos/${po.vendorPoId}`);
  }

  return {
    success: true,
    createdPos: result.createdPos,
  };
}
