import path from "node:path";
import * as XLSX from "xlsx";

import { prisma } from "@/lib/db";
import {
  applyImageUrl,
  type BomRowImageUrls,
  type ExtractedCellImage,
  emptyBomRowImageUrls,
  extractImagesFromXlsxBuffer,
} from "@/lib/services/excel-images";
import { normalizePartName } from "@/lib/services/part-specs";
import { upsertPartFromImportLine } from "@/lib/services/parts-catalog";
import {
  type FileImportResult,
  type ImportSummary,
  type SkippedRow,
  summarizeImportResults,
} from "@/lib/sku-import-summary";
import { uploadBomImage } from "@/lib/storage/bom-image-storage";
import {
  deleteSkuExcelBlob,
  downloadSkuExcelBlob,
} from "@/lib/storage/sku-excel-blob";

export type {
  FileImportResult,
  ImportSummary,
  SkippedRow,
} from "@/lib/sku-import-summary";
export {
  formatImportSummary,
  summarizeImportResults,
} from "@/lib/sku-import-summary";

const BOM_START_ROW = 5; // 0-indexed row 6
const COL = {
  ITEM_NO: 0,
  PART_NAME: 1,
  DESCRIPTION: 3,
  QUANTITY: 6,
  REMARKS: 10,
} as const;

export type ParsedBomLine = {
  rowNumber: number;
  itemNo: string | null;
  partName: string;
  description: string | null;
  quantity: number;
  remarks: string | null;
  imageUrls?: BomRowImageUrls;
};

export type ParsedSkuFile = {
  fileName: string;
  displayName: string;
  modelCode: string;
  bomLines: ParsedBomLine[];
  skippedRows: SkippedRow[];
};

export type ImportSkuOptions = {
  /** When true, updates an existing product's BOM instead of rejecting it. */
  allowExistingProduct?: boolean;
  /** When set, the parsed model code must match this value. */
  expectedModelCode?: string;
};

function normalizedModelCode(modelCode: string): string {
  return modelCode.trim().toLowerCase();
}

export function getDuplicatePartsError(
  bomLines: ParsedBomLine[],
): string | null {
  const rowsByPart = new Map<string, { partName: string; rows: number[] }>();

  for (const line of bomLines) {
    const key = normalizePartName(line.partName);
    const existing = rowsByPart.get(key);
    if (existing) {
      existing.rows.push(line.rowNumber);
      continue;
    }

    rowsByPart.set(key, { partName: line.partName, rows: [line.rowNumber] });
  }

  const duplicates = [...rowsByPart.values()].filter(
    (entry) => entry.rows.length > 1,
  );
  if (duplicates.length === 0) {
    return null;
  }

  const details = duplicates
    .map(
      (entry) =>
        `"${entry.partName}" (rows ${entry.rows.sort((a, b) => a - b).join(", ")})`,
    )
    .join("; ");

  return `Duplicate part(s) in BOM: ${details}`;
}

export function getDuplicateModelCodeInBatchError(
  parsed: ParsedSkuFile,
  seenModelCodes: Map<string, string>,
): string | null {
  const modelKey = normalizedModelCode(parsed.modelCode);
  const priorFile = seenModelCodes.get(modelKey);
  if (!priorFile) {
    return null;
  }

  return `Model code "${parsed.modelCode}" is duplicated in this upload (also in ${priorFile})`;
}

function trackModelCodeInBatch(
  parsed: ParsedSkuFile,
  seenModelCodes: Map<string, string>,
): void {
  seenModelCodes.set(normalizedModelCode(parsed.modelCode), parsed.fileName);
}

export async function validateParsedSkuForImport(
  parsed: ParsedSkuFile,
  options: ImportSkuOptions = {},
): Promise<string | null> {
  const duplicatePartsError = getDuplicatePartsError(parsed.bomLines);
  if (duplicatePartsError) {
    return duplicatePartsError;
  }

  if (options.allowExistingProduct) {
    return null;
  }

  const existingProduct = await prisma.product.findFirst({
    where: { modelCode: parsed.modelCode.trim() },
    select: { id: true },
  });

  if (existingProduct) {
    return `Product with model code "${parsed.modelCode}" already exists`;
  }

  return null;
}

function cellValue(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
): string | number | undefined {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell) return undefined;
  return cell.v as string | number;
}

function asTrimmedString(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseQuantity(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

function stripLedPrefix(displayName: string): string {
  return displayName.replace(/^LED\s+/i, "").trim();
}

function displayNameFromFileName(fileName: string): string {
  return fileName.replace(/\.xlsx$/i, "").trim();
}

export function parseSkuWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
): ParsedSkuFile {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.["!ref"]) {
    throw new Error("Sheet is empty");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  let displayName = stripLedPrefix(asTrimmedString(cellValue(sheet, 1, 1)));
  const modelCode = asTrimmedString(cellValue(sheet, 2, 1));

  if (!displayName) {
    displayName = displayNameFromFileName(fileName);
  }

  if (!modelCode) {
    throw new Error("Missing model code in cell B3");
  }

  const bomLines: ParsedBomLine[] = [];
  const skippedRows: SkippedRow[] = [];

  for (let row = BOM_START_ROW; row <= range.e.r; row++) {
    const partName = asTrimmedString(cellValue(sheet, row, COL.PART_NAME));
    const rawQuantity = cellValue(sheet, row, COL.QUANTITY);

    if (!partName) {
      if (
        asTrimmedString(cellValue(sheet, row, COL.ITEM_NO)) ||
        asTrimmedString(cellValue(sheet, row, COL.DESCRIPTION))
      ) {
        skippedRows.push({
          row: row + 1,
          reason: "Empty part name",
        });
      }
      continue;
    }

    const quantity = parseQuantity(rawQuantity);
    if (quantity === null) {
      skippedRows.push({
        row: row + 1,
        reason: "Missing or invalid quantity",
        partName,
      });
      continue;
    }

    const itemNoRaw = asTrimmedString(cellValue(sheet, row, COL.ITEM_NO));
    const descriptionRaw = asTrimmedString(
      cellValue(sheet, row, COL.DESCRIPTION),
    );
    const remarksRaw = asTrimmedString(cellValue(sheet, row, COL.REMARKS));

    bomLines.push({
      rowNumber: row + 1,
      itemNo: itemNoRaw || null,
      partName,
      description: descriptionRaw || null,
      quantity,
      remarks: remarksRaw || null,
    });
  }

  return {
    fileName,
    displayName,
    modelCode: modelCode.trim(),
    bomLines,
    skippedRows,
  };
}

export function parseSkuFile(filePath: string): ParsedSkuFile {
  const workbook = XLSX.readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  return parseSkuWorkbook(workbook, fileName);
}

export function parseSkuBuffer(
  buffer: Buffer,
  fileName: string,
): ParsedSkuFile {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return parseSkuWorkbook(workbook, fileName);
}

export type ImageUploadStats = {
  imagesExtracted: number;
  imagesUploaded: number;
  imagesFailed: number;
  imagesSkipped: boolean;
};

async function uploadImagesForParsedSku(
  parsed: ParsedSkuFile,
  images: ExtractedCellImage[],
  imagesExtracted: number,
): Promise<ImageUploadStats> {
  const stats: ImageUploadStats = {
    imagesExtracted,
    imagesUploaded: 0,
    imagesFailed: 0,
    imagesSkipped: false,
  };

  if (images.length === 0) {
    return stats;
  }

  const urlsByRow = new Map<number, BomRowImageUrls>();

  for (const image of images) {
    const line = parsed.bomLines.find(
      (entry) => entry.rowNumber === image.rowNumber,
    );
    const ext = path.extname(image.mediaPath) || ".png";
    const uploadName = [
      parsed.modelCode,
      line?.itemNo ?? `row-${image.rowNumber}`,
      image.view,
    ].join("-");

    try {
      const url = await uploadBomImage(
        image.buffer,
        `${parsed.modelCode}/${uploadName}${ext}`,
      );
      stats.imagesUploaded++;

      let rowUrls = urlsByRow.get(image.rowNumber);
      if (!rowUrls) {
        rowUrls = emptyBomRowImageUrls();
        urlsByRow.set(image.rowNumber, rowUrls);
      }
      applyImageUrl(rowUrls, image.view, url);
    } catch {
      stats.imagesFailed++;
    }
  }

  for (const line of parsed.bomLines) {
    const urls = urlsByRow.get(line.rowNumber);
    if (urls) {
      line.imageUrls = urls;
    }
  }

  return stats;
}

async function upsertPart(
  line: ParsedBomLine,
): Promise<{ partId: number; created: boolean; updated: boolean }> {
  return upsertPartFromImportLine(line.partName, line.description);
}

export async function attachImagesToParsedSkuFromBuffer(
  parsed: ParsedSkuFile,
  buffer: Buffer,
): Promise<ImageUploadStats> {
  const validRows = new Set(parsed.bomLines.map((line) => line.rowNumber));
  const { images, imagesExtracted } = await extractImagesFromXlsxBuffer(
    buffer,
    validRows,
  );
  return uploadImagesForParsedSku(parsed, images, imagesExtracted);
}

export async function importParsedSku(
  parsed: ParsedSkuFile,
  options: ImportSkuOptions = {},
): Promise<
  Omit<
    FileImportResult,
    | "fileName"
    | "imagesExtracted"
    | "imagesUploaded"
    | "imagesFailed"
    | "imagesSkipped"
  >
> {
  const existingProduct = await prisma.product.findFirst({
    where: { modelCode: parsed.modelCode },
  });

  let productId: number;
  let productCreated = false;
  let productUpdated = false;

  if (existingProduct) {
    if (!options.allowExistingProduct) {
      throw new Error(
        `Product with model code "${parsed.modelCode}" already exists`,
      );
    }

    productId = existingProduct.id;
    if (existingProduct.displayName !== parsed.displayName) {
      await prisma.product.update({
        where: { id: productId },
        data: { displayName: parsed.displayName },
      });
      productUpdated = true;
    }
  } else {
    const inserted = await prisma.product.create({
      data: {
        modelCode: parsed.modelCode,
        displayName: parsed.displayName,
      },
      select: { id: true },
    });
    productId = inserted.id;
    productCreated = true;
  }

  let partsCreated = 0;
  let partsUpdated = 0;
  const productPartRows: {
    productId: number;
    partId: number;
    itemNo: string | null;
    quantity: number;
    remarks: string | null;
    imageSideUrl: string | null;
    imageFrontUrl: string | null;
    imageBottomUrl: string | null;
  }[] = [];

  for (const line of parsed.bomLines) {
    const { partId, created, updated } = await upsertPart(line);
    if (created) partsCreated++;
    if (updated) partsUpdated++;

    productPartRows.push({
      productId,
      partId,
      itemNo: line.itemNo,
      quantity: line.quantity,
      remarks: line.remarks,
      imageSideUrl: line.imageUrls?.imageSideUrl ?? null,
      imageFrontUrl: line.imageUrls?.imageFrontUrl ?? null,
      imageBottomUrl: line.imageUrls?.imageBottomUrl ?? null,
    });
  }

  await prisma.productPart.deleteMany({ where: { productId } });

  if (productPartRows.length > 0) {
    await prisma.productPart.createMany({ data: productPartRows });
  }

  return {
    modelCode: parsed.modelCode,
    displayName: parsed.displayName,
    productCreated,
    productUpdated,
    partsCreated,
    partsUpdated,
    bomLinesImported: productPartRows.length,
    skippedRows: parsed.skippedRows,
  };
}

export async function importSkuBuffer(
  buffer: Buffer,
  fileName: string,
  options: ImportSkuOptions = {},
  seenModelCodes?: Map<string, string>,
): Promise<FileImportResult> {
  try {
    const parsed = parseSkuBuffer(buffer, fileName);

    if (seenModelCodes) {
      const batchError = getDuplicateModelCodeInBatchError(
        parsed,
        seenModelCodes,
      );
      if (batchError) {
        throw new Error(batchError);
      }
      trackModelCodeInBatch(parsed, seenModelCodes);
    }

    const validationError = await validateParsedSkuForImport(parsed, options);
    if (validationError) {
      throw new Error(validationError);
    }

    if (options.expectedModelCode) {
      if (
        parsed.modelCode.trim().toLowerCase() !==
        options.expectedModelCode.trim().toLowerCase()
      ) {
        throw new Error(
          `Excel model code "${parsed.modelCode}" does not match product model code "${options.expectedModelCode.trim()}"`,
        );
      }
    }

    const imageStats = await attachImagesToParsedSkuFromBuffer(parsed, buffer);
    const result = await importParsedSku(parsed, options);
    return {
      fileName,
      ...result,
      ...imageStats,
    };
  } catch (error) {
    return {
      fileName,
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function importSkuFile(
  filePath: string,
  options: ImportSkuOptions = {},
  seenModelCodes?: Map<string, string>,
): Promise<FileImportResult> {
  const { readFile } = await import("node:fs/promises");
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const buffer = await readFile(filePath);
  return importSkuBuffer(buffer, fileName, options, seenModelCodes);
}

export async function importSkuFromBlobUrl(
  blobUrl: string,
  fileName: string,
  options: ImportSkuOptions = {},
  seenModelCodes?: Map<string, string>,
): Promise<FileImportResult> {
  try {
    const buffer = await downloadSkuExcelBlob(blobUrl);
    return await importSkuBuffer(buffer, fileName, options, seenModelCodes);
  } catch (error) {
    return {
      fileName,
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
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await deleteSkuExcelBlob(blobUrl).catch(() => undefined);
  }
}

export async function importSkuDirectory(
  directoryPath: string,
): Promise<ImportSummary> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const entries = await readdir(directoryPath);
  const files = entries
    .filter((name) => name.toLowerCase().endsWith(".xlsx"))
    .sort();

  const fileResults: FileImportResult[] = [];
  const seenModelCodes = new Map<string, string>();

  for (const file of files) {
    const result = await importSkuFile(
      join(directoryPath, file),
      {},
      seenModelCodes,
    );
    fileResults.push(result);
  }

  return summarizeImportResults(fileResults);
}
