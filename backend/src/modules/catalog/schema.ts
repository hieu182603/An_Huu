import { z } from "zod";
import { paginationSchema } from "../../common/http";
const https = z.string().url().max(2000).refine(v => v.startsWith("https://"), "URL phải dùng HTTPS.").nullable();
export const catalogQuery = paginationSchema(["name", "updatedAt"]).extend({ search: z.string().trim().max(120).default(""), partnerId: z.string().uuid().optional() });
export const partnerInput = z.object({
  name: z.string().trim().min(2).max(200), type: z.enum(["OPEN_FUND", "BANK", "INSURANCE", "SECURITIES"]),
  logoUrl: https, website: https, contactEmail: z.string().email().max(254).nullable(), isHighlight: z.boolean(), isVisible: z.boolean(),
}).strict();
export const productInput = z.object({
  partnerId: z.string().uuid(), name: z.string().trim().min(2).max(200), category: z.string().trim().min(2).max(120),
  expectedReturn: z.string().trim().max(1000), riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: z.string().trim().max(10000).nullable(), annualFee: z.string().trim().min(1).max(5000).nullable(),
  conditions: z.string().trim().min(1).max(10000).nullable(), disclosure: z.string().trim().min(1).max(10000).nullable(), isVisible: z.boolean(),
  imageUrl: https.optional(), // omitted = keep current image
}).strict().superRefine((v, ctx) => {
  if (v.isVisible) for (const key of ["annualFee", "conditions", "disclosure"] as const)
    if (!v[key]) ctx.addIssue({ code: "custom", path: [key], message: "Phải bổ sung trước khi hiển thị sản phẩm." });
});
export const partnerUpdate = z.object({ expectedRevision: z.number().int().min(0), data: partnerInput }).strict();
export const productUpdate = z.object({ expectedRevision: z.number().int().min(0), data: productInput }).strict();
export const notificationSettingsInput = z.object({ expectedRevision: z.number().int().min(0), emailDigest: z.boolean(), goalAlerts: z.boolean(), partnerUpdates: z.boolean() }).strict();
