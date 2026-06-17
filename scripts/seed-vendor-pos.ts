import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  parts,
  vendorParts,
  vendorPos,
  vendorPoVersions,
  vendors,
} from "@/lib/db/schema";
import { createVendorPo, saveVendorPoVersion } from "@/lib/services/vendor-po";

const SEED_VENDOR_EMAIL = "seed-vendor-pos@demo.local";

const SEED_VENDORS = [
  {
    name: "Shenzhen Opto Electronics",
    contactName: "Wei Chen",
    email: SEED_VENDOR_EMAIL,
    phone: "+86 755 1234 5678",
    address: "Nanshan District, Shenzhen, Guangdong",
    partCategories: ["led_chip", "led_driver", "pcb_board"] as const,
    extraPartNames: ["AC Input Wire", "DC Output Wire"],
  },
  {
    name: "Dongguan Precision Metals",
    contactName: "Li Mei",
    email: SEED_VENDOR_EMAIL,
    phone: "+86 769 8765 4321",
    address: "Chang'an Town, Dongguan, Guangdong",
    partCategories: ["mechanical", "fastener"] as const,
    extraPartNames: [] as string[],
  },
  {
    name: "Guangzhou Assembly Supplies",
    contactName: "Zhang Hua",
    email: SEED_VENDOR_EMAIL,
    phone: "+86 20 5555 0101",
    address: "Baiyun District, Guangzhou, Guangdong",
    partCategories: ["consumable", "wire", "generic"] as const,
    extraPartNames: [] as string[],
  },
] as const;

type SeedVendor = (typeof SEED_VENDORS)[number];

async function findExistingSeedVendors() {
  return db.select().from(vendors).where(eq(vendors.email, SEED_VENDOR_EMAIL));
}

async function cleanupSeedData(existingVendorIds: number[]) {
  if (existingVendorIds.length === 0) return;

  await db
    .delete(vendorPos)
    .where(inArray(vendorPos.vendorId, existingVendorIds));
  await db
    .delete(vendorParts)
    .where(inArray(vendorParts.vendorId, existingVendorIds));
  await db.delete(vendors).where(inArray(vendors.id, existingVendorIds));
}

async function assignPartsToVendor(
  vendorId: number,
  categories: readonly SeedVendor["partCategories"][number][],
  extraPartNames: readonly string[],
) {
  const matchingParts = await db
    .select({ id: parts.id })
    .from(parts)
    .where(inArray(parts.category, [...categories]));

  const extraParts =
    extraPartNames.length > 0
      ? await db
          .select({ id: parts.id })
          .from(parts)
          .where(inArray(parts.name, [...extraPartNames]))
      : [];

  const partIds = new Set([
    ...matchingParts.map((part) => part.id),
    ...extraParts.map((part) => part.id),
  ]);

  if (partIds.size === 0) return;

  await db
    .insert(vendorParts)
    .values(
      [...partIds].map((partId) => ({
        vendorId,
        partId,
      })),
    )
    .onConflictDoNothing();
}

async function ensureSeedVendors() {
  const created: Array<{ id: number; name: string }> = [];

  for (const seed of SEED_VENDORS) {
    const [vendor] = await db
      .insert(vendors)
      .values({
        name: seed.name,
        contactName: seed.contactName,
        email: seed.email,
        phone: seed.phone,
        address: seed.address,
      })
      .returning({ id: vendors.id, name: vendors.name });

    await assignPartsToVendor(
      vendor.id,
      seed.partCategories,
      seed.extraPartNames,
    );
    created.push(vendor);
  }

  return created;
}

async function partIdByName(name: string): Promise<number> {
  const part = await db.query.parts.findFirst({
    where: eq(parts.name, name),
  });
  if (!part) {
    throw new Error(`Part not found: ${name}`);
  }
  return part.id;
}

async function createVersionedDemoPo(vendorId: number) {
  const smdChip = await partIdByName("SMD CHIP");
  const ledDriver = await partIdByName("LED Driver");
  const pcbBoard = await partIdByName("PCB Board");
  const acInputWire = await partIdByName("AC Input Wire");
  const dcOutputWire = await partIdByName("DC Output Wire");

  console.log(
    "\nCreating demo PO with version history (Shenzhen Opto Electronics)…",
  );

  const createResult = await createVendorPo(vendorId, [
    { partId: smdChip, quantity: 500 },
    { partId: ledDriver, quantity: 25 },
    { partId: pcbBoard, quantity: 25 },
  ]);
  if (!createResult.success || !createResult.vendorPoId) {
    throw new Error(createResult.error ?? "Failed to create demo PO v1");
  }

  const vendorPoId = createResult.vendorPoId;
  console.log(
    `  v1 — initial order: SMD CHIP ×500, LED Driver ×25, PCB Board ×25`,
  );

  const updates: Array<{
    label: string;
    lines: { partId: number; quantity: number }[];
  }> = [
    {
      label: "v2 — increase SMD CHIP quantity (500 → 750)",
      lines: [
        { partId: smdChip, quantity: 750 },
        { partId: ledDriver, quantity: 25 },
        { partId: pcbBoard, quantity: 25 },
      ],
    },
    {
      label: "v3 — add AC Input Wire line",
      lines: [
        { partId: smdChip, quantity: 750 },
        { partId: ledDriver, quantity: 25 },
        { partId: pcbBoard, quantity: 25 },
        { partId: acInputWire, quantity: 25 },
      ],
    },
    {
      label: "v4 — remove PCB Board line",
      lines: [
        { partId: smdChip, quantity: 750 },
        { partId: ledDriver, quantity: 25 },
        { partId: acInputWire, quantity: 25 },
      ],
    },
    {
      label: "v5 — adjust LED Driver qty and add DC Output Wire",
      lines: [
        { partId: smdChip, quantity: 750 },
        { partId: ledDriver, quantity: 20 },
        { partId: acInputWire, quantity: 25 },
        { partId: dcOutputWire, quantity: 25 },
      ],
    },
  ];

  for (const update of updates) {
    const result = await saveVendorPoVersion(vendorPoId, update.lines);
    if (!result.success || result.unchanged) {
      throw new Error(result.error ?? `Failed: ${update.label}`);
    }
    console.log(`  ${update.label}`);
  }

  return vendorPoId;
}

async function createSimplePos(vendorIds: {
  metals: number;
  supplies: number;
}) {
  const heatSink = await partIdByName("Heat Sink");
  const frame = await partIdByName("Frame");
  const reflector = await partIdByName("Reflector");
  const labels = await partIdByName("Labels");
  const thermalPaste = await partIdByName("Thermal Paste");
  const bindingTape = await partIdByName("Binding Tape");

  console.log("\nCreating simple POs for other vendors…");

  const metalsResult = await createVendorPo(vendorIds.metals, [
    { partId: heatSink, quantity: 100 },
    { partId: frame, quantity: 50 },
    { partId: reflector, quantity: 75 },
  ]);
  if (!metalsResult.success || !metalsResult.vendorPoId) {
    throw new Error(metalsResult.error ?? "Failed to create metals PO");
  }
  console.log(
    `  PO #${metalsResult.vendorPoId} — Dongguan Precision Metals (Heat Sink, Frame, Reflector)`,
  );

  const suppliesResult = await createVendorPo(vendorIds.supplies, [
    { partId: labels, quantity: 200 },
    { partId: thermalPaste, quantity: 10 },
    { partId: bindingTape, quantity: 15 },
  ]);
  if (!suppliesResult.success || !suppliesResult.vendorPoId) {
    throw new Error(suppliesResult.error ?? "Failed to create supplies PO");
  }
  console.log(
    `  PO #${suppliesResult.vendorPoId} — Guangzhou Assembly Supplies (Labels, Thermal Paste, Binding Tape)`,
  );

  return [metalsResult.vendorPoId, suppliesResult.vendorPoId];
}

async function staggerVersionTimestamps(vendorPoId: number) {
  const versions = await db.query.vendorPoVersions.findMany({
    where: eq(vendorPoVersions.vendorPoId, vendorPoId),
    orderBy: (v, { asc }) => [asc(v.versionNumber)],
  });

  const base = Date.now() - versions.length * 86_400_000;

  for (const [index, version] of versions.entries()) {
    const createdAt = new Date(base + index * 86_400_000);
    await db
      .update(vendorPoVersions)
      .set({ createdAt })
      .where(eq(vendorPoVersions.id, version.id));
  }
}

async function main() {
  const force = process.argv.includes("--force");

  const existing = await findExistingSeedVendors();
  if (existing.length > 0 && !force) {
    console.log(
      "Seed vendor POs already exist. Run with --force to replace them.",
    );
    console.log(`Existing vendors: ${existing.map((v) => v.name).join(", ")}`);
    process.exit(0);
  }

  if (existing.length > 0 && force) {
    console.log("Removing previous seed data…");
    await cleanupSeedData(existing.map((v) => v.id));
  }

  const partCount = await db.select({ id: parts.id }).from(parts);
  if (partCount.length === 0) {
    console.error(
      "No parts in the database. Import product BOMs first (bun run import:skus).",
    );
    process.exit(1);
  }

  console.log(`Found ${partCount.length} parts in the database.`);

  const seedVendors = await ensureSeedVendors();
  console.log(
    `Created ${seedVendors.length} seed vendors with part assignments.`,
  );

  const optoVendor = seedVendors.find(
    (v) => v.name === "Shenzhen Opto Electronics",
  );
  const metalsVendor = seedVendors.find(
    (v) => v.name === "Dongguan Precision Metals",
  );
  const suppliesVendor = seedVendors.find(
    (v) => v.name === "Guangzhou Assembly Supplies",
  );

  if (!optoVendor || !metalsVendor || !suppliesVendor) {
    throw new Error("Failed to create seed vendors");
  }

  const demoPoId = await createVersionedDemoPo(optoVendor.id);
  await staggerVersionTimestamps(demoPoId);

  const otherPoIds = await createSimplePos({
    metals: metalsVendor.id,
    supplies: suppliesVendor.id,
  });

  console.log("\nSeed complete.");
  console.log(`  Demo PO (5 versions): /vendor-pos/${demoPoId}`);
  for (const id of otherPoIds) {
    console.log(`  Simple PO: /vendor-pos/${id}`);
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
