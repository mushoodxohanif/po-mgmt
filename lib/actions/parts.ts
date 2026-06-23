"use server";

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  actionError,
  actionSuccess,
} from "@/lib/actions/types";
import { db } from "@/lib/db";
import { parts, vendorParts, vendors } from "@/lib/db/schema";
import { normalizePartName, parseSpecsJson } from "@/lib/services/part-specs";
import { upsertPartRecord } from "@/lib/services/parts-catalog";

export type VendorOptionForPart = {
  id: number;
  name: string;
  contactName: string | null;
};

function readOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseVendorIds(formData: FormData): number[] {
  return formData
    .getAll("vendorIds")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id));
}

async function syncPartVendors(partId: number, vendorIds: number[]) {
  const uniqueVendorIds = [...new Set(vendorIds)];

  if (uniqueVendorIds.length > 0) {
    const existingVendors = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(inArray(vendors.id, uniqueVendorIds));

    const validVendorIds = new Set(existingVendors.map((vendor) => vendor.id));
    const nextVendorIds = uniqueVendorIds.filter((id) =>
      validVendorIds.has(id),
    );

    const currentLinks = await db
      .select({ vendorId: vendorParts.vendorId })
      .from(vendorParts)
      .where(eq(vendorParts.partId, partId));

    const currentVendorIds = new Set(currentLinks.map((link) => link.vendorId));
    const toAdd = nextVendorIds.filter((id) => !currentVendorIds.has(id));
    const toRemove = [...currentVendorIds].filter(
      (id) => !nextVendorIds.includes(id),
    );

    if (toAdd.length > 0) {
      await db
        .insert(vendorParts)
        .values(toAdd.map((vendorId) => ({ vendorId, partId })))
        .onConflictDoNothing();
    }

    if (toRemove.length > 0) {
      await db
        .delete(vendorParts)
        .where(
          and(
            eq(vendorParts.partId, partId),
            inArray(vendorParts.vendorId, toRemove),
          ),
        );
    }
  } else {
    await db.delete(vendorParts).where(eq(vendorParts.partId, partId));
  }
}

export async function getVendorsForPartSelection(): Promise<
  VendorOptionForPart[]
> {
  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      contactName: vendors.contactName,
    })
    .from(vendors)
    .orderBy(asc(vendors.name));

  return rows;
}

export async function getPartVendorIdsMap(): Promise<Record<number, number[]>> {
  const links = await db
    .select({
      partId: vendorParts.partId,
      vendorId: vendorParts.vendorId,
    })
    .from(vendorParts);

  const map: Record<number, number[]> = {};
  for (const link of links) {
    if (!map[link.partId]) {
      map[link.partId] = [];
    }
    map[link.partId].push(link.vendorId);
  }
  return map;
}

export async function createPart(formData: FormData): Promise<ActionResult> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return actionError("Part name is required");
  }

  const normalizedName = normalizePartName(name);
  const [existing] = await db
    .select()
    .from(parts)
    .where(eq(parts.normalizedName, normalizedName))
    .limit(1);

  if (existing) {
    return actionError("A part with this name already exists");
  }

  try {
    const { partId } = await upsertPartRecord({
      name: name.trim(),
      category: readOptionalString(formData, "category"),
      specs: parseSpecsJson(readOptionalString(formData, "specs")),
      description: readOptionalString(formData, "description"),
      mergeStrategy: "manual",
    });
    await syncPartVendors(partId, parseVendorIds(formData));
    revalidatePath("/parts");
    revalidatePath("/vendors");
    return actionSuccess();
  } catch {
    return actionError("Failed to create part");
  }
}

export async function updatePart(formData: FormData): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  const name = formData.get("name");

  if (!Number.isFinite(id)) return actionError("Invalid part id");
  if (typeof name !== "string" || !name.trim()) {
    return actionError("Part name is required");
  }

  const normalizedName = normalizePartName(name);
  const [duplicate] = await db
    .select()
    .from(parts)
    .where(and(eq(parts.normalizedName, normalizedName), ne(parts.id, id)))
    .limit(1);

  if (duplicate) {
    return actionError("Another part with this name already exists");
  }

  try {
    await db
      .update(parts)
      .set({
        name: name.trim(),
        normalizedName,
        category: readOptionalString(formData, "category"),
        specs: parseSpecsJson(readOptionalString(formData, "specs")),
        description: readOptionalString(formData, "description"),
        updatedAt: new Date(),
      })
      .where(eq(parts.id, id));
    await syncPartVendors(id, parseVendorIds(formData));
    revalidatePath("/parts");
    revalidatePath(`/parts/${id}`);
    revalidatePath("/vendors");
    return actionSuccess();
  } catch {
    return actionError("Failed to update part");
  }
}

export async function deletePart(formData: FormData): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return actionError("Invalid part id");

  try {
    await db.delete(parts).where(eq(parts.id, id));
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError(
      "Failed to delete part. It may be used in BOMs or purchase orders.",
    );
  }
}

export async function getPartById(id: number) {
  return db.query.parts.findFirst({
    where: eq(parts.id, id),
    with: {
      vendorParts: { with: { vendor: true } },
      productParts: { with: { product: true } },
    },
  });
}
