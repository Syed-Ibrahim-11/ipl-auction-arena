const CRORE_IN_LAKH = 100;

export function parseIndianPriceToLakh(raw: string): number {
  const cleaned = String(raw).replace(/[₹,\s]/g, "");
  if (!cleaned) return 0;
  const rupees = Number(cleaned);
  if (!Number.isFinite(rupees)) {
    throw new Error(`Invalid Indian price: ${raw}`);
  }
  return Math.round(rupees / 100_000);
}

export function formatLakh(lakh: number | null | undefined, options?: { compact?: boolean }): string {
  if (lakh === null || lakh === undefined || Number.isNaN(lakh)) return "—";
  const value = Number(lakh);
  if (Math.abs(value) >= CRORE_IN_LAKH) {
    const crore = value / CRORE_IN_LAKH;
    const digits = Number.isInteger(crore) ? 0 : crore >= 10 ? 1 : 2;
    return `₹${crore.toFixed(digits)} Cr`;
  }
  if (options?.compact) return `₹${Math.round(value)}L`;
  return `₹${value.toLocaleString("en-IN")}L`;
}

export function formatCrore(lakh: number | null | undefined): string {
  if (lakh === null || lakh === undefined) return "—";
  const crore = lakh / CRORE_IN_LAKH;
  const digits = Number.isInteger(crore) ? 0 : 2;
  return `${crore.toFixed(digits)}`;
}

export function croreToLakh(crore: number): number {
  return Math.round(crore * CRORE_IN_LAKH);
}

export function lakhToCrore(lakh: number): number {
  return lakh / CRORE_IN_LAKH;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export function formatAverage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Number(value).toFixed(2);
}
