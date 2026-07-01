"use client";

import {
  ArrowLeftIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  generateVendorPosFromBuildPlanAction,
  type ProductOptionForBuildPlan,
  previewBuildPlanAction,
} from "@/lib/actions/bom-po-generation";
import type {
  BuildPlanPreview,
  PartDemandLine,
} from "@/lib/services/bom-po-generation";
import { formatMoney } from "@/lib/services/money";

type PlanRow = {
  id: string;
  productId: string;
  buildQuantity: string;
};

type GenerateFromBomDialogProps = {
  products: ProductOptionForBuildPlan[];
};

function createEmptyRow(): PlanRow {
  return { id: crypto.randomUUID(), productId: "", buildQuantity: "1" };
}

type EffectiveStatus = "resolved" | "unassigned" | "ambiguous" | "unpriced";

type EffectivePart = PartDemandLine & {
  effectiveVendorId: number | null;
  effectiveUnitPrice: number | null;
  effectiveLineTotal: number | null;
  effectiveStatus: EffectiveStatus;
};

function computeEffectiveParts(
  parts: PartDemandLine[],
  overrides: Record<number, number>,
): EffectivePart[] {
  return parts.map((part) => {
    if (part.status !== "ambiguous") {
      return {
        ...part,
        effectiveVendorId: part.resolvedVendorId,
        effectiveUnitPrice: part.resolvedUnitPrice,
        effectiveLineTotal: part.lineTotal,
        effectiveStatus: part.status,
      };
    }

    const override = overrides[part.partId];
    const overrideOption = part.vendorOptions.find(
      (option) => option.id === override,
    );

    if (!overrideOption) {
      return {
        ...part,
        effectiveVendorId: null,
        effectiveUnitPrice: null,
        effectiveLineTotal: null,
        effectiveStatus: "ambiguous",
      };
    }

    const effectiveLineTotal =
      overrideOption.unitPrice !== null
        ? part.totalQuantity * overrideOption.unitPrice
        : null;

    return {
      ...part,
      effectiveVendorId: overrideOption.id,
      effectiveUnitPrice: overrideOption.unitPrice,
      effectiveLineTotal,
      effectiveStatus:
        overrideOption.unitPrice === null ? "unpriced" : "resolved",
    };
  });
}

function computeVendorSummary(effectiveParts: EffectivePart[]) {
  const map = new Map<
    number,
    { vendorId: number; vendorName: string; partCount: number; total: number }
  >();

  for (const part of effectiveParts) {
    if (
      part.effectiveStatus !== "resolved" ||
      part.effectiveVendorId === null
    ) {
      continue;
    }
    const vendorName =
      part.vendorOptions.find((option) => option.id === part.effectiveVendorId)
        ?.name ?? "Unknown vendor";
    const lineTotal = part.effectiveLineTotal ?? 0;
    const existing = map.get(part.effectiveVendorId);
    if (existing) {
      existing.partCount += 1;
      existing.total += lineTotal;
    } else {
      map.set(part.effectiveVendorId, {
        vendorId: part.effectiveVendorId,
        vendorName,
        partCount: 1,
        total: lineTotal,
      });
    }
  }

  return [...map.values()].sort((a, b) =>
    a.vendorName.localeCompare(b.vendorName),
  );
}

function sourcesSummary(part: PartDemandLine): string {
  return part.sources
    .map(
      (source) =>
        `${source.productDisplayName} (${source.bomQuantity} × ${source.buildQuantity})`,
    )
    .join(", ");
}

export function GenerateFromBomDialog({
  products,
}: GenerateFromBomDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"plan" | "review">("plan");
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<PlanRow[]>([createEmptyRow()]);
  const [preview, setPreview] = useState<BuildPlanPreview | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  const selectableProducts = products.filter((p) => p.bomLineCount > 0);

  function resetAll() {
    setStep("plan");
    setRows([createEmptyRow()]);
    setPreview(null);
    setOverrides({});
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetAll();
  }

  function addRow() {
    setRows((current) => [...current, createEmptyRow()]);
  }

  function removeRow(index: number) {
    setRows((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );
  }

  function updateRow(index: number, patch: Partial<PlanRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function buildEntries(): { productId: number; buildQuantity: number }[] {
    return rows.map((row) => ({
      productId: Number(row.productId),
      buildQuantity: Number(row.buildQuantity),
    }));
  }

  function handlePreview() {
    if (rows.some((row) => !row.productId)) {
      toast.error("Select a product for every row");
      return;
    }

    const productIds = rows.map((row) => row.productId);
    if (new Set(productIds).size !== productIds.length) {
      toast.error("Each product can only appear once — remove the duplicate");
      return;
    }

    const entries = buildEntries();
    if (
      entries.some(
        (entry) =>
          !Number.isInteger(entry.buildQuantity) || entry.buildQuantity <= 0,
      )
    ) {
      toast.error("Build quantities must be positive whole numbers");
      return;
    }

    startTransition(async () => {
      const result = await previewBuildPlanAction(entries);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPreview(result.preview);
      setOverrides({});
      setStep("review");
    });
  }

  function handleGenerate() {
    if (!preview) return;

    const entries = buildEntries();

    startTransition(async () => {
      const result = await generateVendorPosFromBuildPlanAction(
        entries,
        overrides,
      );

      if (!result.success) {
        toast.error(result.error ?? "Failed to generate purchase orders", {
          duration: 8000,
        });
        return;
      }

      const vendorNames = (result.createdPos ?? [])
        .map((po) => po.vendorName)
        .join(", ");
      toast.success(
        `Generated ${result.createdPos?.length ?? 0} purchase order(s) for ${vendorNames}`,
      );
      setOpen(false);
      resetAll();
      router.push("/vendor-pos");
      router.refresh();
    });
  }

  const usedProductIds = new Set(
    rows.map((row) => row.productId).filter(Boolean),
  );

  const effectiveParts = preview
    ? computeEffectiveParts(preview.parts, overrides)
    : [];
  const unresolvedParts = effectiveParts.filter(
    (part) => part.effectiveStatus !== "resolved",
  );
  const vendorSummary = computeVendorSummary(effectiveParts);
  const grandTotal = vendorSummary.reduce(
    (sum, vendor) => sum + vendor.total,
    0,
  );
  const canGenerate = preview !== null && unresolvedParts.length === 0;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="outline" disabled={selectableProducts.length === 0}>
          Generate from BOM
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-2xl">
        <DrawerHeader>
          <DrawerTitle>Generate vendor POs from BOM</DrawerTitle>
          <DrawerDescription>
            Pick products and build quantities. Part quantities are summed
            automatically from each product&apos;s BOM and routed to the correct
            vendor — no manual totaling.
          </DrawerDescription>
        </DrawerHeader>

        {step === "plan" ? (
          <div className="flex flex-1 flex-col gap-4">
            {selectableProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products have BOM lines yet. Add a BOM on a product detail
                page before generating POs this way.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label>Build plan</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    disabled={pending}
                  >
                    <PlusIcon className="size-4" />
                    Add product
                  </Button>
                </div>
                <div className="space-y-2">
                  {rows.map((row, index) => {
                    const selectableForRow = products.filter(
                      (product) =>
                        product.id === Number(row.productId) ||
                        !usedProductIds.has(String(product.id)),
                    );

                    return (
                      <div key={row.id} className="flex items-end gap-2">
                        <div className="grid min-w-0 flex-1 gap-1.5">
                          <Label
                            htmlFor={`build-plan-product-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Product
                          </Label>
                          <Select
                            value={row.productId}
                            onValueChange={(value) =>
                              updateRow(index, { productId: value })
                            }
                            disabled={pending}
                          >
                            <SelectTrigger
                              id={`build-plan-product-${index}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectableForRow.map((product) => (
                                <SelectItem
                                  key={product.id}
                                  value={String(product.id)}
                                  disabled={product.bomLineCount === 0}
                                >
                                  {product.displayName} ({product.modelCode})
                                  {product.bomLineCount === 0
                                    ? " — no BOM"
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid w-28 gap-1.5">
                          <Label
                            htmlFor={`build-plan-qty-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Build qty
                          </Label>
                          <Input
                            id={`build-plan-qty-${index}`}
                            type="number"
                            min={1}
                            step={1}
                            value={row.buildQuantity}
                            onChange={(event) =>
                              updateRow(index, {
                                buildQuantity: event.target.value,
                              })
                            }
                            disabled={pending}
                            className="tabular-nums"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          onClick={() => removeRow(index)}
                          disabled={pending || rows.length === 1}
                          aria-label="Remove row"
                        >
                          <MinusIcon className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <DrawerFooter>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={pending || selectableProducts.length === 0}
              >
                {pending ? "Calculating…" : "Preview part quantities"}
              </Button>
            </DrawerFooter>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            {unresolvedParts.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  Resolve {unresolvedParts.length} part
                  {unresolvedParts.length === 1 ? "" : "s"} below before
                  generating purchase orders.
                </span>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                Ready to generate {vendorSummary.length} purchase order
                {vendorSummary.length === 1 ? "" : "s"} totaling{" "}
                {formatMoney(grandTotal)}:{" "}
                {vendorSummary
                  .map(
                    (vendor) =>
                      `${vendor.vendorName} (${vendor.partCount} part${
                        vendor.partCount === 1 ? "" : "s"
                      }, ${formatMoney(vendor.total)})`,
                  )
                  .join(", ")}
              </div>
            )}

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead className="text-right">Total qty</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveParts.map((part) => (
                    <TableRow key={part.partId}>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{part.partName}</div>
                        <div className="text-xs text-muted-foreground">
                          {sourcesSummary(part)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {part.totalQuantity}
                      </TableCell>
                      <TableCell>
                        {part.effectiveStatus === "unassigned" ? (
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="destructive">
                              No vendor assigned
                            </Badge>
                            <Link
                              href={`/parts/${part.partId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                              Assign a vendor
                            </Link>
                          </div>
                        ) : part.status === "ambiguous" ? (
                          <div className="flex flex-col gap-1">
                            <Select
                              value={
                                overrides[part.partId]
                                  ? String(overrides[part.partId])
                                  : ""
                              }
                              onValueChange={(value) =>
                                setOverrides((current) => ({
                                  ...current,
                                  [part.partId]: Number(value),
                                }))
                              }
                              disabled={pending}
                            >
                              <SelectTrigger className="w-full min-w-40">
                                <SelectValue placeholder="Choose vendor" />
                              </SelectTrigger>
                              <SelectContent>
                                {part.vendorOptions.map((vendor) => (
                                  <SelectItem
                                    key={vendor.id}
                                    value={String(vendor.id)}
                                  >
                                    {vendor.name}
                                    {vendor.unitPrice === null
                                      ? " — no price set"
                                      : ` — ${formatMoney(vendor.unitPrice)}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {part.effectiveStatus === "ambiguous" ? (
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                Multiple vendors — choose one
                              </span>
                            ) : null}
                            {part.effectiveStatus === "unpriced" ? (
                              <Link
                                href={`/vendors/${part.effectiveVendorId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-destructive underline underline-offset-2"
                              >
                                No price set — set it on the vendor page
                              </Link>
                            ) : null}
                          </div>
                        ) : part.effectiveStatus === "unpriced" ? (
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="outline">
                              {
                                part.vendorOptions.find(
                                  (v) => v.id === part.effectiveVendorId,
                                )?.name
                              }
                            </Badge>
                            <Link
                              href={`/vendors/${part.effectiveVendorId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-destructive underline underline-offset-2"
                            >
                              No price set — set it on the vendor page
                            </Link>
                          </div>
                        ) : (
                          <Badge variant="outline">
                            {
                              part.vendorOptions.find(
                                (v) => v.id === part.effectiveVendorId,
                              )?.name
                            }
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {part.effectiveUnitPrice !== null
                          ? formatMoney(part.effectiveUnitPrice)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {part.effectiveLineTotal !== null
                          ? formatMoney(part.effectiveLineTotal)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DrawerFooter className="flex-row justify-between sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("plan")}
                disabled={pending}
              >
                <ArrowLeftIcon className="size-4" />
                Back
              </Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || pending}
              >
                {pending ? "Generating…" : "Generate POs"}
              </Button>
            </DrawerFooter>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
