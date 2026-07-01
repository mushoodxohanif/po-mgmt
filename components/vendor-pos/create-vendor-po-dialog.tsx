"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { partDisplayLabel } from "@/components/parts/part-specs-display";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
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
  createVendorPoAction,
  getVendorPoParts,
} from "@/lib/actions/vendor-pos";
import type { Vendor } from "@/lib/db/types";
import { formatMoney } from "@/lib/services/money";

type VendorOption = Pick<Vendor, "id" | "name">;

type PartOption = {
  id: number;
  name: string;
  specs?: Record<string, string> | null;
  description: string | null;
  unitPrice: number | null;
};

type LineDraft = {
  id: string;
  partId: string;
  quantity: string;
};

type CreateVendorPoDialogProps = {
  vendors: VendorOption[];
};

function createEmptyLine(): LineDraft {
  return { id: crypto.randomUUID(), partId: "", quantity: "1" };
}

function partLabel(part: PartOption) {
  return partDisplayLabel(part);
}

export function CreateVendorPoDialog({ vendors }: CreateVendorPoDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([createEmptyLine()]);
  const [availableParts, setAvailableParts] = useState<PartOption[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  useEffect(() => {
    if (!vendorId) {
      setAvailableParts([]);
      return;
    }

    let cancelled = false;
    setLoadingParts(true);

    getVendorPoParts(Number(vendorId))
      .then((parts) => {
        if (!cancelled) setAvailableParts(parts);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableParts([]);
          toast.error("Failed to load parts for vendor");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingParts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  function resetForm() {
    setVendorId("");
    setLines([createEmptyLine()]);
    setAvailableParts([]);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function addLine() {
    setLines((current) => [...current, createEmptyLine()]);
  }

  function removeLine(index: number) {
    setLines((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!vendorId) {
      toast.error("Select a vendor");
      return;
    }

    const payload = lines.map((line) => ({
      partId: Number(line.partId),
      quantity: Number(line.quantity),
    }));

    if (
      payload.some((line) => !Number.isFinite(line.partId) || line.partId <= 0)
    ) {
      toast.error("Select a part for every line");
      return;
    }

    if (
      payload.some(
        (line) => !Number.isInteger(line.quantity) || line.quantity <= 0,
      )
    ) {
      toast.error("Quantities must be positive whole numbers");
      return;
    }

    const unpriced = payload
      .map((line) => availableParts.find((part) => part.id === line.partId))
      .filter((part): part is PartOption => Boolean(part))
      .filter((part) => part.unitPrice === null);

    if (unpriced.length > 0) {
      toast.error(
        `Set a unit price for these part(s) on the vendor page first: ${unpriced
          .map((part) => part.name)
          .join(", ")}`,
      );
      return;
    }

    const formData = new FormData();
    formData.set("vendorId", vendorId);
    formData.set("lines", JSON.stringify(payload));

    startTransition(async () => {
      const result = await createVendorPoAction(formData);
      if (result.success) {
        toast.success("Vendor PO created");
        setOpen(false);
        if (result.vendorPoId) {
          router.push(`/vendor-pos/${result.vendorPoId}`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.error ?? "Failed to create vendor PO");
      }
    });
  }

  const usedPartIds = new Set(lines.map((line) => line.partId).filter(Boolean));
  const canSubmit =
    vendors.length > 0 &&
    vendorId &&
    !loadingParts &&
    availableParts.length > 0 &&
    !pending;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button disabled={vendors.length === 0}>Create PO</Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>Create vendor PO</DrawerTitle>
          <DrawerDescription>
            Order parts from a vendor. Saving creates version 1 and a PDF.
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="vendor-po-vendor">Vendor</Label>
            {vendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a vendor and assign parts before creating a PO.
              </p>
            ) : (
              <Select
                value={vendorId}
                onValueChange={(value) => {
                  setVendorId(value);
                  setLines([createEmptyLine()]);
                }}
                disabled={pending}
              >
                <SelectTrigger id="vendor-po-vendor" className="w-full">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={String(vendor.id)}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {vendorId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                  disabled={
                    pending || loadingParts || availableParts.length === 0
                  }
                >
                  <PlusIcon className="size-4" />
                  Add line
                </Button>
              </div>
              {loadingParts ? (
                <p className="text-sm text-muted-foreground">Loading parts…</p>
              ) : availableParts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No parts assigned to this vendor. Assign parts on the vendor
                  detail page first.
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, index) => {
                    const selectableParts = availableParts.filter(
                      (part) =>
                        part.id === Number(line.partId) ||
                        !usedPartIds.has(String(part.id)),
                    );

                    return (
                      <div key={line.id} className="flex items-end gap-2">
                        <div className="grid min-w-0 flex-1 gap-1.5">
                          <Label
                            htmlFor={`vendor-po-part-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Part
                          </Label>
                          <Select
                            value={line.partId}
                            onValueChange={(value) =>
                              updateLine(index, { partId: value })
                            }
                            disabled={pending}
                          >
                            <SelectTrigger
                              id={`vendor-po-part-${index}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select part" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectableParts.map((part) => (
                                <SelectItem
                                  key={part.id}
                                  value={String(part.id)}
                                  disabled={part.unitPrice === null}
                                >
                                  {partLabel(part)}
                                  {part.unitPrice === null
                                    ? " — no price set"
                                    : ` — ${formatMoney(part.unitPrice)}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid w-20 gap-1.5">
                          <Label
                            htmlFor={`vendor-po-qty-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Qty
                          </Label>
                          <Input
                            id={`vendor-po-qty-${index}`}
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(index, {
                                quantity: event.target.value,
                              })
                            }
                            disabled={pending}
                            className="tabular-nums"
                          />
                        </div>
                        <div className="grid w-24 gap-1.5">
                          <Label className="text-xs text-muted-foreground">
                            Line total
                          </Label>
                          <p className="h-9 content-center text-sm tabular-nums text-muted-foreground">
                            {(() => {
                              const part = availableParts.find(
                                (p) => p.id === Number(line.partId),
                              );
                              const qty = Number(line.quantity);
                              if (!part || part.unitPrice === null) return "—";
                              return formatMoney(
                                Number.isFinite(qty) ? qty * part.unitPrice : 0,
                              );
                            })()}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          onClick={() => removeLine(index)}
                          disabled={pending || lines.length === 1}
                          aria-label="Remove line"
                        >
                          <MinusIcon className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex justify-end border-t pt-2 text-sm font-medium">
                    Total:{" "}
                    {formatMoney(
                      lines.reduce((sum, line) => {
                        const part = availableParts.find(
                          (p) => p.id === Number(line.partId),
                        );
                        const qty = Number(line.quantity);
                        if (!part || part.unitPrice === null) return sum;
                        return (
                          sum +
                          (Number.isFinite(qty) ? qty * part.unitPrice : 0)
                        );
                      }, 0),
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DrawerFooter>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Creating…" : "Create PO"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
