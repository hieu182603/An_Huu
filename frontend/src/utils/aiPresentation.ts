/** Display server decimal strings without losing integers above Number.MAX_SAFE_INTEGER. */
export function formatAiMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || !/^-?\d+(\.\d+)?$/.test(String(value))) return "Chưa xác định";
  const raw = String(value), [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const rounded = BigInt(whole) + (Number(fraction[0] ?? "0") >= 5 ? 1n : 0n);
  const isNeg = raw.startsWith("-") && rounded !== 0n;
  const digits = rounded.toString();
  return `${isNeg ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
}
