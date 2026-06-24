import { DataTablePage } from "@/components/data-table/data-table-page";
import { PageHeader } from "@/components/page-header";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductsDataTable } from "@/components/products/products-data-table";
import { UploadSkuFilesButton } from "@/components/products/sku-import-buttons";
import {
  createProduct,
  getPartsForProductSelection,
} from "@/lib/actions/products";
import { parseProductsListParams } from "@/lib/data-table/list-params";
import { getProductsPaginated } from "@/lib/data-table/list-queries";
import { getCatalogImageBlobUploadMode } from "@/lib/storage/catalog-image-blob";
import { getSkuExcelBlobUploadMode } from "@/lib/storage/sku-excel-blob";

type ProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const listParams = parseProductsListParams(await searchParams);
  const [result, availableParts] = await Promise.all([
    getProductsPaginated(listParams),
    getPartsForProductSelection(),
  ]);

  return (
    <DataTablePage
      header={
        <PageHeader
          className="mb-0"
          title="Products"
          description="Manage products and their bill-of-materials."
        >
          <div className="flex flex-wrap items-center gap-2">
            <UploadSkuFilesButton
              blobUploadMode={getSkuExcelBlobUploadMode()}
            />
            <ProductFormDialog
              action={createProduct}
              availableParts={availableParts}
              imageUploadMode={getCatalogImageBlobUploadMode()}
            />
          </div>
        </PageHeader>
      }
    >
      <ProductsDataTable
        result={result}
        listParams={listParams}
        availableParts={availableParts}
        blobUploadMode={getSkuExcelBlobUploadMode()}
        imageUploadMode={getCatalogImageBlobUploadMode()}
      />
    </DataTablePage>
  );
}
