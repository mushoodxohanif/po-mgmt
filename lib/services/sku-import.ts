import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";

import { db } from "@/lib/db";
import { productParts, products } from "@/lib/db/schema";
import {
  applyImageUrl,
  type BomRowImageUrls,
  type ExtractedCellImage,
  emptyBomRowImageUrls,
  extractImagesFromXlsxBuffer,
} from "@/lib/services/excel-images";
import { getImgbbApiKey, uploadImageToImgbb } from "@/lib/services/imgbb";
import { upsertPartFromImportLine } from "@/lib/services/parts-catalog";

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

export type SkippedRow = {
  row: number;
  reason: string;
  partName?: string;
};

export type FileImportResult = {
  fileName: string;
  modelCode: string;
  displayName: string;
  productCreated: boolean;
  productUpdated: boolean;
  partsCreated: number;
  partsUpdated: number;
  bomLinesImported: number;
  imagesExtracted: number;
  imagesUploaded: number;
  imagesFailed: number;
  imagesSkipped: boolean;
  skippedRows: SkippedRow[];
  error?: string;
};

export type ImportSummary = {
  filesProcessed: number;
  filesFailed: number;
  productsCreated: number;
  productsUpdated: number;
  partsCreated: number;
  partsUpdated: number;
  bomLinesImported: number;
  totalSkippedRows: number;
  imagesExtracted: number;
  imagesUploaded: number;
  imagesFailed: number;
  fileResults: FileImportResult[];
};

export function normalizePartName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
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
    modelCode,
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

  if (!getImgbbApiKey()) {
    stats.imagesSkipped = true;
    return stats;
  }

  const urlsByRow = new Map<number, BomRowImageUrls>();

  for (const image of images) {
    const line = parsed.bomLines.find(
      (entry) => entry.rowNumber === image.rowNumber,
    );
    const uploadName = [
      parsed.modelCode,
      line?.itemNo ?? `row-${image.rowNumber}`,
      image.view,
    ].join("-");

    const result = await uploadImageToImgbb(image.buffer, uploadName);
    if ("error" in result) {
      stats.imagesFailed++;
      continue;
    }

    stats.imagesUploaded++;

    let rowUrls = urlsByRow.get(image.rowNumber);
    if (!rowUrls) {
      rowUrls = emptyBomRowImageUrls();
      urlsByRow.set(image.rowNumber, rowUrls);
    }
    applyImageUrl(rowUrls, image.view, result.url);
  }

  for (const line of parsed.bomLines) {
    const urls = urlsByRow.get(line.rowNumber);
    if (urls) {
      line.imageUrls = urls;
    }
  }

  return stats;
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

async function upsertPart(
  line: ParsedBomLine,
): Promise<{ partId: number; created: boolean; updated: boolean }> {
  return upsertPartFromImportLine(line.partName, line.description);
}

export async function importParsedSku(
  parsed: ParsedSkuFile,
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
  const [existingProduct] = await db
    .select()
    .from(products)
    .where(eq(products.modelCode, parsed.modelCode))
    .limit(1);

  let productId: number;
  let productCreated = false;
  let productUpdated = false;

  if (existingProduct) {
    productId = existingProduct.id;
    if (existingProduct.displayName !== parsed.displayName) {
      await db
        .update(products)
        .set({
          displayName: parsed.displayName,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));
      productUpdated = true;
    }
  } else {
    const [inserted] = await db
      .insert(products)
      .values({
        modelCode: parsed.modelCode,
        displayName: parsed.displayName,
      })
      .returning({ id: products.id });
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

  await db.delete(productParts).where(eq(productParts.productId, productId));

  if (productPartRows.length > 0) {
    await db.insert(productParts).values(productPartRows);
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
): Promise<FileImportResult> {
  try {
    const parsed = parseSkuBuffer(buffer, fileName);
    const imageStats = await attachImagesToParsedSkuFromBuffer(parsed, buffer);
    const result = await importParsedSku(parsed);
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
): Promise<FileImportResult> {
  const { readFile } = await import("node:fs/promises");
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const buffer = await readFile(filePath);
  return importSkuBuffer(buffer, fileName);
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

  for (const file of files) {
    const result = await importSkuFile(join(directoryPath, file));
    fileResults.push(result);
  }

  return summarizeImportResults(fileResults);
}

export async function findSkuFilePathForModelCode(
  directoryPath: string,
  modelCode: string,
): Promise<string | null> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const normalizedTarget = modelCode.trim().toLowerCase();
  const entries = await readdir(directoryPath);
  const files = entries
    .filter((name) => name.toLowerCase().endsWith(".xlsx"))
    .sort();

  for (const file of files) {
    const filePath = join(directoryPath, file);
    try {
      const parsed = parseSkuFile(filePath);
      if (parsed.modelCode.trim().toLowerCase() === normalizedTarget) {
        return filePath;
      }
    } catch {}
  }

  return null;
}

export function summarizeImportResults(
  fileResults: FileImportResult[],
): ImportSummary {
  const successful = fileResults.filter((result) => !result.error);

  return {
    filesProcessed: fileResults.length,
    filesFailed: fileResults.filter((result) => result.error).length,
    productsCreated: successful.filter((result) => result.productCreated)
      .length,
    productsUpdated: successful.filter((result) => result.productUpdated)
      .length,
    partsCreated: successful.reduce(
      (sum, result) => sum + result.partsCreated,
      0,
    ),
    partsUpdated: successful.reduce(
      (sum, result) => sum + result.partsUpdated,
      0,
    ),
    bomLinesImported: successful.reduce(
      (sum, result) => sum + result.bomLinesImported,
      0,
    ),
    totalSkippedRows: successful.reduce(
      (sum, result) => sum + result.skippedRows.length,
      0,
    ),
    imagesExtracted: successful.reduce(
      (sum, result) => sum + result.imagesExtracted,
      0,
    ),
    imagesUploaded: successful.reduce(
      (sum, result) => sum + result.imagesUploaded,
      0,
    ),
    imagesFailed: successful.reduce(
      (sum, result) => sum + result.imagesFailed,
      0,
    ),
    fileResults,
  };
}

export function formatImportSummary(summary: ImportSummary): string {
  const lines: string[] = [
    "SKU Import Summary",
    "==================",
    `Files processed: ${summary.filesProcessed}`,
    `Files failed: ${summary.filesFailed}`,
    `Products created: ${summary.productsCreated}`,
    `Products updated: ${summary.productsUpdated}`,
    `Parts created: ${summary.partsCreated}`,
    `Parts updated: ${summary.partsUpdated}`,
    `BOM lines imported: ${summary.bomLinesImported}`,
    `Rows skipped: ${summary.totalSkippedRows}`,
    `Images extracted: ${summary.imagesExtracted}`,
    `Images uploaded: ${summary.imagesUploaded}`,
    `Image upload failures: ${summary.imagesFailed}`,
    "",
    "Per file:",
  ];

  for (const result of summary.fileResults) {
    if (result.error) {
      lines.push(`  ✗ ${result.fileName}: ${result.error}`);
      continue;
    }

    const flags = [
      result.productCreated ? "product created" : null,
      result.productUpdated ? "product updated" : null,
    ]
      .filter(Boolean)
      .join(", ");

    lines.push(
      `  ✓ ${result.fileName} (${result.modelCode})`,
      `      ${result.bomLinesImported} BOM lines, ${result.partsCreated} new parts, ${result.partsUpdated} updated parts${flags ? `, ${flags}` : ""}`,
      `      Images: ${result.imagesExtracted} extracted, ${result.imagesUploaded} uploaded${result.imagesFailed > 0 ? `, ${result.imagesFailed} failed` : ""}${result.imagesSkipped ? " (upload skipped — no IMGBB_API_KEY)" : ""}`,
    );

    if (result.skippedRows.length > 0) {
      lines.push(`      Skipped ${result.skippedRows.length} rows:`);
      for (const skipped of result.skippedRows.slice(0, 5)) {
        const label = skipped.partName ? ` "${skipped.partName}"` : "";
        lines.push(`        - Row ${skipped.row}${label}: ${skipped.reason}`);
      }
      if (result.skippedRows.length > 5) {
        lines.push(
          `        ... and ${result.skippedRows.length - 5} more skipped rows`,
        );
      }
    }
  }

  return lines.join("\n");
}
