import { NextResponse } from "next/server";

import { validateCatalogImageFile } from "@/lib/catalog-image-limits";
import { stageCatalogImageToBlob } from "@/lib/storage/catalog-image-blob";
import type { CatalogImageEntityType } from "@/lib/storage/catalog-image-storage";

function parseEntityType(
  value: FormDataEntryValue | null,
): CatalogImageEntityType {
  if (value === "products") return "products";
  return "parts";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = parseEntityType(formData.get("entityType"));

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Select an image file to upload" },
        { status: 400 },
      );
    }

    const validationError = validateCatalogImageFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const staged = await stageCatalogImageToBlob(buffer, file.name, entityType);
    return NextResponse.json(staged);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload image",
      },
      { status: 500 },
    );
  }
}
