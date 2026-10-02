import { z } from "zod";
import { moneySchema } from "../../common/http";
export const personalSchema = z.object({
  age: z.number().int().min(18).max(110),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "OTHER"]),
  dependents: z.number().int().min(0).max(30),
  city: z.string().trim().max(120),
}).strict();
const income = z.object({ primaryIncome: moneySchema, secondaryIncome: moneySchema }).strict();
const expenses = z.object({ essentialExpense: moneySchema, lifestyleExpense: moneySchema }).strict();
const assets = z.object({ cashSavings: moneySchema, realEstateValue: moneySchema, liquidAssets: moneySchema, stockFundValue: moneySchema }).strict();
const debt = z.object({ hasDebt: z.boolean(), mortgageDebt: moneySchema, consumerDebt: moneySchema, monthlyDebtService: moneySchema }).strict();
const socialSecurity = z.object({ socialInsuranceYears: z.number().min(0).max(110), socialInsuranceSalary: moneySchema }).strict();
const full = z.object({ personal: personalSchema, income, expenses, assets, debt, socialSecurity }).strict();
export const profileSchema = full.superRefine((data, ctx) => {
  if (!data.debt.hasDebt && ["mortgageDebt", "consumerDebt", "monthlyDebtService"].some(key => Number(data.debt[key as "consumerDebt"]) !== 0))
    ctx.addIssue({ code: "custom", path: ["debt"], message: "Không có nợ thì số dư nợ và khoản trả nợ phải bằng 0." });
  if (data.socialSecurity.socialInsuranceYears > data.personal.age)
    ctx.addIssue({ code: "custom", path: ["socialSecurity", "socialInsuranceYears"], message: "Số năm tham gia không được lớn hơn tuổi." });
});
export const partialProfileSchema = z.object({
  personal: personalSchema.partial().optional(), income: income.partial().optional(),
  expenses: expenses.partial().optional(), assets: assets.partial().optional(), debt: debt.partial().optional(),
  socialSecurity: socialSecurity.partial().optional(),
}).strict();
export const patchProfileSchema = z.object({
  expectedRevision: z.number().int().min(1), changes: partialProfileSchema,
}).strict();
export const draftSchema = z.object({
  expectedRevision: z.number().int().min(0),
  step: z.enum(["welcome", "personal", "income", "expenses", "assets", "debt", "investment", "socialSecurity", "summary"]),
  data: partialProfileSchema,
}).strict();
export const completeSchema = z.object({
  expectedDraftRevision: z.number().int().min(1), expectedProfileRevision: z.number().int().min(0),
}).strict();
export const patchAccountSchema = z.object({
  expectedRevision: z.number().int().min(0),
  changes: z.object({
    fullName: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30).regex(/^[+\d ()-]*$/).nullable(),
    city: z.string().trim().max(120).nullable(),
  }).partial().strict().refine(v => Object.keys(v).length > 0, "Cần có thay đổi."),
}).strict();
export type FinancialData = z.infer<typeof profileSchema>;
export type ProfileChanges = z.infer<typeof partialProfileSchema>;
