import { Prisma } from "@prisma/client";
import type { ProfileV2 } from "./schema-v2";
import { pensionAtMonth } from "../pensions/engine";

const D = Prisma.Decimal.clone({ precision: 48 });
export function profileMonthlyCashflow(data: Pick<ProfileV2, "income" | "expenses"> & Partial<Pick<ProfileV2, "personal" | "pension">>, month: string) {
  const issues: Array<{ path: string; code: string }> = [];
  function total(key: "income" | "expenses") {
    const group = data[key];
    if (group.status === "UNKNOWN") { issues.push({ path: key, code: "UNKNOWN_VALUE" }); return null; }
    if (group.status === "NOT_APPLICABLE") return new D(0);
    let sum = new D(0), complete = true;
    group.entries.forEach((entry, index) => {
      if (key === "income" && "source" in entry && entry.source === "PENSION") return;
      if (entry.startMonth > month || (entry.endMonth !== null && entry.endMonth < month) || ("category" in entry && entry.category === "DEBT_PAYMENT")) return;
      const path = `${key}.entries.${index}`;
      if (entry.currency !== "VND") { complete = false; issues.push({ path: path + ".currency", code: "FX_RULE_REQUIRED" }); }
      else if (entry.amount.status !== "KNOWN") { complete = false; issues.push({ path: path + ".amount", code: "UNKNOWN_VALUE" }); }
      else sum = sum.plus(entry.amount.value);
    });
    return complete ? sum : null;
  }
  let income = total("income");
  const expenses = total("expenses");
  if (data.personal) {
    const pension = pensionAtMonth({ personal: data.personal, pension: data.pension }, month);
    issues.push(...pension.issues);
    if (pension.amount !== null && income !== null) income = income.plus(pension.amount);
    // Existing undeclared pensions stay excluded with an explicit warning. A
    // declared amount needing conversion/date must not masquerade as a full total.
    if (pension.amount === null && data.pension?.status === "KNOWN") income = null;
  }
  return { income, expenses, issues };
}
