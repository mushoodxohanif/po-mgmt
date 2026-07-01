import { FileDownIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  VendorPoEditor,
  VendorPoVersionHistory,
} from "@/components/vendor-pos/vendor-po-editor";
import { getVendorPoById, getVendorPoParts } from "@/lib/actions/vendor-pos";
import { sumLineTotals } from "@/lib/db/types";
import { formatMoney } from "@/lib/services/money";

type VendorPoDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function VendorPoDetailPage({
  params,
}: VendorPoDetailPageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const vendorPo = await getVendorPoById(id);
  if (!vendorPo) notFound();

  const vendorParts = await getVendorPoParts(vendorPo.vendorId);
  const latestVersion = vendorPo.versions[0];
  const totalQuantity =
    latestVersion?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const totalAmount = sumLineTotals(latestVersion?.lines ?? []);

  const editorLines =
    latestVersion?.lines.map((line) => ({
      partId: line.part.id,
      quantity: line.quantity,
    })) ?? [];

  return (
    <>
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/vendor-pos">← Back to vendor POs</Link>
        </Button>
      </div>

      <PageHeader
        title={`Vendor PO #${vendorPo.id}`}
        description={`Created ${formatDate(vendorPo.createdAt)} · ${vendorPo.vendor.name}`}
      >
        {latestVersion?.pdfUrl ? (
          <Button variant="outline" size="sm" asChild>
            <a
              href={latestVersion.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDownIcon data-icon="inline-start" />
              Download latest PDF
            </a>
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendor</CardDescription>
            <CardTitle className="text-base font-medium">
              <Link
                href={`/vendors/${vendorPo.vendor.id}`}
                className="hover:underline"
              >
                {vendorPo.vendor.name}
              </Link>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current version</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              v{latestVersion?.versionNumber ?? 1}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total quantity</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {totalQuantity}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total amount</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(totalAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-medium">Edit lines</h2>
          <p className="text-sm text-muted-foreground">
            Add, remove, or change quantities. Saving creates a new version and
            PDF.
          </p>
        </div>
        <VendorPoEditor
          vendorPoId={vendorPo.id}
          initialLines={editorLines}
          availableParts={vendorParts}
        />
      </section>

      <VendorPoVersionHistory versions={vendorPo.versions} />
    </>
  );
}
