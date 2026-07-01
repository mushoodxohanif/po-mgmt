import { DataTablePage } from "@/components/data-table/data-table-page";
import { PageHeader } from "@/components/page-header";
import { CreateVendorPoDialog } from "@/components/vendor-pos/create-vendor-po-dialog";
import { GenerateFromBomDialog } from "@/components/vendor-pos/generate-from-bom-dialog";
import { VendorPosDataTable } from "@/components/vendor-pos/vendor-pos-data-table";
import { getProductsForBuildPlan } from "@/lib/actions/bom-po-generation";
import { getVendors } from "@/lib/actions/vendors";
import { parseVendorPosListParams } from "@/lib/data-table/list-params";
import { getVendorPosPaginated } from "@/lib/data-table/list-queries";

type VendorPosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VendorPosPage({
  searchParams,
}: VendorPosPageProps) {
  const listParams = parseVendorPosListParams(await searchParams);
  const [result, vendors, buildPlanProducts] = await Promise.all([
    getVendorPosPaginated(listParams),
    getVendors(),
    getProductsForBuildPlan(),
  ]);

  return (
    <DataTablePage
      header={
        <PageHeader
          className="mb-0"
          title="Vendor POs"
          description="Purchase orders for parts from vendors. Each save creates a new version and PDF."
        >
          <GenerateFromBomDialog products={buildPlanProducts} />
          <CreateVendorPoDialog vendors={vendors} />
        </PageHeader>
      }
    >
      <VendorPosDataTable
        result={result}
        listParams={listParams}
        vendors={vendors}
      />
    </DataTablePage>
  );
}
