"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BoxIcon } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/data-table/data-table";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { UploadSkuFilesButton } from "@/components/products/sku-import-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/lib/actions/products";
import { uploadSkuFilesAction } from "@/lib/actions/sku-import";
import type { ProductListRow } from "@/lib/data-table/list-queries";
import type { PaginatedResult } from "@/lib/data-table/pagination";

type ProductsDataTableProps = {
  result: PaginatedResult<ProductListRow>;
};

export function ProductsDataTable({ result }: ProductsDataTableProps) {
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
          <ProductFormDialog product={row.original} action={updateProduct} />
          <DeleteConfirmButton
            title="Delete product?"
            description={`Remove "${row.original.displayName}" and its BOM.`}
            action={deleteProduct}
            id={row.original.id}
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={result.rows}
      page={result.page}
      pageSize={result.pageSize}
      totalCount={result.totalCount}
      pageCount={result.pageCount}
      emptyState={{
        title: "No products yet",
        description:
          "Upload Excel BOM files or add a product manually to get started.",
        icon: BoxIcon,
        content: (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <UploadSkuFilesButton action={uploadSkuFilesAction} />
            <ProductFormDialog action={createProduct} />
          </div>
        ),
      }}
    />
  );
}
