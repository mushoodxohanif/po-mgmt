import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

import { getLocalCatalogImagePath } from "@/lib/storage/catalog-image-storage";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { path: pathSegments } = await context.params;
  if (!pathSegments?.length) notFound();

  const storageKey = pathSegments.map(decodeURIComponent).join("/");
  if (storageKey.includes("..")) notFound();
  if (!storageKey.startsWith("parts/") && !storageKey.startsWith("products/")) {
    notFound();
  }

  try {
    const buffer = await readFile(getLocalCatalogImagePath(storageKey));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypeFromPath(storageKey),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    notFound();
  }
}
