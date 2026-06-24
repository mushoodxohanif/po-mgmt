export const CATALOG_IMAGE_MAX_COUNT = 10;
export const CATALOG_IMAGE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const CATALOG_IMAGE_MAX_FILE_SIZE_LABEL = "10 MB";

export const CATALOG_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function formatCatalogImageFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateCatalogImageFileSize(file: File): string | null {
  if (file.size <= CATALOG_IMAGE_MAX_FILE_SIZE_BYTES) return null;
  return `${file.name} is too large (${formatCatalogImageFileSize(file.size)}). Each image must be ${CATALOG_IMAGE_MAX_FILE_SIZE_LABEL} or smaller.`;
}

export function validateCatalogImageFileName(fileName: string): string | null {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `${fileName}: must be a JPEG, PNG, WebP, or GIF image`;
  }
  return null;
}

export function validateCatalogImageFile(file: File): string | null {
  return (
    validateCatalogImageFileName(file.name) ??
    validateCatalogImageFileSize(file)
  );
}
