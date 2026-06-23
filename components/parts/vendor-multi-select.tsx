"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorOptionForPart } from "@/lib/actions/parts";

type VendorMultiSelectProps = {
  vendors: VendorOptionForPart[];
  assignedVendorIds?: number[];
  disabled?: boolean;
};

export function VendorMultiSelect({
  vendors,
  assignedVendorIds = [],
  disabled,
}: VendorMultiSelectProps) {
  const [query, setQuery] = useState("");
  const assignedIds = new Set(assignedVendorIds);

  const filteredVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return vendors;

    return vendors.filter((vendor) =>
      vendor.name.toLowerCase().includes(normalizedQuery),
    );
  }, [vendors, query]);

  if (vendors.length === 0) {
    return (
      <div className="grid gap-2">
        <Label>Vendors</Label>
        <p className="text-sm text-muted-foreground">
          No vendors yet. Add vendors under Vendors before linking them to
          parts.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label>Vendors</Label>
      <p className="text-sm text-muted-foreground">
        Select vendors that supply this part.
      </p>
      {vendors.length > 5 ? (
        <Input
          placeholder="Search vendors…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
        />
      ) : null}
      <div className="max-h-48 overflow-y-auto rounded-md border">
        {filteredVendors.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No vendors match your search.
          </p>
        ) : (
          <ul className="divide-y">
            {filteredVendors.map((vendor) => (
              <li key={vendor.id}>
                <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    name="vendorIds"
                    value={String(vendor.id)}
                    defaultChecked={assignedIds.has(vendor.id)}
                    disabled={disabled}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{vendor.name}</span>
                    {vendor.contactName ? (
                      <span className="block text-xs text-muted-foreground">
                        {vendor.contactName}
                      </span>
                    ) : null}
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
