import { issueSignedToken } from "@vercel/blob";
import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { CATALOG_IMAGE_MAX_FILE_SIZE_BYTES } from "@/lib/catalog-image-limits";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import {
  CATALOG_IMAGE_CONTENT_TYPES,
  isCatalogImageBlobUploadEnabled,
  validateCatalogImageUploadPathname,
} from "@/lib/storage/catalog-image-blob";

const PRESIGNED_URL_TTL_MS = 15 * 60 * 1000;
const SIGNED_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  if (!isCatalogImageBlobUploadEnabled()) {
    return NextResponse.json(
      { error: "Blob storage is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadPresignedBody;
  const auth = getBlobAuthOptions();

  if (!auth) {
    return NextResponse.json(
      { error: "Blob storage is not configured" },
      { status: 503 },
    );
  }

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        validateCatalogImageUploadPathname(pathname);

        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: [...CATALOG_IMAGE_CONTENT_TYPES],
          maximumSizeInBytes: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES,
          validUntil: Date.now() + SIGNED_TOKEN_TTL_MS,
          ...auth,
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: [...CATALOG_IMAGE_CONTENT_TYPES],
            maximumSizeInBytes: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            validUntil: Date.now() + PRESIGNED_URL_TTL_MS,
          },
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
