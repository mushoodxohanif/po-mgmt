"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PartSpecs } from "@/lib/db/types";
import {
  CATEGORY_SPEC_SUGGESTIONS,
  formatSpecLabel,
  inferPartCategory,
  normalizeSpecKey,
  PART_CATEGORIES,
  type PartCategory,
  rowsToSpecs,
  specsToRows,
} from "@/lib/services/part-specs";

type SpecRow = { id: string; key: string; value: string };

type PartSpecsEditorProps = {
  name: string;
  category: PartCategory | null;
  specs: PartSpecs;
  onCategoryChange: (category: PartCategory) => void;
  onSpecsChange: (specs: PartSpecs) => void;
};

function createRow(key = "", value = ""): SpecRow {
  return { id: crypto.randomUUID(), key, value };
}

function rowsFromSpecs(specs: PartSpecs): SpecRow[] {
  const entries = specsToRows(specs);
  if (entries.length === 0) return [createRow()];
  return entries.map((entry) => createRow(entry.key, entry.value));
}

export function PartSpecsEditor({
  name,
  category,
  specs,
  onCategoryChange,
  onSpecsChange,
}: PartSpecsEditorProps) {
  const [rows, setRows] = useState<SpecRow[]>(() => rowsFromSpecs(specs));

  const suggestions = useMemo(() => {
    const resolvedCategory =
      category ?? (name.trim() ? inferPartCategory(name) : "generic");
    return CATEGORY_SPEC_SUGGESTIONS[resolvedCategory];
  }, [category, name]);

  function syncRows(nextRows: SpecRow[]) {
    setRows(nextRows);
    onSpecsChange(rowsToSpecs(nextRows));
  }

  function updateRow(
    id: string,
    patch: Partial<Pick<SpecRow, "key" | "value">>,
  ) {
    syncRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow(key = "", value = "") {
    syncRows([...rows, createRow(key, value)]);
  }

  function removeRow(id: string) {
    const nextRows = rows.filter((row) => row.id !== id);
    syncRows(nextRows.length > 0 ? nextRows : [createRow()]);
  }

  function addSuggested(key: string) {
    const normalized = normalizeSpecKey(key);
    if (rows.some((row) => normalizeSpecKey(row.key) === normalized)) return;
    addRow(normalized, "");
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="part-category">Category</Label>
        <Select
          value={category ?? "generic"}
          onValueChange={(value) => onCategoryChange(value as PartCategory)}
        >
          <SelectTrigger id="part-category" className="w-full">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {PART_CATEGORIES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Category suggests common specification fields. You can add any custom
          field below.
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Specifications</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addRow()}
          >
            <PlusIcon className="size-4" />
            Add field
          </Button>
        </div>

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((key) => (
              <Button
                key={key}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addSuggested(key)}
              >
                + {formatSpecLabel(key)}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id} className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <Input
                  aria-label={`Specification ${index + 1} name`}
                  placeholder="Field name"
                  value={row.key}
                  onChange={(event) =>
                    updateRow(row.id, { key: event.target.value })
                  }
                />
                <Input
                  aria-label={`Specification ${index + 1} value`}
                  placeholder="Value"
                  value={row.value}
                  onChange={(event) =>
                    updateRow(row.id, { value: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove specification ${index + 1}`}
                onClick={() => removeRow(row.id)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PartSpecsEditorHiddenFields({
  category,
  specs,
}: {
  category: PartCategory | null;
  specs: PartSpecs;
}) {
  return (
    <>
      <input type="hidden" name="category" value={category ?? "generic"} />
      <input type="hidden" name="specs" value={JSON.stringify(specs)} />
    </>
  );
}
