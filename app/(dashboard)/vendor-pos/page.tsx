import { DataTablePage } from "@/components/data-table/data-table-page";
import { PageHeader } from "@/components/page-header";
import { CreateVendorPoDialog } from "@/components/vendor-pos/create-vendor-po-dialog";
import { VendorPosDataTable } from "@/components/vendor-pos/vendor-pos-data-table";
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
  const [result, vendors] = await Promise.all([
    getVendorPosPaginated(listParams),
    getVendors(),
  ]);

  return (
    <DataTablePage
      header={
        <PageHeader
          className="mb-0"
          title="Vendor POs"
          description="Purchase orders for parts from vendors. Each save creates a new version and PDF."
        >
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
