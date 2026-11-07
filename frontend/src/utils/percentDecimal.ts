// Exact percent <-> decimal string conversion for admin data entry.
// "1.25" (percent) -> "0.0125" (decimal). Returns "" for empty, null for invalid.
// Exact: moves the decimal point two places left on the digit string.
export function percentToDecimal(raw: string): string | null {
  const v = raw.trim().replace(",", ".").replace(/%$/, "").trim();
  if (v === "") return "";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return null;
  const [, sign, int, frac = ""] = m;
  const digits = int + frac;
  const point = int.length - 2;
  const padded = point > 0 ? digits : "0".repeat(1 - point) + digits;
  const at = Math.max(point, 1);
  const whole = padded.slice(0, at).replace(/^0+(?=\d)/, "");
  const rest = padded.slice(at).replace(/0+$/, "");
  const out = rest ? `${whole}.${rest}` : whole;
  return out === "0" ? "0" : `${sign}${out}`;
}
// "0.0125" -> "1.25" for display.
export function decimalToPercent(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return raw;
  const [, sign, int, frac = ""] = m;
  const f = frac.padEnd(2, "0");
  const whole = (int + f.slice(0, 2)).replace(/^0+(?=\d)/, "");
  const rest = f.slice(2).replace(/0+$/, "");
  return `${sign}${whole}${rest ? `.${rest}` : ""}`;
}
