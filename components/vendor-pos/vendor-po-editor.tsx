"use client";

import { FileDownIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { partDisplayLabel } from "@/components/parts/part-specs-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveVendorPoVersionAction } from "@/lib/actions/vendor-pos";
import { formatMoney } from "@/lib/services/money";

type PartOption = {
  id: number;
  name: string;
  specs?: Record<string, string> | null;
  description: string | null;
  unitPrice: number | null;
};

type EditorLine = {
  id: string;
  partId: string;
  quantity: string;
};

type VendorPoEditorProps = {
  vendorPoId: number;
  initialLines: Array<{
    partId: number;
    quantity: number;
  }>;
  availableParts: PartOption[];
};

function linesFromInitial(
  initialLines: VendorPoEditorProps["initialLines"],
): EditorLine[] {
  return initialLines.map((line) => ({
    id: crypto.randomUUID(),
    partId: String(line.partId),
    quantity: String(line.quantity),
  }));
}

function partLabel(part: PartOption) {
  return partDisplayLabel(part);
}

export function VendorPoEditor({
  vendorPoId,
  initialLines,
  availableParts,
}: VendorPoEditorProps) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(
    linesFromInitial(initialLines),
  );
  const [pending, startTransition] = useTransition();

  const usedPartIds = new Set(lines.map((line) => line.partId).filter(Boolean));

  function addLine() {
    setLines((current) => [
      ...current,
      { id: crypto.randomUUID(), partId: "", quantity: "1" },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  function updateLine(index: number, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function handleSave() {
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
    formData.set("vendorPoId", String(vendorPoId));
    formData.set("lines", JSON.stringify(payload));

    startTransition(async () => {
      const result = await saveVendorPoVersionAction(formData);
      if (result.success) {
        if (result.unchanged) {
          toast.message("No changes to save");
        } else {
          toast.success(
            `Saved as version ${result.versionNumber ?? ""}`.trim(),
          );
          router.refresh();
        }
      } else {
        toast.error(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead className="w-[100px]">Quantity</TableHead>
              <TableHead className="w-[110px] text-right">Line total</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No lines. Add a part to continue.
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line, index) => {
                const selectableParts = availableParts.filter(
                  (part) =>
                    part.id === Number(line.partId) ||
                    !usedPartIds.has(String(part.id)),
                );
                const selectedPart = availableParts.find(
                  (part) => part.id === Number(line.partId),
                );
                const qty = Number(line.quantity);
                const lineTotal =
                  selectedPart && selectedPart.unitPrice !== null
                    ? formatMoney(
                        Number.isFinite(qty) ? qty * selectedPart.unitPrice : 0,
                      )
                    : "—";

                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Select
                        value={line.partId}
                        onValueChange={(value) =>
                          updateLine(index, { partId: value })
                        }
                        disabled={pending}
                      >
                        <SelectTrigger className="w-full">
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
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(index, { quantity: event.target.value })
                        }
                        disabled={pending}
                        className="tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {lineTotal}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeLine(index)}
                        disabled={pending || lines.length === 1}
                        aria-label="Remove line"
                      >
                        <MinusIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {lines.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatMoney(
                    lines.reduce((sum, line) => {
                      const part = availableParts.find(
                        (p) => p.id === Number(line.partId),
                      );
                      const qty = Number(line.quantity);
                      if (!part || part.unitPrice === null) return sum;
                      return (
                        sum + (Number.isFinite(qty) ? qty * part.unitPrice : 0)
                      );
                    }, 0),
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={addLine}
          disabled={pending || availableParts.length === 0}
        >
          <PlusIcon data-icon="inline-start" />
          Add line
        </Button>
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save new version"}
        </Button>
        {availableParts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Assign parts to this vendor before editing lines.
          </p>
        ) : null}
      </div>
    </div>
  );
}

type VersionHistoryProps = {
  versions: Array<{
    id: number;
    versionNumber: number;
    pdfUrl: string | null;
    createdAt: Date;
    lines: unknown[];
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function VendorPoVersionHistory({ versions }: VersionHistoryProps) {
  if (versions.length <= 1) return null;

  return (
    <section className="mt-10 space-y-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Version history</h2>
        <p className="text-sm text-muted-foreground">
          Each saved edit creates a new immutable version with its own PDF.
        </p>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[120px]">PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.id}>
                <TableCell className="tabular-nums">
                  v{version.versionNumber}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {version.lines.length} part
                  {version.lines.length === 1 ? "" : "s"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(version.createdAt)}
                </TableCell>
                <TableCell>
                  {version.pdfUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={version.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileDownIcon data-icon="inline-start" />
                        Download
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
