import { profileV2Schema } from "../modules/profiles/schema-v2";
import type { Pension } from "../modules/pensions/schema";
import { fixtureProfile, known } from "./profile-v2-fixtures";
export const declaredPension = (): Extract<Pension, { status: "KNOWN" }> => ({ status: "KNOWN", monthlyAmount: "5000000", currency: "VND",
  priceBasis: "NOMINAL_AT_START", basisMonth: "2027-01", estimatedOn: "2026-10-01", source: "User estimate, not entitlement",
  adjustment: { kind: "NONE" } });
export const pensionProfile = () => {
  const p = fixtureProfile({ pension: declaredPension() });
  p.personal.pensionStartMonth = known("2027-01");
  p.personal.gender = "FEMALE"; p.personal.retirementCondition = { kind: "NORMAL" };
  return profileV2Schema.parse(p);
};
