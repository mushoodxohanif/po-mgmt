"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  actionError,
  actionSuccess,
} from "@/lib/actions/types";
import { prisma } from "@/lib/db";
import { mapPart } from "@/lib/db/types";
import { decimalToNumber, parsePriceInput } from "@/lib/services/money";

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function createVendor(formData: FormData): Promise<ActionResult> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return actionError("Vendor name is required");
  }

  try {
    await prisma.vendor.create({
      data: {
        name: name.trim(),
        contactName: parseOptionalString(formData.get("contactName")),
        email: parseOptionalString(formData.get("email")),
        phone: parseOptionalString(formData.get("phone")),
        address: parseOptionalString(formData.get("address")),
      },
    });
    revalidatePath("/vendors");
    return actionSuccess();
  } catch {
    return actionError("Failed to create vendor");
  }
}

export async function updateVendor(formData: FormData): Promise<ActionResult> {
  const idRaw = formData.get("id");
  const name = formData.get("name");
  const id = Number(idRaw);

  if (!Number.isFinite(id)) return actionError("Invalid vendor id");
  if (typeof name !== "string" || !name.trim()) {
    return actionError("Vendor name is required");
  }

  try {
    await prisma.vendor.update({
      where: { id },
      data: {
        name: name.trim(),
        contactName: parseOptionalString(formData.get("contactName")),
        email: parseOptionalString(formData.get("email")),
        phone: parseOptionalString(formData.get("phone")),
        address: parseOptionalString(formData.get("address")),
      },
    });
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${id}`);
    return actionSuccess();
  } catch {
    return actionError("Failed to update vendor");
  }
}

export async function deleteVendor(formData: FormData): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return actionError("Invalid vendor id");

  try {
    await prisma.vendor.delete({ where: { id } });
    revalidatePath("/vendors");
    return actionSuccess();
  } catch {
    return actionError(
      "Failed to delete vendor. It may be linked to purchase orders.",
    );
  }
}

export async function assignPartToVendor(
  formData: FormData,
): Promise<ActionResult> {
  const vendorId = Number(formData.get("vendorId"));
  const partId = Number(formData.get("partId"));
  const priceRaw = formData.get("unitPrice");

  if (!Number.isFinite(vendorId) || !Number.isFinite(partId)) {
    return actionError("Invalid vendor or part");
  }

  let unitPrice: number | null = null;
  if (typeof priceRaw === "string" && priceRaw.trim()) {
    unitPrice = parsePriceInput(priceRaw);
    if (unitPrice === null) {
      return actionError("Unit price must be a positive number");
    }
  }

  try {
    await prisma.vendorPart.createMany({
      data: [{ vendorId, partId, unitPrice }],
      skipDuplicates: true,
    });
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}`);
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError("Failed to assign part to vendor");
  }
}

export async function updateVendorPartPrice(
  formData: FormData,
): Promise<ActionResult> {
  const vendorId = Number(formData.get("vendorId"));
  const partId = Number(formData.get("partId"));
  const priceRaw = formData.get("unitPrice");

  if (!Number.isFinite(vendorId) || !Number.isFinite(partId)) {
    return actionError("Invalid vendor or part");
  }

  if (typeof priceRaw !== "string" || !priceRaw.trim()) {
    return actionError("Unit price is required");
  }

  const unitPrice = parsePriceInput(priceRaw);
  if (unitPrice === null) {
    return actionError("Unit price must be a positive number");
  }

  try {
    const result = await prisma.vendorPart.updateMany({
      where: { vendorId, partId },
      data: { unitPrice },
    });

    if (result.count === 0) {
      return actionError("This part is not assigned to the vendor");
    }

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}`);
    return actionSuccess();
  } catch {
    return actionError("Failed to update unit price");
  }
}

export async function removePartFromVendor(
  formData: FormData,
): Promise<ActionResult> {
  const vendorId = Number(formData.get("vendorId"));
  const partId = Number(formData.get("partId"));

  if (!Number.isFinite(vendorId) || !Number.isFinite(partId)) {
    return actionError("Invalid vendor or part");
  }

  try {
    await prisma.vendorPart.deleteMany({
      where: { vendorId, partId },
    });
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}`);
    revalidatePath("/parts");
    return actionSuccess();
  } catch {
    return actionError("Failed to remove part from vendor");
  }
}

export async function getVendors() {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}

export async function getVendorById(id: number) {
  const vendor = await prisma.vendor.findFirst({
    where: { id },
    include: {
      vendorParts: {
        include: { part: true },
      },
    },
  });

  if (!vendor) return null;

  return {
    ...vendor,
    vendorParts: vendor.vendorParts.map((link) => ({
      ...link,
      unitPrice: decimalToNumber(link.unitPrice),
      part: mapPart(link.part),
    })),
  };
}
