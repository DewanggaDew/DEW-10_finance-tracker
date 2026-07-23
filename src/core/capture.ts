// Parses fast-capture text like "50k kopi" or "kopi 1.5jt" (PRD §7).
// Used by the PWA share target now; the Telegram/WA bot (P1) reuses it.

export interface ParsedCapture {
  amountMajor: number;
  note?: string;
}

const AMOUNT_RE = /^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta|m)?$/i;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  m: 1_000_000,
};

export function parseCapture(text: string): ParsedCapture | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(AMOUNT_RE);
    if (!m) continue;
    const suffix = m[2]?.toLowerCase();
    const digits = m[1];
    const fraction = digits.split(/[.,]/)[1];
    // Without a suffix, "12.500" is Indonesian thousands notation, not 12.5
    const base =
      !suffix && fraction?.length === 3
        ? Number(digits.replace(/[.,]/g, ""))
        : parseFloat(digits.replace(",", "."));
    if (!Number.isFinite(base) || base <= 0) continue;
    const amountMajor = base * (suffix ? MULTIPLIERS[suffix] : 1);
    const note = [...tokens.slice(0, i), ...tokens.slice(i + 1)].join(" ");
    return { amountMajor, note: note || undefined };
  }
  return null;
}
