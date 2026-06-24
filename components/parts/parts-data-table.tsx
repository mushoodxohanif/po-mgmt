"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { PuzzleIcon } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { PartFormDialog } from "@/components/parts/part-form-dialog";
import { PartSpecsDisplay } from "@/components/parts/part-specs-display";
import { Badge } from "@/components/ui/badge";
import type { VendorOptionForPart } from "@/lib/actions/parts";
import { createPart, deletePart, updatePart } from "@/lib/actions/parts";
import {
  hasActiveListFilters,
  type PartsListParams,
} from "@/lib/data-table/list-params";
import type { PartListRow } from "@/lib/data-table/list-queries";
import type { PaginatedResult } from "@/lib/data-table/pagination";
import { PART_CATEGORIES } from "@/lib/services/part-specs";
import type { CatalogImageBlobUploadMode } from "@/lib/storage/catalog-image-blob";

type PartsDataTableProps = {
  result: PaginatedResult<PartListRow>;
  listParams: PartsListParams;
  availableVendors: VendorOptionForPart[];
  partVendorIds: Record<number, number[]>;
  imageUploadMode: CatalogImageBlobUploadMode;
};

const FILTERED_EMPTY_STATE = {
  title: "No matching parts",
  description: "Try adjusting your search or filters.",
  icon: PuzzleIcon,
};

export function PartsDataTable({
  result,
  listParams,
  availableVendors,
  partVendorIds,
  imageUploadMode,
}: PartsDataTableProps) {
  const columns: ColumnDef<PartListRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          href={`/parts/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "specs",
      header: "Specifications",
      cell: ({ row }) => (
        <span className="block max-w-md truncate">
          <PartSpecsDisplay
            specs={row.original.specs}
            description={row.original.description}
            maxLength={120}
          />
        </span>
      ),
    },
    {
      accessorKey: "vendorCount",
      header: "Vendors",
      cell: ({ row }) => (
        <Badge variant={row.original.vendorCount > 0 ? "default" : "secondary"}>
          {row.original.vendorCount}
        </Badge>
      ),
    },
    {
      accessorKey: "productCount",
      header: "Products",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.productCount}</Badge>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <PartFormDialog
            part={row.original}
            action={updatePart}
            availableVendors={availableVendors}
            assignedVendorIds={partVendorIds[row.original.id] ?? []}
            imageUploadMode={imageUploadMode}
          />
          <DeleteConfirmButton
            title="Delete part?"
            description={`Remove "${row.original.name}" from the catalog.`}
            action={deletePart}
            id={row.original.id}
          />
        </div>
      ),
    },
  ];

  const isFiltered = hasActiveListFilters(listParams, [
    "q",
    "category",
    "hasVendors",
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DataTableToolbar
        searchPlaceholder="Search parts by name, category, or description…"
        searchValue={listParams.q ?? ""}
        filters={[
          {
            key: "category",
            label: "Category",
            placeholder: "Category",
            value: listParams.category,
            options: PART_CATEGORIES.map((category) => ({
              value: category.value,
              label: category.label,
            })),
          },
          {
            key: "hasVendors",
            label: "Vendors",
            placeholder: "Vendor assignment",
            value: listParams.hasVendors,
            allLabel: "All vendor states",
            options: [
              { value: "yes", label: "Has vendors" },
              { value: "no", label: "No vendors" },
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
                title: "No parts yet",
                description:
                  "Upload Excel BOM files or add parts manually to build your catalog.",
                icon: PuzzleIcon,
                content: (
                  <PartFormDialog
                    action={createPart}
                    availableVendors={availableVendors}
                    imageUploadMode={imageUploadMode}
                  />
                ),
              }
        }
      />
    </div>
  );
}
