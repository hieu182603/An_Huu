const fraction = (value: string) => {
  const [whole, decimals = ""] = value.split(".");
  return { n: BigInt(whole + decimals), d: 10n ** BigInt(decimals.length) };
};

/** Revalue the derived input against today's long-term capital. Never infer a new answer. */
export function resolveLossTolerance(growth: string | null, amount: string | null, percent: string | null, mode?: "PERCENT" | "AMOUNT" | "BOTH"): { amount: string | null; percent: string | null; inputMode: "PERCENT" | "AMOUNT" | "BOTH" } {
  const inputMode = mode ?? (percent !== null && (amount === null || growth === null || Number(amount) >= Number(growth) * Number(percent) / 100) ? "PERCENT" : "AMOUNT");
  // Without long-term capital only a saved percent is meaningful; keep it visible (an amount cannot be derived).
  if (growth === null || Number(growth) <= 0) return { amount: null, percent: inputMode !== "AMOUNT" ? percent : null, inputMode };
  const g = fraction(growth);
  if (inputMode === "BOTH") {
    if (amount === null) return { ...resolveLossTolerance(growth, amount, percent, "PERCENT"), inputMode };
    if (percent === null) return { ...resolveLossTolerance(growth, amount, percent, "AMOUNT"), inputMode };
    const a = fraction(amount), p = fraction(percent);
    const binding = a.n * g.d * p.d * 100n <= g.n * p.n * a.d ? "AMOUNT" : "PERCENT";
    return { ...resolveLossTolerance(growth, amount, percent, binding), inputMode };
  }
  if (inputMode === "PERCENT") {
    if (percent === null) return { amount: null, percent, inputMode };
    const p = fraction(percent), denominator = g.d * p.d * 100n;
    return { amount: ((g.n * p.n + denominator / 2n) / denominator).toString(), percent, inputMode };
  }
  if (amount === null) return { amount, percent: null, inputMode };
  const a = fraction(amount), denominator = a.d * g.n;
  const thousandths = (a.n * g.d * 100000n + denominator / 2n) / denominator;
  const ratio = `${thousandths / 1000n}.${String(thousandths % 1000n).padStart(3, "0")}`.replace(/\.?0+$/, "");
  return { amount, percent: ratio, inputMode };
}
