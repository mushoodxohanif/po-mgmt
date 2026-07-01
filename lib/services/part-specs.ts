import type { PartSpecs } from "@/lib/db/types";

export type PartCategory =
  | "generic"
  | "fastener"
  | "led_driver"
  | "led_chip"
  | "pcb_board"
  | "wire"
  | "mechanical"
  | "consumable";

export const PART_CATEGORIES: { value: PartCategory; label: string }[] = [
  { value: "generic", label: "Generic" },
  { value: "fastener", label: "Fastener / Screw" },
  { value: "led_driver", label: "LED Driver" },
  { value: "led_chip", label: "LED / SMD Chip" },
  { value: "pcb_board", label: "PCB Board" },
  { value: "wire", label: "Wire / Cable" },
  { value: "mechanical", label: "Mechanical / Housing" },
  { value: "consumable", label: "Consumable" },
];

export const CATEGORY_SPEC_SUGGESTIONS: Record<PartCategory, string[]> = {
  generic: ["model", "weight", "dimension"],
  fastener: ["length", "diameter", "drive_type", "weight"],
  led_driver: [
    "model",
    "brand",
    "input_voltage",
    "output_voltage",
    "power",
    "current",
    "power_factor",
    "weight",
  ],
  led_chip: ["brand", "part_no", "type", "cct", "cri", "lumens", "specs"],
  pcb_board: [
    "model",
    "dimension",
    "series_parallel",
    "power",
    "thickness",
    "w_mk",
  ],
  wire: ["type", "length", "max_voltage", "max_temp", "size"],
  mechanical: ["weight", "dimension", "diameter", "thickness"],
  consumable: ["model", "diameter", "application"],
};

const SPEC_KEY_ALIASES: Record<string, string> = {
  weigth: "weight",
  wt: "weight",
  diamension: "dimension",
  dimensions: "dimension",
  seriesparallel: "series_parallel",
  "series/parallel": "series_parallel",
  drive_type: "drive_type",
  drivetype: "drive_type",
  input_voltage: "input_voltage",
  output_voltage: "output_voltage",
  power_factor: "power_factor",
  powerfactor: "power_factor",
  part_no: "part_no",
  partno: "part_no",
  w_mk: "w_mk",
  wmk: "w_mk",
  max_voltage: "max_voltage",
  max_temp: "max_temp",
};

const SPEC_LABEL_OVERRIDES: Record<string, string> = {
  cct: "CCT",
  cri: "CRI",
  w_mk: "W/mk",
  series_parallel: "Series/Parallel",
  drive_type: "Drive type",
  input_voltage: "Input voltage",
  output_voltage: "Output voltage",
  power_factor: "Power factor",
  part_no: "Part no.",
  max_voltage: "Max voltage",
  max_temp: "Max temp",
};

export function normalizeSpecKey(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const slashNormalized = trimmed.replace(/\//g, "/");
  const underscored = slashNormalized
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/]/g, "")
    .replace(/\/+/g, "/")
    .replace(/^_|_$/g, "");

  const aliasKey = underscored.replace(/\//g, "");
  return (
    SPEC_KEY_ALIASES[underscored] ?? SPEC_KEY_ALIASES[aliasKey] ?? underscored
  );
}

export function formatSpecLabel(key: string): string {
  if (SPEC_LABEL_OVERRIDES[key]) return SPEC_LABEL_OVERRIDES[key];
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function parseDescriptionToSpecs(text: string): PartSpecs {
  const specs: PartSpecs = {};
  const trimmed = text.trim();
  if (!trimmed) return specs;

  const normalized = trimmed.replace(/\r\n/g, "\n");

  const modelMatch = normalized.match(
    /(?:^|\s)Model\s*[:=]\s*([\s\S]+?)(?=\s+\d+\)|$)/i,
  );
  if (modelMatch?.[1]) {
    const modelValue = modelMatch[1]
      .replace(/\s+\d+\).*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (modelValue) specs.model = modelValue;
  }

  const numberedPattern = /(\d+)\)\s*([^=:\n]+?)[:=]\s*/gi;
  const matches = [...normalized.matchAll(numberedPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const rawKey = match[2];
    const matchIndex = match.index;
    if (!rawKey || matchIndex === undefined) continue;

    const key = normalizeSpecKey(rawKey);
    const valueStart = matchIndex + match[0].length;
    const nextIndex = matches[i + 1]?.index;
    const valueEnd = nextIndex !== undefined ? nextIndex : normalized.length;
    const value = normalized
      .slice(valueStart, valueEnd)
      .replace(/\s+/g, " ")
      .trim();

    if (key && value) specs[key] = value;
  }

  if (Object.keys(specs).length === 0) {
    for (const line of normalized.split("\n")) {
      const lineMatch = line.match(/^\s*([^=:]+?)[:=]\s*(.+)\s*$/);
      if (!lineMatch) continue;
      const key = normalizeSpecKey(lineMatch[1]);
      const value = lineMatch[2].trim();
      if (key && value) specs[key] = value;
    }
  }

  return specs;
}

export function inferPartCategory(partName: string): PartCategory {
  const name = partName.toLowerCase();
  if (/screw|rawl|plug|clip|clamp|bracket|l key|allen|fastener/i.test(name)) {
    return "fastener";
  }
  if (/driver/i.test(name)) return "led_driver";
  if (/smd|chip|cob/i.test(name)) return "led_chip";
  if (/pcb/i.test(name)) return "pcb_board";
  if (/wire|cable|grommet/i.test(name)) return "wire";
  if (
    /lens|diffuser|reflector|heat sink|fixture|housing|cover|shell|frame|glass|sink|bracket/i.test(
      name,
    )
  ) {
    return "mechanical";
  }
  if (/solder|thermal paste|label|paste/i.test(name)) return "consumable";
  return "generic";
}

export type SpecMergeStrategy = "import" | "manual" | "replace";

export function mergeSpecs(
  existing: PartSpecs | null | undefined,
  incoming: PartSpecs,
  strategy: SpecMergeStrategy,
): PartSpecs {
  if (strategy === "manual" || strategy === "replace") {
    return { ...incoming };
  }

  const base = { ...(existing ?? {}) };

  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in base) || !base[key]?.trim()) {
      base[key] = value;
    }
  }

  return base;
}

export function getEffectiveSpecs(part: {
  specs?: PartSpecs | null;
  description?: string | null;
}): PartSpecs {
  if (part.specs && Object.keys(part.specs).length > 0) {
    return part.specs;
  }
  if (part.description) {
    return parseDescriptionToSpecs(part.description);
  }
  return {};
}

export function formatPartSpecs(
  part: {
    specs?: PartSpecs | null;
    description?: string | null;
  },
  options?: { separator?: string; maxLength?: number },
): string | null {
  const specs = getEffectiveSpecs(part);
  const entries = Object.entries(specs);
  if (entries.length === 0) {
    return part.description?.trim() || null;
  }

  const separator = options?.separator ?? " · ";
  const formatted = entries
    .map(([key, value]) => `${formatSpecLabel(key)}: ${value}`)
    .join(separator);

  const maxLength = options?.maxLength;
  if (maxLength && formatted.length > maxLength) {
    return `${formatted.slice(0, maxLength - 1)}…`;
  }

  return formatted;
}

export function parseSpecsJson(raw: string | null | undefined): PartSpecs {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const specs: PartSpecs = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") continue;
      const normalizedKey = normalizeSpecKey(key);
      const trimmedValue = value.trim();
      if (normalizedKey && trimmedValue) {
        specs[normalizedKey] = trimmedValue;
      }
    }
    return specs;
  } catch {
    return {};
  }
}

export function specsToRows(
  specs: PartSpecs,
): { key: string; value: string }[] {
  return Object.entries(specs).map(([key, value]) => ({ key, value }));
}

export function rowsToSpecs(rows: { key: string; value: string }[]): PartSpecs {
  const specs: PartSpecs = {};
  for (const row of rows) {
    const key = normalizeSpecKey(row.key);
    const value = row.value.trim();
    if (key && value) specs[key] = value;
  }
  return specs;
}

export function normalizePartName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildPartInputFromImport(
  partName: string,
  rawDescription: string | null,
): {
  category: PartCategory;
  specs: PartSpecs;
  description: string | null;
} {
  const description = rawDescription?.trim() || null;
  const specs = description ? parseDescriptionToSpecs(description) : {};
  const category = inferPartCategory(partName);
  return { category, specs, description };
}
