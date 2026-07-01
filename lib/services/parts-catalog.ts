import { prisma } from "@/lib/db";
import { asPartSpecs, type PartSpecs } from "@/lib/db/types";
import {
  buildPartInputFromImport,
  mergeSpecs,
  normalizePartName,
  type PartCategory,
  type SpecMergeStrategy,
} from "@/lib/services/part-specs";

export type PartUpsertInput = {
  name: string;
  category?: PartCategory | string | null;
  specs?: PartSpecs;
  description?: string | null;
  mergeStrategy: SpecMergeStrategy;
};

export type PartUpsertResult = {
  partId: number;
  created: boolean;
  updated: boolean;
};

function pickDescription(
  existing: string | null,
  incoming: string | null | undefined,
  mergeStrategy: SpecMergeStrategy,
): string | null {
  const next = incoming?.trim() || null;
  const current = existing?.trim() || null;

  if (mergeStrategy === "manual" || mergeStrategy === "replace") return next;
  if (!next) return current;
  if (!current) return next;
  return next.length > current.length ? next : current;
}

function pickCategory(
  existing: string | null,
  incoming: string | null | undefined,
  mergeStrategy: SpecMergeStrategy,
): string | null {
  const next = incoming?.trim() || null;
  if (mergeStrategy === "manual" || mergeStrategy === "replace") return next;
  if (!existing || existing === "generic") return next ?? existing;
  return existing;
}

export async function upsertPartRecord(
  input: PartUpsertInput,
): Promise<PartUpsertResult> {
  const normalizedName = normalizePartName(input.name);
  const existing = await prisma.part.findFirst({
    where: { normalizedName },
  });

  const nextSpecs = mergeSpecs(
    existing ? asPartSpecs(existing.specs) : undefined,
    input.specs ?? {},
    input.mergeStrategy,
  );
  const nextDescription = pickDescription(
    existing?.description ?? null,
    input.description,
    input.mergeStrategy,
  );
  const nextCategory = pickCategory(
    existing?.category ?? null,
    input.category,
    input.mergeStrategy,
  );

  if (existing) {
    const existingSpecs = asPartSpecs(existing.specs);
    const specsChanged =
      JSON.stringify(existingSpecs) !== JSON.stringify(nextSpecs);
    const hasChanges =
      existing.name !== input.name.trim() ||
      existing.description !== nextDescription ||
      existing.category !== nextCategory ||
      specsChanged;

    if (hasChanges) {
      await prisma.part.update({
        where: { id: existing.id },
        data: {
          name: input.name.trim(),
          category: nextCategory,
          specs: nextSpecs,
          description: nextDescription,
        },
      });
    }

    return { partId: existing.id, created: false, updated: hasChanges };
  }

  const inserted = await prisma.part.create({
    data: {
      name: input.name.trim(),
      normalizedName,
      category: input.category?.trim() || null,
      specs: input.specs ?? {},
      description: input.description?.trim() || null,
    },
    select: { id: true },
  });

  return { partId: inserted.id, created: true, updated: false };
}

export async function upsertPartFromImportLine(
  partName: string,
  rawDescription: string | null,
): Promise<PartUpsertResult> {
  const { category, specs, description } = buildPartInputFromImport(
    partName,
    rawDescription,
  );

  return upsertPartRecord({
    name: partName,
    category,
    specs,
    description,
    mergeStrategy: "import",
  });
}
