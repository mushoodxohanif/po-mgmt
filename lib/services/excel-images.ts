import { readFile } from "node:fs/promises";
import JSZip from "jszip";

export type ImageView = "side" | "front" | "bottom";

export type ExtractedCellImage = {
  rowNumber: number;
  view: ImageView;
  buffer: Buffer;
  mediaPath: string;
};

export type ExtractImagesResult = {
  images: ExtractedCellImage[];
  imagesExtracted: number;
};

const VIEW_BY_COL: Record<number, ImageView> = {
  7: "side",
  8: "front",
  9: "bottom",
};

export const COL_SIDE = 7;
export const COL_FRONT = 8;
export const COL_BOTTOM = 9;

function viewFromCol(col: number): ImageView | null {
  return VIEW_BY_COL[col] ?? null;
}

function decodeCellRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!match) return null;

  let col = 0;
  for (const char of match[1]) {
    col = col * 26 + (char.charCodeAt(0) - 64);
  }

  return { col: col - 1, row: Number(match[2]) };
}

function normalizeMediaPath(target: string): string {
  return target
    .replace(/^\.\.\//, "xl/")
    .replace(/^\/+/, "")
    .replace(/^xl\/xl\//, "xl/");
}

function parseRelationshipMap(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const relPattern =
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g;

  for (const match of relsXml.matchAll(relPattern)) {
    map.set(match[1], normalizeMediaPath(match[2]));
  }

  return map;
}

async function readZipText(
  file: JSZip.JSZipObject | null,
): Promise<string | null> {
  if (!file) return null;
  return file.async("text");
}

async function readZipBuffer(
  file: JSZip.JSZipObject | null,
): Promise<Buffer | null> {
  if (!file) return null;
  const data = await file.async("nodebuffer");
  return Buffer.from(data);
}

async function parseRichValueImages(
  zip: JSZip,
  validRows: Set<number>,
): Promise<ExtractedCellImage[]> {
  const [sheetXml, metadataXml, rvDataXml, rvRelXml, rvRelRelsXml] =
    await Promise.all([
      readZipText(zip.file("xl/worksheets/sheet1.xml")),
      readZipText(zip.file("xl/metadata.xml")),
      readZipText(zip.file("xl/richData/rdrichvalue.xml")),
      readZipText(zip.file("xl/richData/richValueRel.xml")),
      readZipText(zip.file("xl/richData/_rels/richValueRel.xml.rels")),
    ]);

  if (!sheetXml || !metadataXml || !rvDataXml || !rvRelXml || !rvRelRelsXml) {
    return [];
  }

  const vmToRichValueIndex: number[] = [];
  const vmPattern = /<bk>\s*<rc t="1" v="(\d+)"\s*\/>\s*<\/bk>/g;
  for (const match of metadataXml.matchAll(vmPattern)) {
    vmToRichValueIndex.push(Number(match[1]));
  }

  if (vmToRichValueIndex.length === 0) return [];

  const richValueImageIndexes: number[] = [];
  const rvPattern = /<rv s="\d+">((?:\s*<v>\d+<\/v>)+)\s*<\/rv>/g;
  for (const match of rvDataXml.matchAll(rvPattern)) {
    const firstValue = /<v>(\d+)<\/v>/.exec(match[1]);
    richValueImageIndexes.push(Number(firstValue?.[1] ?? 0));
  }

  const relIds: string[] = [];
  const relIdPattern = /<rel r:id="([^"]+)"/g;
  for (const match of rvRelXml.matchAll(relIdPattern)) {
    relIds.push(match[1]);
  }

  const ridToMedia = parseRelationshipMap(rvRelRelsXml);
  const images: ExtractedCellImage[] = [];
  const seen = new Set<string>();

  const cellPattern = /<c r="([^"]+)"[^>]*\bvm="(\d+)"/g;
  for (const match of sheetXml.matchAll(cellPattern)) {
    const cellRef = match[1];
    const vmIndex = Number(match[2]);
    const decoded = decodeCellRef(cellRef);
    if (!decoded) continue;

    const view = viewFromCol(decoded.col);
    if (!view || !validRows.has(decoded.row)) continue;

    const richValueIndex = vmToRichValueIndex[vmIndex];
    if (richValueIndex === undefined) continue;

    const imageIndex = richValueImageIndexes[richValueIndex];
    if (imageIndex === undefined) continue;

    const relId = relIds[imageIndex];
    if (!relId) continue;

    const mediaPath = ridToMedia.get(relId);
    if (!mediaPath) continue;

    const key = `${decoded.row}:${view}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const buffer = await readZipBuffer(zip.file(mediaPath));
    if (!buffer) continue;

    images.push({
      rowNumber: decoded.row,
      view,
      buffer,
      mediaPath,
    });
  }

  return images;
}

async function parseDrawingImages(
  zip: JSZip,
  validRows: Set<number>,
): Promise<ExtractedCellImage[]> {
  const drawingFile = zip.file("xl/drawings/drawing1.xml");
  const drawingRelsFile = zip.file("xl/drawings/_rels/drawing1.xml.rels");
  if (!drawingFile || !drawingRelsFile) return [];

  const [drawingXml, drawingRelsXml] = await Promise.all([
    drawingFile.async("text"),
    drawingRelsFile.async("text"),
  ]);

  const ridToMedia = parseRelationshipMap(drawingRelsXml);
  const images: ExtractedCellImage[] = [];
  const seen = new Set<string>();

  const anchorPattern =
    /<xdr:(?:oneCellAnchor|twoCellAnchor)[^>]*>[\s\S]*?<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?(?:<xdr:pic[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>)/g;

  for (const match of drawingXml.matchAll(anchorPattern)) {
    const col = Number(match[1]);
    const row = Number(match[2]) + 1;
    const relId = match[3];
    const view = viewFromCol(col);
    if (!view || !validRows.has(row)) continue;

    const key = `${row}:${view}`;
    if (seen.has(key)) continue;

    const mediaPath = ridToMedia.get(relId);
    if (!mediaPath) continue;

    const buffer = await readZipBuffer(zip.file(mediaPath));
    if (!buffer) continue;

    seen.add(key);
    images.push({
      rowNumber: row,
      view,
      buffer,
      mediaPath,
    });
  }

  return images;
}

export async function extractImagesFromXlsxBuffer(
  fileBuffer: Buffer,
  validRows: Set<number>,
): Promise<ExtractImagesResult> {
  const zip = await JSZip.loadAsync(fileBuffer);

  const richValueImages = await parseRichValueImages(zip, validRows);
  const images =
    richValueImages.length > 0
      ? richValueImages
      : await parseDrawingImages(zip, validRows);

  return {
    images,
    imagesExtracted: images.length,
  };
}

export async function extractImagesFromXlsx(
  filePath: string,
  validRows: Set<number>,
): Promise<ExtractImagesResult> {
  const fileBuffer = await readFile(filePath);
  return extractImagesFromXlsxBuffer(fileBuffer, validRows);
}

export type BomRowImageUrls = {
  imageSideUrl: string | null;
  imageFrontUrl: string | null;
  imageBottomUrl: string | null;
};

export function emptyBomRowImageUrls(): BomRowImageUrls {
  return {
    imageSideUrl: null,
    imageFrontUrl: null,
    imageBottomUrl: null,
  };
}

export function applyImageUrl(
  urls: BomRowImageUrls,
  view: ImageView,
  url: string,
): void {
  if (view === "side") urls.imageSideUrl = url;
  if (view === "front") urls.imageFrontUrl = url;
  if (view === "bottom") urls.imageBottomUrl = url;
}
