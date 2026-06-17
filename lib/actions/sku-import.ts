"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  actionError,
  actionSuccess,
} from "@/lib/actions/types";
import {
  type FileImportResult,
  formatImportSummary,
  type ImportSummary,
  importSkuBuffer,
  parseSkuBuffer,
  summarizeImportResults,
} from "@/lib/services/sku-import";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function revalidateAfterImport() {
  revalidatePath("/products");
  revalidatePath("/parts");
  revalidatePath("/inventory");
  revalidatePath("/");
}

function getUploadedFiles(formData: FormData, fieldName: string): File[] {
  return formData
    .getAll(fieldName)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function validateXlsxFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return `${file.name}: must be an .xlsx file`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${file.name}: file is too large (max 10 MB)`;
  }
  return null;
}

async function importUploadedFile(file: File): Promise<FileImportResult> {
  const validationError = validateXlsxFile(file);
  if (validationError) {
    return {
      fileName: file.name,
      modelCode: "",
      displayName: "",
      productCreated: false,
      productUpdated: false,
      partsCreated: 0,
      partsUpdated: 0,
      bomLinesImported: 0,
      imagesExtracted: 0,
      imagesUploaded: 0,
      imagesFailed: 0,
      imagesSkipped: false,
      skippedRows: [],
      error: validationError,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return importSkuBuffer(buffer, file.name);
}

function buildImportActionResult(summary: ImportSummary): ActionResult & {
  summary?: ImportSummary;
  summaryText?: string;
} {
  if (summary.filesFailed > 0) {
    return {
      ...actionError(
        `${summary.filesFailed} file(s) failed to import. See details below.`,
      ),
      summary,
      summaryText: formatImportSummary(summary),
    };
  }

  return {
    ...actionSuccess(),
    summary,
    summaryText: formatImportSummary(summary),
  };
}

export async function uploadSkuFilesAction(
  formData: FormData,
): Promise<ActionResult & { summary?: ImportSummary; summaryText?: string }> {
  const files = getUploadedFiles(formData, "files");
  if (files.length === 0) {
    return actionError("Select at least one Excel file");
  }

  try {
    const fileResults: FileImportResult[] = [];
    for (const file of files) {
      fileResults.push(await importUploadedFile(file));
    }

    const summary = summarizeImportResults(fileResults);
    revalidateAfterImport();
    return buildImportActionResult(summary);
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : "SKU import failed",
    );
  }
}

export async function uploadProductBomAction(
  formData: FormData,
): Promise<ActionResult & { result?: FileImportResult }> {
  const productId = Number(formData.get("productId"));
  const expectedModelCode = formData.get("modelCode");
  const file = formData.get("file");

  if (!Number.isFinite(productId)) {
    return actionError("Invalid product id");
  }
  if (typeof expectedModelCode !== "string" || !expectedModelCode.trim()) {
    return actionError("Model code is required");
  }
  if (!(file instanceof File) || file.size === 0) {
    return actionError("Select an Excel file to upload");
  }

  const validationError = validateXlsxFile(file);
  if (validationError) {
    return actionError(validationError);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSkuBuffer(buffer, file.name);

    if (
      parsed.modelCode.trim().toLowerCase() !==
      expectedModelCode.trim().toLowerCase()
    ) {
      return actionError(
        `Excel model code "${parsed.modelCode}" does not match product model code "${expectedModelCode.trim()}"`,
      );
    }

    const result = await importSkuBuffer(buffer, file.name);
    revalidateAfterImport();
    revalidatePath(`/products/${productId}`);

    if (result.error) {
      return { ...actionError(result.error), result };
    }

    return { ...actionSuccess(), result };
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : "BOM upload failed",
    );
  }
}
