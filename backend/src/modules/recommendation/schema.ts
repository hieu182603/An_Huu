import { z } from "zod";
import { dateSchema } from "../../common/calendar";
export const amount = z.string().max(30).regex(/^(0|[1-9]\d{0,15})(\.\d{1,8})?$/);
export const assetClass = z.enum(["CASH", "BOND", "EQUITY", "GOLD"]);
export const investmentRole = z.enum(["OPERATIONS", "DATA_ADMIN", "MODEL_ADMIN", "ADVISOR", "APPROVER", "SYSTEM_ADMIN"]);
export const productDocument = z.object({
  code: z.string().trim().min(1).max(60), assetClass,
  category: z.enum(["TERM_DEPOSIT", "GOVERNMENT_BOND", "OPEN_BOND_FUND", "EQUITY_ETF", "ACTIVE_EQUITY_FUND", "PHYSICAL_GOLD"]),
  nav: amount.refine(v => Number(v) > 0), annualExpenseRatioPercent: amount.refine(v => Number(v) <= 100),
  liquidityDays: z.number().int().min(0).max(36500), lotSize: z.number().int().min(1).max(1000000),
  minimumInvestmentVnd: amount, riskScore: z.number().int().min(1).max(10),
  isDistributionPermitted: z.boolean(), status: z.enum(["ACTIVE", "INACTIVE"]),
  sourceKind: z.enum(["REVIEWED_MANUAL", "LICENSED_FEED", "TEST_FIXTURE"]),
  sourceReference: z.string().trim().min(5).max(1000), currency: z.literal("VND"),
  priceAsOf: dateSchema, validUntil: dateSchema,
  distributionEvidence: z.string().trim().min(5).max(2000),
}).strict().refine(v => v.validUntil >= v.priceAsOf, "Ngày hết hạn phải sau ngày giá.")
  .refine(v => ({ TERM_DEPOSIT: "CASH", GOVERNMENT_BOND: "BOND", OPEN_BOND_FUND: "BOND", EQUITY_ETF: "EQUITY", ACTIVE_EQUITY_FUND: "EQUITY", PHYSICAL_GOLD: "GOLD" })[v.category] === v.assetClass, "Nhóm sản phẩm phải khớp loại tài sản.");
export const writeProductData = z.object({ expectedRevision: z.number().int().min(0), data: productDocument }).strict();
export const createRecommendation = z.object({ userId: z.string().uuid(), planId: z.string().uuid(), versionId: z.string().uuid() }).strict();
export const transitionRecommendation = z.object({ expectedRevision: z.number().int().positive(), reason: z.string().trim().min(5).max(1000) }).strict();
export const writeHolding = z.object({ productId: z.string().uuid(), quantity: amount, unitCost: amount, lockedUntil: dateSchema.nullable().optional(), expectedRevision: z.number().int().min(0) }).strict();
