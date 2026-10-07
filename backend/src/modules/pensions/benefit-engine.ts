import { z } from "zod";
import { AppError } from "../../common/errors";
import { assessOrdinaryBenefit, BENEFIT_ENGINE } from "./benefit-assessment";
import { assessOrdinaryBenefitV2, BENEFIT_ENGINE_V2 } from "./benefit-assessment-v2";
import { type LegalRuleDocument, pensionEstimateInputSchema } from "./insurance-schema";
import { assessStateBenefit, assessStateBenefitV2, STATE_BENEFIT_ENGINE, STATE_BENEFIT_ENGINE_V2, STATE_BRANCH } from "./state-assessment";
import { ORDINARY_BRANCH } from "./benefit-assessment";
import { assessVoluntaryTopUpBenefit, voluntaryTopUpInputSchema, VOLUNTARY_TOP_UP_ENGINE, VOLUNTARY_TOP_UP_BRANCH } from "./voluntary-assessment";
import { assessVoluntaryPrepaidBenefit, voluntaryPrepaidInputSchema, VOLUNTARY_PREPAID_ENGINE, VOLUNTARY_PREPAID_BRANCH } from "./voluntary-assessment";
import { assessVoluntaryBenefit, VOLUNTARY_ENGINE, VOLUNTARY_BRANCH, voluntaryEstimateInputSchema,
  assessVoluntaryStateBenefit, VOLUNTARY_STATE_ENGINE, VOLUNTARY_STATE_BRANCH } from "./voluntary-assessment";
export const benefitEngineSchema = z.enum([BENEFIT_ENGINE, BENEFIT_ENGINE_V2, STATE_BENEFIT_ENGINE, STATE_BENEFIT_ENGINE_V2, VOLUNTARY_ENGINE, VOLUNTARY_STATE_ENGINE, VOLUNTARY_TOP_UP_ENGINE, VOLUNTARY_PREPAID_ENGINE]);
export const benefitBranch = (engine: string) => engine === VOLUNTARY_PREPAID_ENGINE ? VOLUNTARY_PREPAID_BRANCH : engine === VOLUNTARY_TOP_UP_ENGINE ? VOLUNTARY_TOP_UP_BRANCH : engine === VOLUNTARY_STATE_ENGINE ? VOLUNTARY_STATE_BRANCH : engine === VOLUNTARY_ENGINE ? VOLUNTARY_BRANCH : [STATE_BENEFIT_ENGINE, STATE_BENEFIT_ENGINE_V2].includes(engine) ? STATE_BRANCH : ORDINARY_BRANCH;
export function assessBenefit(history: unknown, input: z.infer<typeof pensionEstimateInputSchema>, rules: LegalRuleDocument, assessedOn: string) {
  if (input.voluntaryPrepaid && rules.engineCode !== VOLUNTARY_PREPAID_ENGINE) throw new AppError(422, "PENSION_CASE_ENGINE_MISMATCH", "Cần chọn bộ quy định cho khoản đóng trước BHXH.");
  if (rules.engineCode === VOLUNTARY_PREPAID_ENGINE) return assessVoluntaryPrepaidBenefit(history, voluntaryPrepaidInputSchema.parse(input), rules, assessedOn);
  if (input.voluntaryTopUp && rules.engineCode !== VOLUNTARY_TOP_UP_ENGINE) throw new AppError(422, "PENSION_CASE_ENGINE_MISMATCH", "Cần chọn bộ quy định cho khoản đóng bù BHXH.");
  if (rules.engineCode === VOLUNTARY_TOP_UP_ENGINE) return assessVoluntaryTopUpBenefit(history, voluntaryTopUpInputSchema.parse(input), rules, assessedOn);
  if (input.voluntaryCase && ![VOLUNTARY_ENGINE, VOLUNTARY_STATE_ENGINE].includes(rules.engineCode)) throw new AppError(422, "PENSION_CASE_ENGINE_MISMATCH", "Cần chọn bộ quy định cho BHXH tự nguyện.");
  if (rules.engineCode === VOLUNTARY_STATE_ENGINE) return assessVoluntaryStateBenefit(history, voluntaryEstimateInputSchema.parse(input), rules, assessedOn);
  if (rules.engineCode === VOLUNTARY_ENGINE) return assessVoluntaryBenefit(history, voluntaryEstimateInputSchema.parse(input), rules, assessedOn);
  if (rules.engineCode === BENEFIT_ENGINE) return assessOrdinaryBenefit(history, input, rules, assessedOn);
  if (rules.engineCode === BENEFIT_ENGINE_V2) return assessOrdinaryBenefitV2(history, input, rules, assessedOn);
  if (rules.engineCode === STATE_BENEFIT_ENGINE) return assessStateBenefit(history, input, rules, assessedOn);
  if (rules.engineCode === STATE_BENEFIT_ENGINE_V2) return assessStateBenefitV2(history, input, rules, assessedOn);
  throw new AppError(422, "BENEFIT_ENGINE_NOT_SUPPORTED", "Phiên bản bộ tính BHXH chưa được hỗ trợ.");
}
