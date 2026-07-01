import "dotenv/config";

import { readFile, unlink } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { createVendorPo, saveVendorPoVersion } from "@/lib/services/vendor-po";
import { getLocalPdfPath } from "@/lib/storage/pdf-storage";

const TEMP_VENDOR_NAME = "__smoke_test_vendor__";
const TEMP_PART_NAME = "__smoke_test_part__";

async function findVendorWithParts() {
  const row = await prisma.vendorPart.findFirst({
    where: { unitPrice: { not: null } },
    include: {
      vendor: { select: { id: true, name: true } },
      part: { select: { id: true } },
    },
  });

  if (!row) return null;

  return {
    vendorId: row.vendor.id,
    vendorName: row.vendor.name,
    partId: row.part.id,
  };
}

async function ensureTestFixture(): Promise<{
  vendorId: number;
  partId: number;
  createdFixture: boolean;
}> {
  const existing = await findVendorWithParts();
  if (existing) {
    return {
      vendorId: existing.vendorId,
      partId: existing.partId,
      createdFixture: false,
    };
  }

  const vendor = await prisma.vendor.create({
    data: { name: TEMP_VENDOR_NAME },
  });
  const part = await prisma.part.create({
    data: {
      name: TEMP_PART_NAME,
      normalizedName: TEMP_PART_NAME.toLowerCase(),
    },
  });
  await prisma.vendorPart.create({
    data: {
      vendorId: vendor.id,
      partId: part.id,
      unitPrice: 9.99,
    },
  });

  return { vendorId: vendor.id, partId: part.id, createdFixture: true };
}

async function assertPdfExists(versionId: number, label: string) {
  const version = await prisma.vendorPoVersion.findFirst({
    where: { id: versionId },
  });
  if (!version) {
    throw new Error(`${label}: version ${versionId} not found in database`);
  }

  if (!version.pdfUrl) {
    throw new Error(`${label}: version ${versionId} has no pdfUrl`);
  }

  if (version.pdfUrl.startsWith("http")) {
    const response = await fetch(version.pdfUrl, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(`${label}: blob PDF not reachable (${response.status})`);
    }
    console.log(
      `  ✓ ${label}: v${version.versionNumber} (id ${versionId}) — blob URL`,
    );
    return;
  }

  const pdfPath = getLocalPdfPath(versionId);
  const buffer = await readFile(pdfPath);
  if (buffer.length < 100 || buffer.subarray(0, 4).toString() !== "%PDF") {
    throw new Error(`${label}: invalid PDF at ${pdfPath}`);
  }

  console.log(
    `  ✓ ${label}: v${version.versionNumber} (id ${versionId}) — ${buffer.length} bytes`,
  );
}

async function cleanup(
  vendorPoId: number,
  versionIds: number[],
  fixture: { vendorId: number; partId: number; createdFixture: boolean },
) {
  await prisma.vendorPo.delete({ where: { id: vendorPoId } });

  for (const versionId of versionIds) {
    try {
      await unlink(getLocalPdfPath(versionId));
    } catch {
      // PDF may be stored in Blob when BLOB_READ_WRITE_TOKEN is set
    }
  }

  if (!fixture.createdFixture) return;

  await prisma.vendorPart.deleteMany({
    where: { vendorId: fixture.vendorId },
  });
  await prisma.part.delete({ where: { id: fixture.partId } });
  await prisma.vendor.delete({ where: { id: fixture.vendorId } });
}

async function main() {
  const fixture = await ensureTestFixture();
  const { vendorId, partId, createdFixture } = fixture;

  console.log(
    createdFixture
      ? `Created temporary vendor ${vendorId} and part ${partId}`
      : `Using existing vendor ${vendorId}, part ${partId}`,
  );

  const createResult = await createVendorPo(vendorId, [
    { partId, quantity: 1 },
  ]);
  if (!createResult.success || !createResult.vendorPoId) {
    throw new Error(
      `Create PO failed: ${createResult.error ?? "unknown error"}`,
    );
  }

  const vendorPoId = createResult.vendorPoId;
  const v1 = await prisma.vendorPoVersion.findFirst({
    where: { vendorPoId },
    orderBy: { versionNumber: "asc" },
  });
  if (!v1) throw new Error("Version 1 not created");

  await assertPdfExists(v1.id, "Create PO (v1)");

  const saveResult = await saveVendorPoVersion(vendorPoId, [
    { partId, quantity: 2 },
  ]);
  if (!saveResult.success || saveResult.unchanged) {
    throw new Error(
      `Save version failed: ${saveResult.error ?? "unchanged or unknown"}`,
    );
  }

  if (!saveResult.versionId) {
    throw new Error("Save version did not return versionId");
  }

  await assertPdfExists(v1.id, "Original v1 PDF still present");
  await assertPdfExists(saveResult.versionId, "Save PO (v2)");

  const versions = await prisma.vendorPoVersion.findMany({
    where: { vendorPoId },
    orderBy: { versionNumber: "asc" },
  });

  if (versions.length !== 2) {
    throw new Error(`Expected 2 versions, got ${versions.length}`);
  }

  await cleanup(vendorPoId, [v1.id, saveResult.versionId], {
    vendorId,
    partId,
    createdFixture,
  });

  console.log(`\nSmoke test passed for vendor PO ${vendorPoId}.`);
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
