"use server";

import { and, asc, eq, inArray, ne } from "drizzle-orm";
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
import { db } from "@/lib/db";
import {
  parts,
  productParts,
  products,
  vendorPoVersionLines,
} from "@/lib/db/schema";

export type PartOptionForProduct = {
  id: number;
  name: string;
  category: string | null;
  vendorNames: string[];
};

export async function getPartsForProductSelection(): Promise<
  PartOptionForProduct[]
> {
  const rows = await db.query.parts.findMany({
    orderBy: [asc(parts.name)],
    with: {
      vendorParts: {
        with: { vendor: true },
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

  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.modelCode, modelCode.trim()))
    .limit(1);

  if (existing) {
    return actionError("A product with this model code already exists");
  }

  if (partIds.length > 0) {
    const existingParts = await db
      .select({ id: parts.id })
      .from(parts)
      .where(inArray(parts.id, partIds));

    if (existingParts.length !== partIds.length) {
      return actionError("One or more selected parts no longer exist");
    }
  }

  const imageUrls = parseImageUrlsFromFormData(formData);
  const imageUrlsError = validateImageUrls(imageUrls);
  if (imageUrlsError) return actionError(imageUrlsError);

  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(products)
        .values({
          modelCode: modelCode.trim(),
          displayName: displayName.trim(),
          imageUrls,
        })
        .returning({ id: products.id });

      if (partIds.length > 0) {
        await tx.insert(productParts).values(
          partIds.map((partId, index) => ({
            productId: inserted.id,
            partId,
            quantity: 1,
            itemNo: String(index + 1),
          })),
        );
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

  const [duplicate] = await db
    .select()
    .from(products)
    .where(and(eq(products.modelCode, modelCode.trim()), ne(products.id, id)))
    .limit(1);

  if (duplicate) {
    return actionError("Another product with this model code already exists");
  }

  if (partIds.length > 0) {
    const existingParts = await db
      .select({ id: parts.id })
      .from(parts)
      .where(inArray(parts.id, partIds));

    if (existingParts.length !== partIds.length) {
      return actionError("One or more selected parts no longer exist");
    }
  }

  const imageUrls = parseImageUrlsFromFormData(formData);
  const imageUrlsError = validateImageUrls(imageUrls);
  if (imageUrlsError) return actionError(imageUrlsError);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({
          modelCode: modelCode.trim(),
          displayName: displayName.trim(),
          imageUrls,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id));

      if (partIds.length > 0) {
        const existingBom = await tx
          .select({ partId: productParts.partId })
          .from(productParts)
          .where(eq(productParts.productId, id));

        const existingPartIdSet = new Set(
          existingBom.map((line) => line.partId),
        );
        const newPartIds = partIds.filter(
          (partId) => !existingPartIdSet.has(partId),
        );

        if (newPartIds.length > 0) {
          await tx.insert(productParts).values(
            newPartIds.map((partId, index) => ({
              productId: id,
              partId,
              quantity: 1,
              itemNo: String(existingBom.length + index + 1),
            })),
          );
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
    await db.transaction(async (tx) => {
      const bomRows = await tx
        .select({ partId: productParts.partId })
        .from(productParts)
        .where(eq(productParts.productId, id));

      const bomPartIds = [...new Set(bomRows.map((row) => row.partId))];

      await tx.delete(products).where(eq(products.id, id));

      if (bomPartIds.length === 0) return;

      const stillLinkedRows = await tx
        .select({ partId: productParts.partId })
        .from(productParts)
        .where(inArray(productParts.partId, bomPartIds));

      const stillLinkedPartIds = new Set(
        stillLinkedRows.map((row) => row.partId),
      );

      const vendorPoRows = await tx
        .select({ partId: vendorPoVersionLines.partId })
        .from(vendorPoVersionLines)
        .where(inArray(vendorPoVersionLines.partId, bomPartIds));

      const vendorPoPartIds = new Set(vendorPoRows.map((row) => row.partId));

      const partIdsToDelete = bomPartIds.filter(
        (partId) =>
          !stillLinkedPartIds.has(partId) && !vendorPoPartIds.has(partId),
      );

      if (partIdsToDelete.length > 0) {
        await tx.delete(parts).where(inArray(parts.id, partIdsToDelete));
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
  return db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      productParts: {
        with: { part: true },
      },
    },
  });
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
    await db.insert(productParts).values({
      productId,
      partId,
      quantity,
      itemNo: parseOptionalString(formData.get("itemNo")),
      remarks: parseOptionalString(formData.get("remarks")),
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
    await db
      .update(productParts)
      .set({
        quantity,
        itemNo: parseOptionalString(formData.get("itemNo")),
        remarks: parseOptionalString(formData.get("remarks")),
      })
      .where(
        and(eq(productParts.id, id), eq(productParts.productId, productId)),
      );
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
    await db
      .delete(productParts)
      .where(
        and(eq(productParts.id, id), eq(productParts.productId, productId)),
      );
    revalidatePath(`/products/${productId}`);
    revalidatePath("/products");
    return actionSuccess();
  } catch {
    return actionError("Failed to remove BOM line");
  }
}
