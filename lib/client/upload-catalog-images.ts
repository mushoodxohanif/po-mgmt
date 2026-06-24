"use client";

import { uploadPresigned } from "@vercel/blob/client";

import { validateCatalogImageFile } from "@/lib/catalog-image-limits";
import { isLocalDevHostname } from "@/lib/sku-excel-path";
import type { CatalogImageBlobUploadMode } from "@/lib/storage/catalog-image-blob";
import {
  buildCatalogImagePathname,
  type CatalogImageEntityType,
} from "@/lib/storage/catalog-image-storage";

const CATALOG_IMAGE_UPLOAD_URL = "/api/catalog-images/upload";
const CATALOG_IMAGE_STAGE_URL = "/api/catalog-images/stage";

async function uploadCatalogImageViaServerStage(
  file: File,
  entityType: CatalogImageEntityType,
): Promise<string> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("entityType", entityType);

  const response = await fetch(CATALOG_IMAGE_STAGE_URL, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as {
    imageUrl?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to upload image to storage");
  }

  if (!payload?.imageUrl) {
    throw new Error("Upload succeeded but storage did not return an image URL");
  }

  return payload.imageUrl;
}

async function uploadCatalogImageViaPresignedBlob(
  file: File,
  entityType: CatalogImageEntityType,
): Promise<string> {
  const pathname = buildCatalogImagePathname(entityType, file.name);
  const blob = await uploadPresigned(pathname, file, {
    access: "public",
    handleUploadUrl: CATALOG_IMAGE_UPLOAD_URL,
    contentType: file.type || "image/png",
  });

  return blob.url;
}

export async function uploadCatalogImageFile(
  file: File,
  entityType: CatalogImageEntityType,
  mode: CatalogImageBlobUploadMode,
): Promise<string> {
  const validationError = validateCatalogImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (mode === "direct" || mode === "server") {
    return uploadCatalogImageViaServerStage(file, entityType);
  }

  try {
    return await uploadCatalogImageViaPresignedBlob(file, entityType);
  } catch (error) {
    const canFallbackToServerStage =
      mode === "presigned" &&
      isLocalDevHostname(window.location.hostname) &&
      file.size <= 4 * 1024 * 1024;

    if (canFallbackToServerStage) {
      return uploadCatalogImageViaServerStage(file, entityType);
    }

    throw error;
  }
}
