"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Link2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ClientTableToolbar } from "@/components/data-table/client-table-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import { PartSpecsDisplay } from "@/components/parts/part-specs-display";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignPartToVendor,
  removePartFromVendor,
} from "@/lib/actions/vendors";
import {
  matchesSearch,
  matchesSpecsSearch,
} from "@/lib/data-table/client-filter";
import type { Part } from "@/lib/db/schema";

type AssignedPart = {
  partId: number;
  part: {
    id: number;
    name: string;
    specs: Record<string, string>;
    description: string | null;
  };
};

type VendorPartAssignmentProps = {
  vendorId: number;
  assignedParts: AssignedPart[];
  availableParts: Part[];
};

function RemoveVendorPartButton({
  vendorId,
  partId,
  partName,
}: {
  vendorId: number;
  partId: number;
  partName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    const formData = new FormData();
    formData.set("vendorId", String(vendorId));
    formData.set("partId", String(partId));

    startTransition(async () => {
      const result = await removePartFromVendor(formData);
      if (result.success) {
        toast.success("Part removed");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to remove part");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={pending}>
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove part from vendor?</AlertDialogTitle>
          <AlertDialogDescription>
            Stop sourcing &ldquo;{partName}&rdquo; from this vendor.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleRemove}>
            {pending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function VendorPartAssignment({
  vendorId,
  assignedParts,
  availableParts,
}: VendorPartAssignmentProps) {
  const router = useRouter();
  const [selectedPartId, setSelectedPartId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(assignedParts.map((item) => item.partId));
  const unassignedParts = availableParts.filter(
    (part) => !assignedIds.has(part.id),
  );

  const filteredAssignedParts = useMemo(() => {
    return assignedParts.filter(
      (item) =>
        matchesSearch([item.part.name], search) ||
        matchesSpecsSearch(item.part.specs, item.part.description, search),
    );
  }, [assignedParts, search]);

  function handleAssign() {
    if (!selectedPartId) return;

    const formData = new FormData();
    formData.set("vendorId", String(vendorId));
    formData.set("partId", selectedPartId);

    startTransition(async () => {
      const result = await assignPartToVendor(formData);
      if (result.success) {
        toast.success("Part assigned");
        setSelectedPartId("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to assign part");
      }
    });
  }

  const columns: ColumnDef<AssignedPart>[] = [
    {
      id: "part",
      header: "Part",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.part.name}</span>
      ),
    },
    {
      id: "specs",
      header: "Specifications",
      cell: ({ row }) => (
        <span className="block max-w-xs truncate">
          <PartSpecsDisplay
            specs={row.original.part.specs}
            description={row.original.part.description}
            maxLength={100}
          />
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RemoveVendorPartButton
          vendorId={vendorId}
          partId={row.original.part.id}
          partName={row.original.part.name}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="assign-part">Assign part</Label>
          <Select
            value={selectedPartId}
            onValueChange={setSelectedPartId}
            disabled={pending || unassignedParts.length === 0}
          >
            <SelectTrigger id="assign-part" className="w-full sm:max-w-md">
              <SelectValue
                placeholder={
                  unassignedParts.length === 0
                    ? "All parts assigned"
                    : "Select a part"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {unassignedParts.map((part) => (
                <SelectItem key={part.id} value={String(part.id)}>
                  {part.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={handleAssign}
          disabled={pending || !selectedPartId}
        >
          {pending ? "Assigning…" : "Assign part"}
        </Button>
      </div>

      <ClientTableToolbar
        searchPlaceholder="Search assigned parts by name or specifications…"
        searchValue={search}
        onSearchChange={setSearch}
      />

      <DataTable
        columns={columns}
        data={filteredAssignedParts}
        showPagination={false}
        layout="auto"
        className="max-h-[24rem]"
        emptyState={
          search
            ? {
                title: "No matching parts",
                description: "Try adjusting your search.",
                icon: Link2Icon,
              }
            : {
                title: "No parts assigned",
                description:
                  "Assign parts to this vendor before generating purchase orders.",
                icon: Link2Icon,
              }
        }
      />
    </div>
  );
}
