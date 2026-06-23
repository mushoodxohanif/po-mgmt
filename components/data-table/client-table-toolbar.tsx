"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ClientTableFilter = {
  key: string;
  label: string;
  placeholder: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allLabel?: string;
};

type ClientTableToolbarProps = {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ClientTableFilter[];
  onClear?: () => void;
  className?: string;
};

export function ClientTableToolbar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters = [],
  onClear,
  className,
}: ClientTableToolbarProps) {
  const [query, setQuery] = useState(searchValue);

  const hasActiveFilters =
    Boolean(searchValue) ||
    filters.some((filter) => filter.value && filter.value !== "all");

  function handleSearchChange(value: string) {
    setQuery(value);
    onSearchChange(value);
  }

  function handleClear() {
    setQuery("");
    onSearchChange("");
    for (const filter of filters) {
      filter.onChange("all");
    }
    onClear?.();
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8"
          aria-label="Search table"
        />
      </div>

      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value || "all"}
          onValueChange={filter.onChange}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={filter.placeholder} />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">
              {filter.allLabel ?? `All ${filter.label.toLowerCase()}`}
            </SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="self-start sm:self-auto"
        >
          <XIcon />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
