import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import { VendorPartAssignment } from "@/components/vendors/vendor-part-assignment";
import { getVendorById, updateVendor } from "@/lib/actions/vendors";
import { prisma } from "@/lib/db";
import { mapPart } from "@/lib/db/types";

type VendorDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function VendorDetailPage({
  params,
}: VendorDetailPageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const allParts = (
    await prisma.part.findMany({ orderBy: { name: "asc" } })
  ).map(mapPart);

  return (
    <>
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/vendors">← Back to vendors</Link>
        </Button>
      </div>

      <PageHeader
        title={vendor.name}
        description="Vendor details and part assignments."
      >
        <VendorFormDialog
          vendor={vendor}
          action={updateVendor}
          triggerLabel="Edit vendor"
        />
      </PageHeader>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contact</CardDescription>
            <CardTitle className="text-base font-medium">
              {vendor.contactName ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Email</CardDescription>
            <CardTitle className="text-base font-medium">
              {vendor.email ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Phone</CardDescription>
            <CardTitle className="text-base font-medium">
              {vendor.phone ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned parts</CardDescription>
            <CardTitle className="text-base font-medium">
              {vendor.vendorParts.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {vendor.address ? (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardDescription>Address</CardDescription>
            <CardContent className="p-0 pt-1 text-sm">
              {vendor.address}
            </CardContent>
          </CardHeader>
        </Card>
      ) : null}

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Part assignments</h2>
        <VendorPartAssignment
          vendorId={vendor.id}
          assignedParts={vendor.vendorParts}
          availableParts={allParts}
        />
      </div>
    </>
  );
}
