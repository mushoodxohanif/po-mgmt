import type { Prisma } from "@prisma/client";

export const CURRENCY_CODE = "PKR";
export const CURRENCY_SYMBOL = "₨";

/**
 * Prisma returns money columns as `Decimal` instances (decimal.js), which are
 * not plain-serializable across the server/client boundary. Convert to a
 * plain number as soon as data leaves the database layer.
 */
export function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${CURRENCY_SYMBOL} ${formatted}`;
}

export function parsePriceInput(
  value: FormDataEntryValue | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}
