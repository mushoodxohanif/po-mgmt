import { CATALOG_IMAGE_MAX_COUNT } from "@/lib/catalog-image-limits";
import { isValidCatalogImageUrl } from "@/lib/storage/catalog-image-storage";

export function parseImageUrlsFromFormData(formData: FormData): string[] {
  const urls = formData
    .getAll("imageUrls")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(urls)];
}

export function validateImageUrls(urls: string[]): string | null {
  if (urls.length > CATALOG_IMAGE_MAX_COUNT) {
    return `You can attach at most ${CATALOG_IMAGE_MAX_COUNT} images`;
  }

  for (const url of urls) {
    if (!isValidCatalogImageUrl(url)) {
      return "One or more image URLs are invalid";
    }
  }

  return null;
}
