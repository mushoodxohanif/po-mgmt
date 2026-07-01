"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  addProductBomLine,
  type PartOptionForProduct,
  removeProductBomLine,
  updateProductBomLine,
} from "@/lib/actions/products";

import {
  ProductBomDataTable,
  type ProductBomLine,
} from "./product-bom-data-table";

type ProductBomEditorProps = {
  productId: number;
  lines: ProductBomLine[];
  availableParts: PartOptionForProduct[];
};

function formatPartOptionLabel(part: PartOptionForProduct): string {
  if (part.vendorNames.length === 0) return part.name;
  return `${part.name} — ${part.vendorNames.join(", ")}`;
}

function EditBomLineDialog({
  line,
  productId,
  open,
  onOpenChange,
}: {
  line: ProductBomLine;
  productId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProductBomLine(formData);
      if (result.success) {
        toast.success("BOM line updated");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to update BOM line");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Edit BOM line</DrawerTitle>
          <DrawerDescription>
            Update quantity and optional fields for {line.part.name}.
          </DrawerDescription>
        </DrawerHeader>
        <form action={handleSubmit} className="flex flex-1 flex-col gap-4">
          <input type="hidden" name="id" value={line.id} />
          <input type="hidden" name="productId" value={productId} />
          <div className="grid gap-2">
            <Label htmlFor={`bom-item-${line.id}`}>Item no.</Label>
            <Input
              id={`bom-item-${line.id}`}
              name="itemNo"
              defaultValue={line.itemNo ?? ""}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`bom-qty-${line.id}`}>Quantity</Label>
            <Input
              id={`bom-qty-${line.id}`}
              name="quantity"
              type="number"
              min={1}
              step={1}
              defaultValue={line.quantity}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`bom-remarks-${line.id}`}>Remarks</Label>
            <Input
              id={`bom-remarks-${line.id}`}
              name="remarks"
              defaultValue={line.remarks ?? ""}
              placeholder="Optional"
            />
          </div>
          <DrawerFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function RemoveBomLineButton({
  line,
  productId,
}: {
  line: ProductBomLine;
  productId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    const formData = new FormData();
    formData.set("id", String(line.id));
    formData.set("productId", String(productId));

    startTransition(async () => {
      const result = await removeProductBomLine(formData);
      if (result.success) {
        toast.success("BOM line removed");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to remove BOM line");
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
          <AlertDialogTitle>Remove BOM line?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove &ldquo;{line.part.name}&rdquo; from this product&apos;s bill
            of materials.
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

function BomLineActions({
  line,
  productId,
}: {
  line: ProductBomLine;
  productId: number;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      <RemoveBomLineButton line={line} productId={productId} />
      <EditBomLineDialog
        line={line}
        productId={productId}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

export function ProductBomEditor({
  productId,
  lines,
  availableParts,
}: ProductBomEditorProps) {
  const router = useRouter();
  const [selectedPartId, setSelectedPartId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const vendorNamesByPartId = new Map(
    availableParts.map((part) => [part.id, part.vendorNames]),
  );

  function handleAdd(formData: FormData) {
    if (!selectedPartId) {
      toast.error("Select a part");
      return;
    }

    formData.set("productId", String(productId));
    formData.set("partId", selectedPartId);

    startTransition(async () => {
      const result = await addProductBomLine(formData);
      if (result.success) {
        toast.success("BOM line added");
        setSelectedPartId("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to add BOM line");
      }
    });
  }

  const actionsColumn: ColumnDef<ProductBomLine> = {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <BomLineActions line={row.original} productId={productId} />
    ),
  };

  return (
    <div className="space-y-6">
      <form action={handleAdd} className="grid gap-4 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Add BOM line</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="bom-part">Part</Label>
            <Select
              value={selectedPartId}
              onValueChange={setSelectedPartId}
              disabled={pending || availableParts.length === 0}
            >
              <SelectTrigger id="bom-part">
                <SelectValue
                  placeholder={
                    availableParts.length === 0
                      ? "No parts available"
                      : "Select a part"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableParts.map((part) => (
                  <SelectItem key={part.id} value={String(part.id)}>
                    {formatPartOptionLabel(part)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bom-item-no">Item no.</Label>
            <Input
              id="bom-item-no"
              name="itemNo"
              placeholder="Optional"
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bom-quantity">Quantity</Label>
            <Input
              id="bom-quantity"
              name="quantity"
              type="number"
              min={1}
              step={1}
              defaultValue={1}
              required
              disabled={pending}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="bom-remarks-add">Remarks</Label>
            <Input
              id="bom-remarks-add"
              name="remarks"
              placeholder="Optional"
              disabled={pending}
            />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={pending || !selectedPartId}>
            {pending ? "Adding…" : "Add line"}
          </Button>
        </div>
      </form>

      <ProductBomDataTable
        lines={lines}
        vendorNamesByPartId={vendorNamesByPartId}
        extraColumns={[actionsColumn]}
      />
    </div>
  );
}
