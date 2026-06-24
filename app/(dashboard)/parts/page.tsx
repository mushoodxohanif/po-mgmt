import { DataTablePage } from "@/components/data-table/data-table-page";
import { PageHeader } from "@/components/page-header";
import { PartFormDialog } from "@/components/parts/part-form-dialog";
import { PartsDataTable } from "@/components/parts/parts-data-table";
import {
  createPart,
  getPartVendorIdsMap,
  getVendorsForPartSelection,
} from "@/lib/actions/parts";
import { parsePartsListParams } from "@/lib/data-table/list-params";
import { getPartsPaginated } from "@/lib/data-table/list-queries";
import { getCatalogImageBlobUploadMode } from "@/lib/storage/catalog-image-blob";

type PartsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const listParams = parsePartsListParams(await searchParams);
  const [result, availableVendors, partVendorIds] = await Promise.all([
    getPartsPaginated(listParams),
    getVendorsForPartSelection(),
    getPartVendorIdsMap(),
  ]);

  return (
    <DataTablePage
      header={
        <PageHeader
          className="mb-0"
          title="Parts"
          description="Manage parts and view linked vendors or products."
        >
          <PartFormDialog
            action={createPart}
            availableVendors={availableVendors}
            imageUploadMode={getCatalogImageBlobUploadMode()}
          />
        </PageHeader>
      }
    >
      <PartsDataTable
        result={result}
        listParams={listParams}
        availableVendors={availableVendors}
        partVendorIds={partVendorIds}
        imageUploadMode={getCatalogImageBlobUploadMode()}
      />
    </DataTablePage>
  );
}
