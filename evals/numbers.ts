/**
 * Numeric faithfulness: every amount or percentage the model states must be
 * traceable to the user's data (or a simple derivation of it).
 */

export interface StatedNumber {
  raw: string;
  value: number;
  kind: "money" | "percent";
}

/** Parses "1,150.00", "1.150,00", "1 150,00" and "61.7" into numbers. */
export function parseLocalizedNumber(raw: string): number {
  const s = raw.replace(/[\s  ]/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the last one is the decimal separator.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else {
    const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
    if (!sep) normalized = s;
    else {
      const parts = s.split(sep);
      // "1,150" / "1.150" (groups of 3) are thousands; "12,50" / "61.7" are decimals.
      const isThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
      normalized = isThousands ? parts.join("") : parts.join(".");
    }
  }
  return Number(normalized);
}

// Grouped thousands ("1,150.00", "1 150") only when a separator is present, otherwise
// "$1150" would match as "115". (?!\d) stops a match in the middle of a number.
const NUM = String.raw`(?:\d{1,3}(?:[.,\s  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d)`;
const MONEY = new RegExp(String.raw`(?:[$€]\s?(${NUM}))|(?:(${NUM})\s?(?:[$€]|USD|EUR|dollars?|d[oó]lares|euros?))`, "gi");
const PERCENT = new RegExp(String.raw`(${NUM})\s?%`, "g");

/** Amounts next to a currency sign or word, and numbers followed by %. Other numbers (counts, years) are ignored. */
export function extractStatedNumbers(text: string): StatedNumber[] {
  const out: StatedNumber[] = [];
  for (const m of text.matchAll(MONEY)) {
    const raw = (m[1] ?? m[2]).trim();
    out.push({ raw: m[0].trim(), value: parseLocalizedNumber(raw), kind: "money" });
  }
  for (const m of text.matchAll(PERCENT)) out.push({ raw: m[0].trim(), value: parseLocalizedNumber(m[1]), kind: "percent" });
  return out;
}

export interface AllowedNumbers {
  money: number[];
  percent: number[];
}

/** Money may be rounded to whole units; percentages to whole numbers. */
export function isTraceable(n: StatedNumber, allowed: AllowedNumbers): boolean {
  if (n.value === 0) return true;
  return n.kind === "money"
    ? allowed.money.some((v) => Math.abs(v - n.value) <= 1)
    : allowed.percent.some((v) => Math.abs(v - n.value) <= 0.6);
}
