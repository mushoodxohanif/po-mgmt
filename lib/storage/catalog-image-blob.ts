import {
  CATALOG_IMAGE_CONTENT_TYPES,
  CATALOG_IMAGE_MAX_FILE_SIZE_BYTES,
} from "@/lib/catalog-image-limits";
import { isBlobStorageConfigured } from "@/lib/storage/blob-config";
import {
  buildCatalogImagePathname,
  CATALOG_IMAGE_BLOB_PREFIX,
  type CatalogImageEntityType,
  uploadCatalogImage,
} from "@/lib/storage/catalog-image-storage";

export type CatalogImageBlobUploadMode = "presigned" | "server" | "direct";

export function getCatalogImageBlobUploadMode(): CatalogImageBlobUploadMode {
  if (!isBlobStorageConfigured()) {
    return "direct";
  }

  if (process.env.VERCEL === "1") {
    return "presigned";
  }

  return "presigned";
}

export function isCatalogImageBlobUploadEnabled(): boolean {
  return getCatalogImageBlobUploadMode() !== "direct";
}

export function validateCatalogImageUploadPathname(pathname: string): void {
  if (!pathname.startsWith(CATALOG_IMAGE_BLOB_PREFIX)) {
    throw new Error("Invalid upload path");
  }

  const remainder = pathname.slice(CATALOG_IMAGE_BLOB_PREFIX.length);
  if (!remainder.startsWith("parts/") && !remainder.startsWith("products/")) {
    throw new Error("Invalid upload path");
  }
}

export async function stageCatalogImageToBlob(
  buffer: Buffer,
  fileName: string,
  entityType: CatalogImageEntityType,
): Promise<{ imageUrl: string }> {
  const pathname = buildCatalogImagePathname(entityType, fileName);
  const imageUrl = await uploadCatalogImage(buffer, pathname);
  return { imageUrl };
}

export {
  CATALOG_IMAGE_BLOB_PREFIX,
  CATALOG_IMAGE_CONTENT_TYPES,
  CATALOG_IMAGE_MAX_FILE_SIZE_BYTES,
};
