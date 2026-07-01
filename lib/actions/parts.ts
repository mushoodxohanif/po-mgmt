"use server";

import { revalidatePath } from "next/cache";

import {
  parseImageUrlsFromFormData,
  validateImageUrls,
} from "@/lib/actions/parse-image-urls";
import {
  type ActionResult,
  actionError,
  actionSuccess,
} from "@/lib/actions/types";
import { prisma } from "@/lib/db";
import { mapPart } from "@/lib/db/types";
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
    const existingVendors = await prisma.vendor.findMany({
      where: { id: { in: uniqueVendorIds } },
      select: { id: true },
    });

    const validVendorIds = new Set(existingVendors.map((vendor) => vendor.id));
    const nextVendorIds = uniqueVendorIds.filter((id) =>
      validVendorIds.has(id),
    );

    const currentLinks = await prisma.vendorPart.findMany({
      where: { partId },
      select: { vendorId: true },
    });

    const currentVendorIds = new Set(currentLinks.map((link) => link.vendorId));
    const toAdd = nextVendorIds.filter((id) => !currentVendorIds.has(id));
    const toRemove = [...currentVendorIds].filter(
      (id) => !nextVendorIds.includes(id),
    );

    if (toAdd.length > 0) {
      await prisma.vendorPart.createMany({
        data: toAdd.map((vendorId) => ({ vendorId, partId })),
        skipDuplicates: true,
      });
    }

    if (toRemove.length > 0) {
      await prisma.vendorPart.deleteMany({
        where: { partId, vendorId: { in: toRemove } },
      });
    }
  } else {
    await prisma.vendorPart.deleteMany({ where: { partId } });
  }
}

export async function getVendorsForPartSelection(): Promise<
  VendorOptionForPart[]
> {
  return prisma.vendor.findMany({
    select: {
      id: true,
      name: true,
      contactName: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getPartVendorIdsMap(): Promise<Record<number, number[]>> {
  const links = await prisma.vendorPart.findMany({
    select: {
      partId: true,
      vendorId: true,
    },
  });

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
  const existing = await prisma.part.findFirst({
    where: { normalizedName },
  });

  if (existing) {
    return actionError("A part with this name already exists");
  }

  const imageUrls = parseImageUrlsFromFormData(formData);
  const imageUrlsError = validateImageUrls(imageUrls);
  if (imageUrlsError) return actionError(imageUrlsError);

  try {
    const { partId } = await upsertPartRecord({
      name: name.trim(),
      category: readOptionalString(formData, "category"),
      specs: parseSpecsJson(readOptionalString(formData, "specs")),
      description: readOptionalString(formData, "description"),
      mergeStrategy: "manual",
    });
    await prisma.part.update({
      where: { id: partId },
      data: { imageUrls },
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
  const duplicate = await prisma.part.findFirst({
    where: { normalizedName, NOT: { id } },
  });

  if (duplicate) {
    return actionError("Another part with this name already exists");
  }

  const imageUrls = parseImageUrlsFromFormData(formData);
  const imageUrlsError = validateImageUrls(imageUrls);
  if (imageUrlsError) return actionError(imageUrlsError);

  try {
    await prisma.part.update({
      where: { id },
      data: {
        name: name.trim(),
        normalizedName,
        category: readOptionalString(formData, "category"),
        specs: parseSpecsJson(readOptionalString(formData, "specs")),
        description: readOptionalString(formData, "description"),
        imageUrls,
      },
    });
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
    await prisma.part.delete({ where: { id } });
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError(
      "Failed to delete part. It may be used in BOMs or purchase orders.",
    );
  }
}

export async function getPartById(id: number) {
  const part = await prisma.part.findFirst({
    where: { id },
    include: {
      vendorParts: { include: { vendor: true } },
      productParts: { include: { product: true } },
    },
  });

  if (!part) return null;

  return mapPart(part);
}
