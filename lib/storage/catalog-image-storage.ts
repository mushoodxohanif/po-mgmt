import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

import { getBlobAuthOptions } from "@/lib/storage/blob-config";

const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".catalog-image-storage");

export const CATALOG_IMAGE_BLOB_PREFIX = "catalog-images/";

export type CatalogImageEntityType = "parts" | "products";

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base || "image.png";
}

function sanitizeStorageKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

export function buildCatalogImagePathname(
  entityType: CatalogImageEntityType,
  fileName: string,
): string {
  const safeName = sanitizeFileName(fileName);
  return `${CATALOG_IMAGE_BLOB_PREFIX}${entityType}/pending/${Date.now()}-${safeName}`;
}

export function getLocalCatalogImagePath(storageKey: string): string {
  return path.join(LOCAL_STORAGE_DIR, storageKey);
}

export async function uploadCatalogImage(
  buffer: Buffer,
  storageKey: string,
): Promise<string> {
  const safeKey = sanitizeStorageKey(storageKey);
  const contentType = contentTypeFromPath(safeKey);

  const auth = getBlobAuthOptions();
  if (auth) {
    const blob = await put(safeKey, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: true,
      allowOverwrite: false,
      ...auth,
    });
    return blob.url;
  }

  const relativeKey = safeKey.startsWith(CATALOG_IMAGE_BLOB_PREFIX)
    ? safeKey.slice(CATALOG_IMAGE_BLOB_PREFIX.length)
    : safeKey;
  const filePath = getLocalCatalogImagePath(relativeKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return `/api/catalog-images/${relativeKey.split("/").map(encodeURIComponent).join("/")}`;
}

export function isValidCatalogImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("/api/catalog-images/")) {
    const storagePath = trimmed.slice("/api/catalog-images/".length);
    return (
      storagePath.length > 0 &&
      !storagePath.includes("..") &&
      (storagePath.startsWith("parts/") || storagePath.startsWith("products/"))
    );
  }

  try {
    const pathname = decodeURIComponent(new URL(trimmed).pathname).replace(
      /^\//,
      "",
    );
    return pathname.startsWith(CATALOG_IMAGE_BLOB_PREFIX);
  } catch {
    return false;
  }
}
