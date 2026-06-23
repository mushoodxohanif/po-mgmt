"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BoxIcon } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { UploadSkuFilesButton } from "@/components/products/sku-import-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createProduct,
  deleteProduct,
  type PartOptionForProduct,
  updateProduct,
} from "@/lib/actions/products";
import {
  hasActiveListFilters,
  type ProductsListParams,
} from "@/lib/data-table/list-params";
import type { ProductListRow } from "@/lib/data-table/list-queries";
import type { PaginatedResult } from "@/lib/data-table/pagination";
import type { SkuExcelBlobUploadMode } from "@/lib/storage/sku-excel-blob";

type ProductsDataTableProps = {
  result: PaginatedResult<ProductListRow>;
  listParams: ProductsListParams;
  availableParts: PartOptionForProduct[];
  blobUploadMode: SkuExcelBlobUploadMode;
};

const FILTERED_EMPTY_STATE = {
  title: "No matching products",
  description: "Try adjusting your search or filters.",
  icon: BoxIcon,
};

export function ProductsDataTable({
  result,
  listParams,
  availableParts,
  blobUploadMode,
}: ProductsDataTableProps) {
  const columns: ColumnDef<ProductListRow>[] = [
    {
      accessorKey: "displayName",
      header: "Display name",
      cell: ({ row }) => (
        <Link
          href={`/products/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.displayName}
        </Link>
      ),
    },
    {
      accessorKey: "modelCode",
      header: "Model code",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.original.modelCode}
        </span>
      ),
    },
    {
      accessorKey: "bomLineCount",
      header: "BOM lines",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.bomLineCount} parts</Badge>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/products/${row.original.id}`}>View BOM</Link>
          </Button>
          <ProductFormDialog
            product={row.original}
            action={updateProduct}
            availableParts={availableParts}
          />
          <DeleteConfirmButton
            title="Delete product?"
            description={`Remove "${row.original.displayName}", its BOM, and parts only used by this product.`}
            action={deleteProduct}
            id={row.original.id}
          />
        </div>
      ),
    },
  ];

  const isFiltered = hasActiveListFilters(listParams, ["q", "hasBom"]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DataTableToolbar
        searchPlaceholder="Search products by name or model code…"
        searchValue={listParams.q ?? ""}
        filters={[
          {
            key: "hasBom",
            label: "BOM",
            placeholder: "BOM status",
            value: listParams.hasBom,
            allLabel: "All BOM states",
            options: [
              { value: "yes", label: "Has BOM lines" },
              { value: "no", label: "No BOM lines" },
            ],
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={result.rows}
        page={result.page}
        pageSize={result.pageSize}
        totalCount={result.totalCount}
        pageCount={result.pageCount}
        emptyState={
          isFiltered
            ? FILTERED_EMPTY_STATE
            : {
                title: "No products yet",
                description:
                  "Upload an Excel BOM file or add a product manually to get started.",
                icon: BoxIcon,
                content: (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <UploadSkuFilesButton blobUploadMode={blobUploadMode} />
                    <ProductFormDialog
                      action={createProduct}
                      availableParts={availableParts}
                    />
                  </div>
                ),
              }
        }
      />
    </div>
  );
}
