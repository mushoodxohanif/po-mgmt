import { prisma } from "@/lib/db";
import { asPartSpecs } from "@/lib/db/types";
import { generateVendorPoPdfForVersion } from "@/lib/pdf/generate-vendor-po-pdf";
import { decimalToNumber } from "@/lib/services/money";

export type VendorPoLineInput = {
  partId: number;
  quantity: number;
};

export type SaveVendorPoVersionResult = {
  success: boolean;
  error?: string;
  versionId?: number;
  versionNumber?: number;
  pdfUrl?: string;
  unchanged?: boolean;
};

export type CreateVendorPoResult = {
  success: boolean;
  error?: string;
  vendorPoId?: number;
};

function normalizeLinesForComparison(lines: VendorPoLineInput[]) {
  return [...lines]
    .map((line) => ({ partId: line.partId, quantity: line.quantity }))
    .sort((a, b) => a.partId - b.partId);
}

function linesAreEqual(
  current: VendorPoLineInput[],
  next: VendorPoLineInput[],
): boolean {
  const a = normalizeLinesForComparison(current);
  const b = normalizeLinesForComparison(next);
  if (a.length !== b.length) return false;
  return a.every(
    (line, index) =>
      line.partId === b[index].partId && line.quantity === b[index].quantity,
  );
}

type LineValidationResult =
  | { ok: true; priceByPartId: Map<number, number> }
  | { ok: false; error: string };

async function validateVendorPoLines(
  vendorId: number,
  lines: VendorPoLineInput[],
): Promise<LineValidationResult> {
  if (lines.length === 0) {
    return {
      ok: false,
      error: "At least one line is required",
    };
  }

  const partIds = [...new Set(lines.map((line) => line.partId))];
  if (partIds.length !== lines.length) {
    return {
      ok: false,
      error: "Each part can only appear once",
    };
  }

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return {
        ok: false,
        error: "All quantities must be positive whole numbers",
      };
    }
  }

  const assignedParts = await prisma.vendorPart.findMany({
    where: { vendorId, partId: { in: partIds } },
    include: { part: { select: { name: true } } },
  });

  const assignedByPartId = new Map(
    assignedParts.map((row) => [row.partId, row]),
  );

  const unassignedPartIds = partIds.filter(
    (partId) => !assignedByPartId.has(partId),
  );
  if (unassignedPartIds.length > 0) {
    return {
      ok: false,
      error: "All parts must be assigned to this vendor",
    };
  }

  const missingPriceParts = assignedParts.filter(
    (row) => row.unitPrice === null,
  );
  if (missingPriceParts.length > 0) {
    const names = missingPriceParts.map((row) => row.part.name).join(", ");
    return {
      ok: false,
      error: `Set a unit price for these part(s) on the vendor page before creating a PO: ${names}`,
    };
  }

  const priceByPartId = new Map<number, number>();
  for (const row of assignedParts) {
    const price = decimalToNumber(row.unitPrice);
    if (price !== null) priceByPartId.set(row.partId, price);
  }

  return { ok: true, priceByPartId };
}

export async function createVendorPo(
  vendorId: number,
  lines: VendorPoLineInput[],
): Promise<CreateVendorPoResult> {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId },
  });

  if (!vendor) {
    return { success: false, error: "Vendor not found" };
  }

  const validation = await validateVendorPoLines(vendorId, lines);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const { priceByPartId } = validation;

  try {
    const { vendorPoId, versionId } = await prisma.$transaction(async (tx) => {
      const po = await tx.vendorPo.create({
        data: { vendorId },
      });

      const version = await tx.vendorPoVersion.create({
        data: {
          vendorPoId: po.id,
          versionNumber: 1,
        },
      });

      await tx.vendorPoVersionLine.createMany({
        data: lines.map((line) => ({
          vendorPoVersionId: version.id,
          partId: line.partId,
          quantity: line.quantity,
          unitPrice: priceByPartId.get(line.partId) ?? 0,
        })),
      });

      return { vendorPoId: po.id, versionId: version.id };
    });

    const pdfResult = await generateVendorPoPdfForVersion(versionId);
    if (!pdfResult.success) {
      return {
        success: true,
        vendorPoId,
        error: pdfResult.error ?? "PO created but PDF generation failed",
      };
    }

    return { success: true, vendorPoId };
  } catch {
    return { success: false, error: "Failed to create vendor PO" };
  }
}

export async function getVendorPoParts(vendorId: number) {
  const rows = await prisma.vendorPart.findMany({
    where: { vendorId },
    include: { part: true },
    orderBy: { part: { name: "asc" } },
  });

  return rows.map((row) => ({
    id: row.part.id,
    name: row.part.name,
    specs: asPartSpecs(row.part.specs),
    description: row.part.description,
    unitPrice: decimalToNumber(row.unitPrice),
  }));
}

export async function saveVendorPoVersion(
  vendorPoId: number,
  lines: VendorPoLineInput[],
): Promise<SaveVendorPoVersionResult> {
  const vendorPo = await prisma.vendorPo.findFirst({
    where: { id: vendorPoId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { lines: true },
      },
    },
  });

  if (!vendorPo) {
    return { success: false, error: "Vendor PO not found" };
  }

  const validation = await validateVendorPoLines(vendorPo.vendorId, lines);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const { priceByPartId } = validation;

  const latestVersion = vendorPo.versions[0];
  const currentLines: VendorPoLineInput[] =
    latestVersion?.lines.map((line) => ({
      partId: line.partId,
      quantity: line.quantity,
    })) ?? [];

  if (linesAreEqual(currentLines, lines)) {
    return { success: true, unchanged: true };
  }

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

  try {
    const versionId = await prisma.$transaction(async (tx) => {
      const version = await tx.vendorPoVersion.create({
        data: {
          vendorPoId,
          versionNumber: nextVersionNumber,
        },
      });

      await tx.vendorPoVersionLine.createMany({
        data: lines.map((line) => ({
          vendorPoVersionId: version.id,
          partId: line.partId,
          quantity: line.quantity,
          unitPrice: priceByPartId.get(line.partId) ?? 0,
        })),
      });

      await tx.vendorPo.update({
        where: { id: vendorPoId },
        data: { updatedAt: new Date() },
      });

      return version.id;
    });

    const pdfResult = await generateVendorPoPdfForVersion(versionId);
    if (!pdfResult.success) {
      return {
        success: true,
        versionId,
        versionNumber: nextVersionNumber,
        error: pdfResult.error ?? "Version saved but PDF generation failed",
      };
    }

    return {
      success: true,
      versionId,
      versionNumber: nextVersionNumber,
      pdfUrl: pdfResult.pdfUrl,
    };
  } catch {
    return { success: false, error: "Failed to save vendor PO version" };
  }
}
