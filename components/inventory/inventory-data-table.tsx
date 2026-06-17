"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { WarehouseIcon } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table/data-table";
import { AdjustInventoryDialog } from "@/components/inventory/adjust-inventory-dialog";
import { PartSpecsDisplay } from "@/components/parts/part-specs-display";
import { Badge } from "@/components/ui/badge";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants/inventory";
import type { InventoryListRow } from "@/lib/data-table/list-queries";
import type { PaginatedResult } from "@/lib/data-table/pagination";

type InventoryDataTableProps = {
  result: PaginatedResult<InventoryListRow>;
};

export function InventoryDataTable({ result }: InventoryDataTableProps) {
  const columns: ColumnDef<InventoryListRow>[] = [
    {
      accessorKey: "partName",
      header: "Part",
      cell: ({ row }) => (
        <Link
          href={`/parts/${row.original.partId}`}
          className="font-medium hover:underline"
        >
          {row.original.partName}
        </Link>
      ),
    },
    {
      id: "specs",
      header: "Specifications",
      cell: ({ row }) => (
        <span className="block max-w-xs truncate">
          <PartSpecsDisplay
            specs={row.original.specs}
            description={row.original.description}
            maxLength={100}
          />
        </span>
      ),
    },
    {
      accessorKey: "quantityOnHand",
      header: () => <span className="block text-right">On hand</span>,
      cell: ({ row }) => {
        const qty = row.original.quantityOnHand ?? 0;
        return <span className="block text-right tabular-nums">{qty}</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const qty = row.original.quantityOnHand ?? 0;
        const isLow = qty < LOW_STOCK_THRESHOLD;

        return isLow ? (
          <Badge variant="destructive">Low stock</Badge>
        ) : (
          <Badge variant="secondary">OK</Badge>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const qty = row.original.quantityOnHand ?? 0;

        return (
          <AdjustInventoryDialog
            partId={row.original.partId}
            partName={row.original.partName}
            currentQuantity={qty}
          />
        );
      },
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
        title: "No inventory records",
        description:
          "Upload Excel files or add parts first to track stock levels.",
        icon: WarehouseIcon,
      }}
    />
  );
}
