"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import {
  hasActiveListFilters,
  type VendorPosListParams,
} from "@/lib/data-table/list-params";
import type { VendorPoListRow } from "@/lib/data-table/list-queries";
import type { PaginatedResult } from "@/lib/data-table/pagination";
import { sumLineTotals, type Vendor } from "@/lib/db/types";
import { formatMoney } from "@/lib/services/money";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type VendorPosDataTableProps = {
  result: PaginatedResult<VendorPoListRow>;
  listParams: VendorPosListParams;
  vendors: Vendor[];
};

const FILTERED_EMPTY_STATE = {
  title: "No matching vendor POs",
  description: "Try adjusting your search or filters.",
  icon: FileTextIcon,
};

export function VendorPosDataTable({
  result,
  listParams,
  vendors,
}: VendorPosDataTableProps) {
  const columns: ColumnDef<VendorPoListRow>[] = [
    {
      accessorKey: "id",
      header: "PO",
      cell: ({ row }) => (
        <Link
          href={`/vendor-pos/${row.original.id}`}
          className="font-medium hover:underline"
        >
          PO #{row.original.id}
        </Link>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => row.original.vendor.name,
    },
    {
      id: "version",
      header: "Version",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          v{row.original.versions[0]?.versionNumber ?? 1}
        </span>
      ),
    },
    {
      id: "lineCount",
      header: "Lines",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.versions[0]?.lines.length ?? 0}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatMoney(sumLineTotals(row.original.versions[0]?.lines ?? []))}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/vendor-pos/${row.original.id}`}>View</Link>
        </Button>
      ),
    },
  ];

  const isFiltered = hasActiveListFilters(listParams, ["q", "vendorId"]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DataTableToolbar
        searchPlaceholder="Search by PO number or vendor name…"
        searchValue={listParams.q ?? ""}
        filters={[
          {
            key: "vendorId",
            label: "Vendor",
            placeholder: "Vendor",
            value: listParams.vendorId
              ? String(listParams.vendorId)
              : undefined,
            options: vendors.map((vendor) => ({
              value: String(vendor.id),
              label: vendor.name,
            })),
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
                title: "No vendor POs",
                description:
                  "Create a vendor PO to order parts from a supplier.",
                icon: FileTextIcon,
              }
        }
      />
    </div>
  );
}
