import type {
  Part as PrismaPart,
  Product as PrismaProduct,
  Vendor as PrismaVendor,
  VendorPoVersionLine as PrismaVendorPoVersionLine,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/services/money";

export type PartSpecs = Record<string, string>;

export type Part = Omit<PrismaPart, "specs" | "imageUrls"> & {
  specs: PartSpecs;
  imageUrls: string[];
};

export type Product = Omit<PrismaProduct, "imageUrls"> & {
  imageUrls: string[];
};

export type Vendor = PrismaVendor;

export function asPartSpecs(value: unknown): PartSpecs {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as PartSpecs;
  }
  return {};
}

export function asImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function mapPart<T extends PrismaPart>(
  part: T,
): Omit<T, "specs" | "imageUrls"> & { specs: PartSpecs; imageUrls: string[] } {
  return {
    ...part,
    specs: asPartSpecs(part.specs),
    imageUrls: asImageUrls(part.imageUrls),
  };
}

export function mapProduct<T extends PrismaProduct>(
  product: T,
): Omit<T, "imageUrls"> & { imageUrls: string[] } {
  return {
    ...product,
    imageUrls: asImageUrls(product.imageUrls),
  };
}

export function mapVendorPoVersionLine<T extends PrismaVendorPoVersionLine>(
  line: T,
): Omit<T, "unitPrice"> & { unitPrice: number } {
  return {
    ...line,
    unitPrice: decimalToNumber(line.unitPrice) ?? 0,
  };
}

export function sumLineTotals(
  lines: { quantity: number; unitPrice: number }[],
): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}
