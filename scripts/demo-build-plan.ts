import { prisma } from "@/lib/db";
import { buildDemandPreview } from "@/lib/services/bom-po-generation";

async function main() {
  const product = await prisma.product.findFirst({
    where: { modelCode: "CR-S14-50W-FL" },
  });

  if (!product) {
    console.error("Product not found");
    process.exit(1);
  }

  console.log(
    `Simulating: customer wants 150x "${product.displayName}" (${product.modelCode})\n`,
  );

  const result = await buildDemandPreview([
    { productId: product.id, buildQuantity: 150 },
  ]);

  if (!result.ok) {
    console.log("BLOCKED:", result.error);
    await prisma.$disconnect();
    return;
  }

  const { preview } = result;

  console.log("Part demand (BOM qty x 150 build qty):");
  for (const part of preview.parts) {
    console.log(
      `  - ${part.partName}: ${part.totalQuantity} units [${part.status}]${
        part.status === "resolved"
          ? ` -> vendor: ${part.vendorOptions.find((v) => v.id === part.resolvedVendorId)?.name}`
          : ""
      }`,
    );
  }

  console.log(
    `\nUnassigned parts (block generation): ${preview.unassignedCount}`,
  );
  console.log(
    `Ambiguous parts (need vendor choice): ${preview.ambiguousCount}`,
  );

  console.log(
    `\nIf all parts were resolved, this would create ${preview.vendorGroups.length} Vendor PO(s):`,
  );
  for (const group of preview.vendorGroups) {
    console.log(`  PO for ${group.vendorName}:`);
    for (const line of group.lines) {
      console.log(`    - ${line.partName} x${line.quantity}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
