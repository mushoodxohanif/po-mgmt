import { prisma } from "@/lib/db";

async function main() {
  const products = await prisma.product.findMany({
    include: {
      productParts: {
        include: {
          part: { include: { vendorParts: { include: { vendor: true } } } },
        },
      },
    },
    take: 8,
  });

  for (const p of products) {
    console.log(
      `\nProduct: ${p.displayName} (${p.modelCode}) — ${p.productParts.length} BOM lines`,
    );
    for (const line of p.productParts) {
      const vendors = line.part.vendorParts.map((vp) => vp.vendor.name);
      console.log(
        `  - ${line.part.name} x${line.quantity} -> vendors: [${vendors.join(", ") || "NONE"}]`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
