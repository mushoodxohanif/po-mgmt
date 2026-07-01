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
import { mapPart, mapProduct } from "@/lib/db/types";

export type PartOptionForProduct = {
  id: number;
  name: string;
  category: string | null;
  vendorNames: string[];
};

export async function getPartsForProductSelection(): Promise<
  PartOptionForProduct[]
> {
  const rows = await prisma.part.findMany({
    orderBy: { name: "asc" },
    include: {
      vendorParts: {
        include: { vendor: true },
      },
    },
  });

  return rows.map((part) => ({
    id: part.id,
    name: part.name,
    category: part.category,
    vendorNames: part.vendorParts
      .map(({ vendor }) => vendor.name)
      .sort((a, b) => a.localeCompare(b)),
  }));
}

function parsePartIds(formData: FormData): number[] {
  const ids = formData
    .getAll("partIds")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);

  return [...new Set(ids)];
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parsePositiveInt(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const modelCode = formData.get("modelCode");
  const displayName = formData.get("displayName");
  const partIds = parsePartIds(formData);

  if (typeof modelCode !== "string" || !modelCode.trim()) {
    return actionError("Model code is required");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    return actionError("Display name is required");
  }

  const existing = await prisma.product.findFirst({
    where: { modelCode: modelCode.trim() },
  });

  if (existing) {
    return actionError("A product with this model code already exists");
  }

  if (partIds.length > 0) {
    const existingParts = await prisma.part.findMany({
      where: { id: { in: partIds } },
      select: { id: true },
    });

    if (existingParts.length !== partIds.length) {
      return actionError("One or more selected parts no longer exist");
    }
  }

  const imageUrls = parseImageUrlsFromFormData(formData);
  const imageUrlsError = validateImageUrls(imageUrls);
  if (imageUrlsError) return actionError(imageUrlsError);

  try {
    await prisma.$transaction(async (tx) => {
      const inserted = await tx.product.create({
        data: {
          modelCode: modelCode.trim(),
          displayName: displayName.trim(),
          imageUrls,
        },
        select: { id: true },
      });

      if (partIds.length > 0) {
        await tx.productPart.createMany({
          data: partIds.map((partId, index) => ({
            productId: inserted.id,
            partId,
            quantity: 1,
            itemNo: String(index + 1),
          })),
        });
      }
    });

    revalidatePath("/products");
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError("Failed to create product");
  }
}

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  const modelCode = formData.get("modelCode");
  const displayName = formData.get("displayName");
  const partIds = parsePartIds(formData);

  if (!Number.isFinite(id)) return actionError("Invalid product id");
  if (typeof modelCode !== "string" || !modelCode.trim()) {
    return actionError("Model code is required");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    return actionError("Display name is required");
  }

  const duplicate = await prisma.product.findFirst({
    where: { modelCode: modelCode.trim(), NOT: { id } },
  });

  if (duplicate) {
    return actionError("Another product with this model code already exists");
  }

  if (partIds.length > 0) {
    const existingParts = await prisma.part.findMany({
      where: { id: { in: partIds } },
      select: { id: true },
    });

    if (existingParts.length !== partIds.length) {
      return actionError("One or more selected parts no longer exist");
    }
  }

  const imageUrls = parseImageUrlsFromFormData(formData);
  const imageUrlsError = validateImageUrls(imageUrls);
  if (imageUrlsError) return actionError(imageUrlsError);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          modelCode: modelCode.trim(),
          displayName: displayName.trim(),
          imageUrls,
        },
      });

      if (partIds.length > 0) {
        const existingBom = await tx.productPart.findMany({
          where: { productId: id },
          select: { partId: true },
        });

        const existingPartIdSet = new Set(
          existingBom.map((line) => line.partId),
        );
        const newPartIds = partIds.filter(
          (partId) => !existingPartIdSet.has(partId),
        );

        if (newPartIds.length > 0) {
          await tx.productPart.createMany({
            data: newPartIds.map((partId, index) => ({
              productId: id,
              partId,
              quantity: 1,
              itemNo: String(existingBom.length + index + 1),
            })),
          });
        }
      }
    });

    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError("Failed to update product");
  }
}

export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return actionError("Invalid product id");

  try {
    await prisma.$transaction(async (tx) => {
      const bomRows = await tx.productPart.findMany({
        where: { productId: id },
        select: { partId: true },
      });

      const bomPartIds = [...new Set(bomRows.map((row) => row.partId))];

      await tx.product.delete({ where: { id } });

      if (bomPartIds.length === 0) return;

      const stillLinkedRows = await tx.productPart.findMany({
        where: { partId: { in: bomPartIds } },
        select: { partId: true },
      });

      const stillLinkedPartIds = new Set(
        stillLinkedRows.map((row) => row.partId),
      );

      const vendorPoRows = await tx.vendorPoVersionLine.findMany({
        where: { partId: { in: bomPartIds } },
        select: { partId: true },
      });

      const vendorPoPartIds = new Set(vendorPoRows.map((row) => row.partId));

      const partIdsToDelete = bomPartIds.filter(
        (partId) =>
          !stillLinkedPartIds.has(partId) && !vendorPoPartIds.has(partId),
      );

      if (partIdsToDelete.length > 0) {
        await tx.part.deleteMany({ where: { id: { in: partIdsToDelete } } });
      }
    });

    revalidatePath("/products");
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError("Failed to delete product");
  }
}

export async function getProductById(id: number) {
  const product = await prisma.product.findFirst({
    where: { id },
    include: {
      productParts: {
        include: { part: true },
      },
    },
  });

  if (!product) return null;

  return {
    ...mapProduct(product),
    productParts: product.productParts.map((line) => ({
      ...line,
      part: mapPart(line.part),
    })),
  };
}

export async function addProductBomLine(
  formData: FormData,
): Promise<ActionResult> {
  const productId = Number(formData.get("productId"));
  const partId = Number(formData.get("partId"));
  const quantity = parsePositiveInt(formData.get("quantity"));

  if (!Number.isFinite(productId)) return actionError("Invalid product id");
  if (!Number.isFinite(partId)) return actionError("Part is required");
  if (quantity === null)
    return actionError("Quantity must be a positive integer");

  try {
    await prisma.productPart.create({
      data: {
        productId,
        partId,
        quantity,
        itemNo: parseOptionalString(formData.get("itemNo")),
        remarks: parseOptionalString(formData.get("remarks")),
      },
    });
    revalidatePath(`/products/${productId}`);
    revalidatePath("/products");
    return actionSuccess();
  } catch {
    return actionError("Failed to add BOM line");
  }
}

export async function updateProductBomLine(
  formData: FormData,
): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  const productId = Number(formData.get("productId"));
  const quantity = parsePositiveInt(formData.get("quantity"));

  if (!Number.isFinite(id)) return actionError("Invalid BOM line id");
  if (!Number.isFinite(productId)) return actionError("Invalid product id");
  if (quantity === null)
    return actionError("Quantity must be a positive integer");

  try {
    await prisma.productPart.updateMany({
      where: { id, productId },
      data: {
        quantity,
        itemNo: parseOptionalString(formData.get("itemNo")),
        remarks: parseOptionalString(formData.get("remarks")),
      },
    });
    revalidatePath(`/products/${productId}`);
    revalidatePath("/products");
    return actionSuccess();
  } catch {
    return actionError("Failed to update BOM line");
  }
}

export async function removeProductBomLine(
  formData: FormData,
): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  const productId = Number(formData.get("productId"));

  if (!Number.isFinite(id)) return actionError("Invalid BOM line id");
  if (!Number.isFinite(productId)) return actionError("Invalid product id");

  try {
    await prisma.productPart.deleteMany({
      where: { id, productId },
    });
    revalidatePath(`/products/${productId}`);
    revalidatePath("/products");
    return actionSuccess();
  } catch {
    return actionError("Failed to remove BOM line");
  }
}
