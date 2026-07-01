"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  actionError,
  actionSuccess,
} from "@/lib/actions/types";
import { prisma } from "@/lib/db";
import { mapVendorPoVersionLine } from "@/lib/db/types";
import {
  createVendorPo,
  getVendorPoParts,
  saveVendorPoVersion,
  type VendorPoLineInput,
} from "@/lib/services/vendor-po";

function parseVendorPoLines(formData: FormData): VendorPoLineInput[] | null {
  const raw = formData.get("lines");
  if (typeof raw !== "string" || !raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    const lines: VendorPoLineInput[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item === null ||
        !("partId" in item) ||
        !("quantity" in item)
      ) {
        return null;
      }
      const partId = Number(item.partId);
      const quantity = Number(item.quantity);
      if (!Number.isFinite(partId) || !Number.isFinite(quantity)) return null;
      lines.push({ partId, quantity });
    }

    return lines;
  } catch {
    return null;
  }
}

export async function createVendorPoAction(
  formData: FormData,
): Promise<ActionResult & { vendorPoId?: number }> {
  const vendorId = Number(formData.get("vendorId"));
  if (!Number.isFinite(vendorId)) {
    return actionError("Invalid vendor id");
  }

  const lines = parseVendorPoLines(formData);
  if (!lines) {
    return actionError("Invalid line items");
  }

  const result = await createVendorPo(vendorId, lines);

  if (!result.success) {
    return actionError(result.error ?? "Failed to create vendor PO");
  }

  revalidatePath("/vendor-pos");
  revalidatePath("/");
  if (result.vendorPoId) {
    revalidatePath(`/vendor-pos/${result.vendorPoId}`);
  }

  return {
    ...actionSuccess(),
    vendorPoId: result.vendorPoId,
  };
}

export { getVendorPoParts };

export async function saveVendorPoVersionAction(formData: FormData): Promise<
  ActionResult & {
    versionNumber?: number;
    pdfUrl?: string;
    unchanged?: boolean;
  }
> {
  const vendorPoId = Number(formData.get("vendorPoId"));
  if (!Number.isFinite(vendorPoId)) {
    return actionError("Invalid vendor PO id");
  }

  const lines = parseVendorPoLines(formData);
  if (!lines) {
    return actionError("Invalid line items");
  }

  const result = await saveVendorPoVersion(vendorPoId, lines);

  if (!result.success) {
    return actionError(result.error ?? "Failed to save vendor PO");
  }

  if (result.unchanged) {
    return { ...actionSuccess(), unchanged: true };
  }

  revalidatePath("/vendor-pos");
  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/");

  return {
    ...actionSuccess(),
    versionNumber: result.versionNumber,
    pdfUrl: result.pdfUrl,
  };
}

export async function getVendorPos() {
  const rows = await prisma.vendorPo.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      vendor: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { lines: true },
      },
    },
  });

  return rows.map((po) => ({
    ...po,
    versions: po.versions.map((version) => ({
      ...version,
      lines: version.lines.map(mapVendorPoVersionLine),
    })),
  }));
}

export async function getVendorPoById(id: number) {
  const vendorPo = await prisma.vendorPo.findFirst({
    where: { id },
    include: {
      vendor: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          lines: {
            include: { part: true },
          },
        },
      },
    },
  });

  if (!vendorPo) return null;

  return {
    ...vendorPo,
    versions: vendorPo.versions.map((version) => ({
      ...version,
      lines: version.lines.map((line) => ({
        ...mapVendorPoVersionLine(line),
        part: line.part,
      })),
    })),
  };
}
