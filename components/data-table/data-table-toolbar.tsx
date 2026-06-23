"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildListHref } from "@/lib/data-table/list-params";
import { cn } from "@/lib/utils";

export type DataTableFilterOption = {
  key: string;
  label: string;
  placeholder: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
};

type DataTableToolbarProps = {
  searchPlaceholder: string;
  searchValue?: string;
  filters?: DataTableFilterOption[];
  className?: string;
};

export function DataTableToolbar({
  searchPlaceholder,
  searchValue = "",
  filters = [],
  className,
}: DataTableToolbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchValue);

  useEffect(() => {
    setQuery(searchValue);
  }, [searchValue]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (query === current) return;

      router.push(
        buildListHref(pathname, searchParams, {
          q: query || undefined,
        }),
      );
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [pathname, query, router, searchParams]);

  const hasActiveFilters =
    Boolean(searchValue) || filters.some((filter) => Boolean(filter.value));

  function updateFilter(key: string, value: string | undefined) {
    router.push(
      buildListHref(pathname, searchParams, {
        [key]: value,
      }),
    );
  }

  function clearFilters() {
    const updates: Record<string, undefined> = { q: undefined };
    for (const filter of filters) {
      updates[filter.key] = undefined;
    }

    router.push(buildListHref(pathname, searchParams, updates));
    setQuery("");
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8"
          aria-label="Search table"
        />
      </div>

      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value ?? "all"}
          onValueChange={(value) =>
            updateFilter(filter.key, value === "all" ? undefined : value)
          }
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
          onClick={clearFilters}
          className="self-start sm:self-auto"
        >
          <XIcon />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
