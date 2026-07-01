import { prisma } from "@/lib/db";

export type DashboardData = {
  vendorCount: number;
  partCount: number;
  productCount: number;
  vendorPoCount: number;
  recentVendorPos: Array<{
    id: number;
    vendorName: string;
    versionNumber: number;
    lineCount: number;
    createdAt: Date;
  }>;
};

export async function getDashboardData(): Promise<DashboardData> {
  const [vendorCount, partCount, productCount, vendorPoCount, recentVendorPos] =
    await Promise.all([
      prisma.vendor.count(),
      prisma.part.count(),
      prisma.product.count(),
      prisma.vendorPo.count(),
      prisma.vendorPo.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          vendor: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: { lines: true },
          },
        },
      }),
    ]);

  return {
    vendorCount,
    partCount,
    productCount,
    vendorPoCount,
    recentVendorPos: recentVendorPos.map((po) => ({
      id: po.id,
      vendorName: po.vendor.name,
      versionNumber: po.versions[0]?.versionNumber ?? 1,
      lineCount: po.versions[0]?.lines.length ?? 0,
      createdAt: po.createdAt,
    })),
  };
}
