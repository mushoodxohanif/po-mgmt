import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getLocalPdfPath } from "@/lib/storage/pdf-storage";

type RouteContext = {
  params: Promise<{ versionId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { versionId: versionIdParam } = await context.params;
  const versionId = Number(versionIdParam);
  if (!Number.isFinite(versionId)) notFound();

  const version = await prisma.vendorPoVersion.findFirst({
    where: { id: versionId },
    include: { vendorPo: true },
  });

  if (!version) notFound();

  try {
    const buffer = await readFile(getLocalPdfPath(versionId));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="vendor-po-${version.vendorPo.id}-v${version.versionNumber}.pdf"`,
      },
    });
  } catch {
    notFound();
  }
}
