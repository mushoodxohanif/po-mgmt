"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PartOptionForProduct } from "@/lib/actions/products";

type PartMultiSelectProps = {
  parts: PartOptionForProduct[];
  disabled?: boolean;
  label?: string;
  description?: string;
  emptyMessage?: string;
};

export function PartMultiSelect({
  parts,
  disabled,
  label = "Parts in this product",
  description = "Select the parts that make up this product. Each part is supplied by one or more vendors.",
  emptyMessage = "No parts in the catalog yet. Add parts under Parts, or upload an Excel BOM file to import them.",
}: PartMultiSelectProps) {
  const [query, setQuery] = useState("");

  const filteredParts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return parts;

    return parts.filter(
      (part) =>
        part.name.toLowerCase().includes(normalizedQuery) ||
        part.vendorNames.some((vendorName) =>
          vendorName.toLowerCase().includes(normalizedQuery),
        ),
    );
  }, [parts, query]);

  if (parts.length === 0) {
    return (
      <div className="grid gap-2">
        <Label>{label}</Label>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <p className="text-sm text-muted-foreground">{description}</p>
      {parts.length > 5 ? (
        <Input
          placeholder="Search parts or vendors…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
        />
      ) : null}
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {filteredParts.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No parts match your search.
          </p>
        ) : (
          <ul className="divide-y">
            {filteredParts.map((part) => (
              <li key={part.id}>
                <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    name="partIds"
                    value={String(part.id)}
                    disabled={disabled}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{part.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {part.vendorNames.length > 0
                        ? `Supplied by ${part.vendorNames.join(", ")}`
                        : "No vendor assigned"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
