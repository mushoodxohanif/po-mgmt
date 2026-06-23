import { DataTablePage } from "@/components/data-table/data-table-page";
import { PageHeader } from "@/components/page-header";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import { VendorsDataTable } from "@/components/vendors/vendors-data-table";
import { createVendor } from "@/lib/actions/vendors";
import { parseVendorsListParams } from "@/lib/data-table/list-params";
import { getVendorsPaginated } from "@/lib/data-table/list-queries";

type VendorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  const listParams = parseVendorsListParams(await searchParams);
  const result = await getVendorsPaginated(listParams);

  return (
    <DataTablePage
      header={
        <PageHeader
          className="mb-0"
          title="Vendors"
          description="Manage suppliers and assign parts for purchase order routing."
        >
          <VendorFormDialog action={createVendor} />
        </PageHeader>
      }
    >
      <VendorsDataTable result={result} listParams={listParams} />
    </DataTablePage>
  );
}
