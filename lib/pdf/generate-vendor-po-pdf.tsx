import { renderToBuffer } from "@react-pdf/renderer";

import { prisma } from "@/lib/db";
import { asPartSpecs } from "@/lib/db/types";
import {
  VendorPoDocument,
  type VendorPoPdfData,
} from "@/lib/pdf/vendor-po-document";
import { decimalToNumber } from "@/lib/services/money";
import { formatPartSpecs } from "@/lib/services/part-specs";
import { storeVendorPoPdf } from "@/lib/storage/pdf-storage";

const COMPANY_NAME = "Creative Lighting PVT LTD";

function pickThumbnailUrl(
  rows: {
    partId: number;
    imageFrontUrl: string | null;
    imageSideUrl: string | null;
    imageBottomUrl: string | null;
  }[],
  partId: number,
): string | null {
  const matches = rows.filter((row) => row.partId === partId);
  for (const row of matches) {
    if (row.imageFrontUrl) return row.imageFrontUrl;
  }
  for (const row of matches) {
    if (row.imageSideUrl) return row.imageSideUrl;
  }
  for (const row of matches) {
    if (row.imageBottomUrl) return row.imageBottomUrl;
  }
  return null;
}

export async function generateVendorPoPdfForVersion(
  versionId: number,
): Promise<{ success: boolean; pdfUrl?: string; error?: string }> {
  const version = await prisma.vendorPoVersion.findFirst({
    where: { id: versionId },
    include: {
      lines: {
        include: { part: true },
      },
      vendorPo: {
        include: { vendor: true },
      },
    },
  });

  if (!version) {
    return { success: false, error: "Version not found" };
  }

  const partIds = version.lines.map((line) => line.partId);
  const partImageRows =
    partIds.length > 0
      ? await prisma.productPart.findMany({
          where: { partId: { in: partIds } },
          select: {
            partId: true,
            imageFrontUrl: true,
            imageSideUrl: true,
            imageBottomUrl: true,
          },
        })
      : [];

  const pdfData: VendorPoPdfData = {
    companyName: COMPANY_NAME,
    vendorPoId: version.vendorPo.id,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt,
    vendor: {
      name: version.vendorPo.vendor.name,
      contactName: version.vendorPo.vendor.contactName,
      email: version.vendorPo.vendor.email,
      phone: version.vendorPo.vendor.phone,
      address: version.vendorPo.vendor.address,
    },
    lines: version.lines
      .map((line) => {
        const unitPrice = decimalToNumber(line.unitPrice) ?? 0;
        return {
          partName: line.part.name,
          description: formatPartSpecs({
            specs: asPartSpecs(line.part.specs),
            description: line.part.description,
          }),
          quantity: line.quantity,
          unitPrice,
          lineTotal: line.quantity * unitPrice,
          thumbnailUrl: pickThumbnailUrl(partImageRows, line.partId),
        };
      })
      .sort((a, b) => a.partName.localeCompare(b.partName)),
  };

  try {
    const buffer = await renderToBuffer(<VendorPoDocument data={pdfData} />);
    const pdfUrl = await storeVendorPoPdf(versionId, Buffer.from(buffer));

    await prisma.vendorPoVersion.update({
      where: { id: versionId },
      data: { pdfUrl },
    });

    return { success: true, pdfUrl };
  } catch {
    return { success: false, error: "Failed to generate PDF" };
  }
}
