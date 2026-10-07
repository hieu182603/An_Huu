import { z } from "zod";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";

export const insuranceHash = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceSchema = z.object({ reference: z.string().trim().min(1).max(300), contentHash: insuranceHash, confirmedOn: dateSchema }).strict();
export const contributionMonthSchema = z.object({
  month: monthSchema, scheme: z.enum(["COMPULSORY", "VOLUNTARY", "UNKNOWN"]),
  salaryRegime: z.enum(["EMPLOYER", "STATE", "VOLUNTARY_INCOME", "UNKNOWN"]),
  status: z.enum(["PAID", "CREDITED", "UNKNOWN", "WITHDRAWN", "NOT_CONTRIBUTED"]), contributionBase: moneySchema.nullable(),
  participantCategory: z.enum(["ARTICLE_2_1_A", "ARTICLE_2_1_B", "ARTICLE_2_1_C", "ARTICLE_2_1_D", "ARTICLE_2_1_DD", "ARTICLE_2_1_G", "ARTICLE_2_1_I", "OTHER", "UNKNOWN"]).optional(),
  stateSalary: z.object({ kind: z.literal("CURRENT_SCALE_COEFFICIENT"),
    totalContributionCoefficient: z.string().regex(/^(0|[1-9]\d{0,3})(\.\d{1,12})?$/),
    evidence: z.array(evidenceSchema).min(1).max(20),
  }).strict().optional(),
  creditKind: z.string().trim().min(1).max(100).optional(), evidence: z.array(evidenceSchema).max(20),
}).strict().superRefine((v, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (v.status === "CREDITED" && (!v.creditKind || !v.evidence.length)) issue("creditKind", "Tháng được tính đóng cần loại và căn cứ.");
  if (v.status !== "CREDITED" && v.creditKind) issue("creditKind", "Chỉ khai căn cứ tính đóng cho tháng CREDITED.");
  if (v.scheme === "VOLUNTARY" && !["VOLUNTARY_INCOME", "UNKNOWN"].includes(v.salaryRegime)) issue("salaryRegime", "Chế độ lương không khớp BHXH tự nguyện.");
  if (v.scheme === "COMPULSORY" && v.salaryRegime === "VOLUNTARY_INCOME") issue("salaryRegime", "Chế độ lương không khớp BHXH bắt buộc.");
  if (v.status === "NOT_CONTRIBUTED" && v.contributionBase !== null) issue("contributionBase", "Tháng xác nhận không tham gia không có căn cứ đóng.");
  if (v.stateSalary && (v.salaryRegime !== "STATE" || !["PAID", "CREDITED"].includes(v.status))) issue("stateSalary", "Hệ số lương chỉ dùng cho tháng lương Nhà nước được tính đóng.");
});
const birthSchema = z.object({ precision: z.enum(["DAY", "MONTH", "YEAR", "UNKNOWN"]), declaredValue: z.string().max(10).nullable() }).strict()
  .superRefine((v, ctx) => {
    const valid = v.precision === "UNKNOWN" ? v.declaredValue === null : v.precision === "DAY" ? dateSchema.safeParse(v.declaredValue).success
      : v.precision === "MONTH" ? monthSchema.safeParse(v.declaredValue).success : /^(19|20|21)\d{2}$/.test(v.declaredValue ?? "");
    if (!valid) ctx.addIssue({ code: "custom", path: ["declaredValue"], message: "Ngày sinh không khớp mức chính xác đã khai." });
  });
export const insuranceHistorySchema = z.object({
  schemaVersion: z.literal(1), birth: birthSchema, legalSex: z.enum(["MALE", "FEMALE", "UNKNOWN"]),
  coverageFrom: monthSchema, coverageThrough: monthSchema, confirmedThroughMonth: monthSchema,
  months: z.array(contributionMonthSchema).max(1200), specialPeriods: z.array(z.object({
    kind: z.string().trim().min(1).max(100), startMonth: monthSchema, endMonth: monthSchema, evidence: z.array(evidenceSchema).min(1).max(20),
  }).strict()).max(200),
}).strict().superRefine((v, ctx) => {
  if (v.coverageFrom > v.coverageThrough || addMonths(v.coverageFrom, 1199) < v.coverageThrough)
    ctx.addIssue({ code: "custom", path: ["coverageThrough"], message: "Khoảng lịch tối đa 1.200 tháng." });
  if (v.confirmedThroughMonth < v.coverageFrom || v.confirmedThroughMonth > v.coverageThrough)
    ctx.addIssue({ code: "custom", path: ["confirmedThroughMonth"], message: "Mốc xác nhận phải trong khoảng lịch." });
  v.specialPeriods.forEach((p, i) => {
    if (p.startMonth > p.endMonth || p.startMonth < v.coverageFrom || p.endMonth > v.coverageThrough)
      ctx.addIssue({ code: "custom", path: ["specialPeriods", i], message: "Khoảng đặc thù không thuộc lịch đã khai." });
  });
});
export const historyPreviewSchema = z.object({ expectedHistoryRevision: z.number().int().min(0), document: insuranceHistorySchema }).strict();
export const historySaveSchema = z.object({ preview: historyPreviewSchema, expectedInputHash: insuranceHash, confirm: z.literal(true) }).strict();
export type InsuranceHistory = z.infer<typeof insuranceHistorySchema>;

export const legalCitationSchema = z.object({ id: z.string().min(1).max(100), instrument: z.string().min(1).max(200), locator: z.string().min(1).max(200),
  url: z.string().url().max(1000).refine(s => s.startsWith("https://")), contentHash: insuranceHash, effectiveFrom: dateSchema, effectiveTo: dateSchema.nullable(),
}).strict();
const ruleDecimal = z.string().max(80).regex(/^-?(0|[1-9]\d{0,30})(\.\d{1,30})?$/);
export const legalRuleDocumentSchema = z.object({ schemaVersion: z.literal(1), engineCode: z.string().min(1).max(100),
  coverage: z.array(z.object({ branch: z.string().min(1).max(100), strategyCode: z.string().min(1).max(100),
    citationIds: z.array(z.string().min(1).max(100)).min(1).max(50), requiredTableKeys: z.array(z.string().min(1).max(100)).max(200),
  }).strict()).min(1).max(100), citations: z.array(legalCitationSchema).min(1).max(200),
  tables: z.array(z.object({ kind: z.enum(["AGE_MONTHS", "WAGE_FACTOR", "INCOME_FACTOR", "REFERENCE_AMOUNT", "FUND_MONTHLY_RATE"]),
    key: z.string().min(1).max(100), value: ruleDecimal, effectiveFrom: dateSchema, effectiveTo: dateSchema.nullable(), citationId: z.string().min(1).max(100),
  }).strict()).max(5000),
}).strict();
export const legalRuleDraftSchema = z.object({ code: z.string().regex(/^[A-Z0-9_-]{1,100}$/), effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable(), supersedesId: z.string().uuid().nullable().default(null), document: legalRuleDocumentSchema,
}).strict().refine(v => v.effectiveTo === null || v.effectiveTo > v.effectiveFrom, "Ngày kết thúc luật phải sau ngày bắt đầu.");
export const legalRulePatchSchema = z.object({ expectedRevision: z.number().int().min(1), draft: legalRuleDraftSchema }).strict();
export const legalRuleTransitionSchema = z.object({ action: z.enum(["VALIDATE", "REVIEW", "PUBLISH"]), expectedRevision: z.number().int().min(1),
  expectedDocumentHash: insuranceHash, validationHash: insuranceHash.optional(), reviewHash: insuranceHash.optional(),
  reviewNote: z.string().trim().min(1).max(1000).optional(), confirm: z.literal(true),
}).strict();
export const voluntaryCaseSchema = z.object({ kind: z.literal("NORMAL_VOLUNTARY"), paymentMethod: z.literal("REGULAR_ONLY"), ageRule: z.literal("NORMAL"),
  benefitStart: z.object({ kind: z.enum(["ELIGIBILITY", "CONTINUED_CONTRIBUTIONS"]), month: monthSchema,
    confirmation: z.enum(["DOCUMENTED", "HYPOTHETICAL"]), evidence: z.array(evidenceSchema).min(1).max(20) }).strict(),
}).strict();
// A settlement is not a set of dated PAID months. Keep it separate in the
// immutable estimate input so it cannot silently alter the account history.
export const voluntaryTopUpCaseSchema = z.object({ kind: z.literal("MISSING_YEARS_TOP_UP"), ageRule: z.literal("NORMAL"),
  historyTreatment: z.literal("REGULAR_ONLY"), paymentOn: dateSchema, missingMonths: z.number().int().min(1).max(60),
  monthlyIncome: moneySchema, confirmation: z.enum(["DOCUMENTED_FULLY_PAID", "HYPOTHETICAL"]),
  evidence: z.array(evidenceSchema).min(1).max(20),
}).strict();
export const voluntaryPrepaidCaseSchema = z.object({ kind: z.literal("PREPAID_REQUEST"), ageRule: z.literal("NORMAL"),
  historyTreatment: z.literal("NO_OTHER_ACTIVE_PREPAYMENT_OR_TOP_UP"), periodStartMonth: monthSchema,
  periodMonths: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24), z.literal(36), z.literal(48), z.literal(60)]),
  registeredOn: dateSchema, paymentOn: dateSchema, monthlyIncome: moneySchema,
  confirmation: z.enum(["DOCUMENTED_FULLY_PAID", "HYPOTHETICAL"]), evidence: z.array(evidenceSchema).min(1).max(20),
  benefitRequest: z.object({ confirmation: z.enum(["DOCUMENTED", "HYPOTHETICAL"]), evidence: z.array(evidenceSchema).min(1).max(20) }).strict(),
  refundSupport: z.object({ stateSupportToExclude: moneySchema, evidence: z.array(evidenceSchema).min(1).max(20) }).strict().nullable(),
}).strict();
export const pensionEstimateInputSchema = z.object({ historyVersionId: z.string().uuid(), expectedHistoryRevision: z.number().int().min(1),
  legalRuleSetVersionId: z.string().uuid(), intendedBenefitDate: dateSchema, employmentEndDate: dateSchema.nullable(),
  contributionStopMonth: monthSchema.nullable(), benefitRequestDate: dateSchema.nullable(), futureContributions: z.array(contributionMonthSchema).max(1200),
  voluntaryCase: voluntaryCaseSchema.optional(),
  voluntaryTopUp: voluntaryTopUpCaseSchema.optional(),
  voluntaryPrepaid: voluntaryPrepaidCaseSchema.optional(),
  caseDetails: z.object({ kind: z.literal("NORMAL_EMPLOYEE"), participationAtRetirement: z.enum(["ACTIVE_COMPULSORY", "PRESERVED"]),
    benefitStart: z.object({ kind: z.enum(["EMPLOYER_NOTICE", "PERSON_REQUEST", "HYPOTHETICAL"]), month: monthSchema, evidence: z.array(evidenceSchema).min(1).max(20) }).strict(),
  }).strict().optional(),
  stateSalaryCase: z.object({ firstParticipationMonth: monthSchema, firstParticipationEvidence: z.array(evidenceSchema).min(1).max(20),
    salaryTreatment: z.enum(["ORDINARY", "HAZARDOUS_TRANSFER", "MILITARY_TRANSFER", "SENIORITY_ALLOWANCE_TRANSFER", "UNKNOWN"]),
    treatmentEvidence: z.array(evidenceSchema).min(1).max(20),
  }).strict().optional(),
}).strict();
export const pensionEstimateSaveSchema = z.object({ preview: pensionEstimateInputSchema, expectedInputHash: insuranceHash }).strict();
export type LegalRuleDocument = z.infer<typeof legalRuleDocumentSchema>;
