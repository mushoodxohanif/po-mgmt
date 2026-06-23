"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ListTreeIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BomImages } from "@/components/bom/bom-images";
import { ClientTableToolbar } from "@/components/data-table/client-table-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import { PartSpecsDisplay } from "@/components/parts/part-specs-display";
import {
  matchesSearch,
  matchesSpecsSearch,
} from "@/lib/data-table/client-filter";

export type ProductBomLine = {
  id: number;
  itemNo: string | null;
  quantity: number;
  remarks: string | null;
  imageSideUrl: string | null;
  imageFrontUrl: string | null;
  imageBottomUrl: string | null;
  part: {
    id: number;
    name: string;
    specs: Record<string, string>;
    description: string | null;
  };
};

type ProductBomDataTableProps = {
  lines: ProductBomLine[];
  vendorNamesByPartId?: Map<number, string[]>;
  extraColumns?: ColumnDef<ProductBomLine>[];
};

const FILTERED_EMPTY_STATE = {
  title: "No matching BOM lines",
  description: "Try adjusting your search or filters.",
  icon: ListTreeIcon,
};

export function ProductBomDataTable({
  lines,
  vendorNamesByPartId,
  extraColumns = [],
}: ProductBomDataTableProps) {
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");

  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      const vendorNames = vendorNamesByPartId?.get(line.part.id) ?? [];
      const vendorText = vendorNames.join(", ");

      const matchesQuery =
        matchesSearch(
          [line.itemNo, line.part.name, line.remarks, vendorText],
          search,
        ) || matchesSpecsSearch(line.part.specs, line.part.description, search);

      if (!matchesQuery) return false;

      if (vendorFilter === "assigned") {
        return vendorNames.length > 0;
      }

      if (vendorFilter === "unassigned") {
        return vendorNames.length === 0;
      }

      return true;
    });
  }, [lines, search, vendorFilter, vendorNamesByPartId]);

  const isFiltered = Boolean(search) || vendorFilter !== "all";

  const columns: ColumnDef<ProductBomLine>[] = [
    {
      accessorKey: "itemNo",
      header: "Item",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.itemNo ?? "—"}
        </span>
      ),
    },
    {
      id: "part",
      header: "Part",
      cell: ({ row }) => (
        <Link
          href={`/parts/${row.original.part.id}`}
          className="font-medium hover:underline"
        >
          {row.original.part.name}
        </Link>
      ),
    },
    ...(vendorNamesByPartId
      ? [
          {
            id: "vendors",
            header: "Vendor(s)",
            cell: ({ row }: { row: { original: ProductBomLine } }) => {
              const vendorNames =
                vendorNamesByPartId.get(row.original.part.id) ?? [];
              return (
                <span className="block max-w-xs text-muted-foreground">
                  {vendorNames.length > 0
                    ? vendorNames.join(", ")
                    : "No vendor assigned"}
                </span>
              );
            },
          } satisfies ColumnDef<ProductBomLine>,
        ]
      : []),
    {
      id: "specs",
      header: "Specifications",
      cell: ({ row }) => (
        <span className="block max-w-md truncate">
          <PartSpecsDisplay
            specs={row.original.part.specs}
            description={row.original.part.description}
            maxLength={120}
          />
        </span>
      ),
    },
    {
      id: "images",
      header: "Images",
      cell: ({ row }) => (
        <BomImages
          images={{
            imageSideUrl: row.original.imageSideUrl,
            imageFrontUrl: row.original.imageFrontUrl,
            imageBottomUrl: row.original.imageBottomUrl,
          }}
          partName={row.original.part.name}
        />
      ),
    },
    {
      accessorKey: "quantity",
      header: () => <span className="block text-right">Qty</span>,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">
          {row.original.quantity}
        </span>
      ),
    },
    {
      accessorKey: "remarks",
      header: "Remarks",
      cell: ({ row }) => (
        <span className="block max-w-xs truncate text-muted-foreground">
          {row.original.remarks ?? "—"}
        </span>
      ),
    },
    ...extraColumns,
  ];

  return (
    <div className="space-y-3">
      <ClientTableToolbar
        searchPlaceholder="Search BOM lines by part, item no., vendor, or specs…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={
          vendorNamesByPartId
            ? [
                {
                  key: "vendor",
                  label: "Vendor",
                  placeholder: "Vendor assignment",
                  value: vendorFilter,
                  onChange: setVendorFilter,
                  allLabel: "All vendor states",
                  options: [
                    { value: "assigned", label: "Has vendor" },
                    { value: "unassigned", label: "No vendor" },
                  ],
                },
              ]
            : []
        }
      />
      <DataTable
        columns={columns}
        data={filteredLines}
        showPagination={false}
        layout="auto"
        className="max-h-[28rem]"
        emptyState={
          isFiltered
            ? FILTERED_EMPTY_STATE
            : {
                title: "No BOM lines",
                description:
                  "Add BOM lines to define which parts make up this product.",
                icon: ListTreeIcon,
              }
        }
      />
    </div>
  );
}
