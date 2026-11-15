import { formatCompactMoneyDecimal } from "./moneyDisplay.ts";

/** Use the saved version's dates and contribution in every customer-facing name. */
export function planVersionName(version: number, birthMonth: string | null | undefined, retirementMonth: string | undefined, contribution: string | null | undefined, en = false): string {
  const age = birthMonth && retirementMonth ? Math.floor(((Number(retirementMonth.slice(0, 4)) - Number(birthMonth.slice(0, 4))) * 12 + Number(retirementMonth.slice(5, 7)) - Number(birthMonth.slice(5, 7))) / 12) : null;
  const amount = formatCompactMoneyDecimal(contribution, en).replace(/ ₫$/, "");
  return en
    ? `Option ${version} (Version ${version}${age === null ? "" : ` · Retire at ${age}`}, contribute ${amount}/month)`
    : `Phương án ${version} (Phiên bản ${version}${age === null ? "" : ` · Nghỉ ${age} tuổi`}, góp ${amount}/tháng)`;
}
