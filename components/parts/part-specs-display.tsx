import type { PartSpecs } from "@/lib/db/types";
import {
  formatPartSpecs,
  formatSpecLabel,
  getEffectiveSpecs,
} from "@/lib/services/part-specs";

type PartSpecsDisplayProps = {
  specs?: PartSpecs | null;
  description?: string | null;
  variant?: "inline" | "list";
  maxLength?: number;
  className?: string;
};

export function PartSpecsDisplay({
  specs,
  description,
  variant = "inline",
  maxLength,
  className,
}: PartSpecsDisplayProps) {
  const part = { specs, description };
  const effectiveSpecs = getEffectiveSpecs(part);

  if (variant === "list" && Object.keys(effectiveSpecs).length > 0) {
    return (
      <dl className={className ?? "grid gap-2 sm:grid-cols-2"}>
        {Object.entries(effectiveSpecs).map(([key, value]) => (
          <div key={key} className="rounded-md border px-3 py-2">
            <dt className="text-xs text-muted-foreground">
              {formatSpecLabel(key)}
            </dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  const text = formatPartSpecs(part, { maxLength });
  if (!text) {
    return <span className={className ?? "text-muted-foreground"}>—</span>;
  }

  return (
    <span className={className ?? "text-muted-foreground"} title={text}>
      {text}
    </span>
  );
}

export function partDisplayLabel(part: {
  name: string;
  specs?: PartSpecs | null;
  description?: string | null;
}): string {
  const summary = formatPartSpecs(part, { maxLength: 120 });
  return summary ? `${part.name} — ${summary}` : part.name;
}
