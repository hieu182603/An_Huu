import { z } from "zod";
import { addMonths } from "../../common/calendar";
import { digest } from "../../common/digest";
import { historyPreviewSchema, type InsuranceHistory } from "./insurance-schema";

/** Import is structured data only. No external fetch/OCR/model call, and no
 * guessed paid months: holes are explicitly UNKNOWN and remain in the preview. */
export function previewInsuranceHistory(command: z.infer<typeof historyPreviewSchema>) {
  const input = historyPreviewSchema.parse(command), document = input.document;
  const issues: Array<{ path: string; code: string }> = [], invalid: typeof issues = [];
  const byMonth = new Map<string, InsuranceHistory["months"][number]>();
  document.months.forEach((row, i) => {
    if (byMonth.has(row.month)) invalid.push({ path: `months.${i}.month`, code: "DUPLICATE_CONTRIBUTION_MONTH" });
    if (row.month < document.coverageFrom || row.month > document.coverageThrough) invalid.push({ path: `months.${i}.month`, code: "MONTH_OUTSIDE_COVERAGE" });
    if (row.month > document.confirmedThroughMonth && row.status !== "UNKNOWN") invalid.push({ path: `months.${i}.status`, code: "FUTURE_HISTORY_MUST_BE_SEPARATE_SCENARIO" });
    byMonth.set(row.month, row);
  });
  const months: InsuranceHistory["months"] = [];
  for (let month = document.coverageFrom; month <= document.coverageThrough; month = addMonths(month, 1)) {
    const row = byMonth.get(month) ?? { month, scheme: "UNKNOWN", salaryRegime: "UNKNOWN", status: "UNKNOWN", contributionBase: null, evidence: [] };
    const path = `months.${month}`;
    if (!byMonth.has(month)) issues.push({ path, code: "MISSING_CONTRIBUTION_MONTH" });
    else if (row.status === "UNKNOWN") issues.push({ path, code: "UNKNOWN_CONTRIBUTION_STATUS" });
    if (["PAID", "CREDITED"].includes(row.status)) {
      if (row.scheme === "UNKNOWN" || row.salaryRegime === "UNKNOWN") issues.push({ path, code: "CONTRIBUTION_SCHEME_REQUIRED" });
      if (row.contributionBase === null) issues.push({ path, code: "CONTRIBUTION_BASE_REQUIRED" });
      if (!row.evidence.length) issues.push({ path, code: "CONTRIBUTION_EVIDENCE_REQUIRED" });
    }
    if (["NOT_CONTRIBUTED", "WITHDRAWN"].includes(row.status) && !row.evidence.length) issues.push({ path, code: "NONCOUNTED_MONTH_EVIDENCE_REQUIRED" });
    months.push(row);
  }
  if (document.birth.precision === "UNKNOWN") issues.push({ path: "birth", code: "BIRTH_REQUIRED" });
  if (document.legalSex === "UNKNOWN") issues.push({ path: "legalSex", code: "LEGAL_SEX_REQUIRED" });
  const normalized = { ...document, months };
  // Hash the full input as well: duplicates/out-of-range data must not collide
  // with a corrected request just because normalization omits those rows.
  return { status: invalid.length ? "INVALID" as const : issues.length ? "INCOMPLETE" as const : "READY" as const,
    inputHash: digest({ input, normalized }), issues: [...invalid, ...issues], normalized };
}
