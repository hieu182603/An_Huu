import { describe, expect, it } from "vitest";
import { customFixture } from "./allocation-custom-fixtures";
import { retirementCommand } from "./retirement-fixtures";
import { known } from "./profile-v2-fixtures";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { selectionExplanations } from "../modules/retirement/preview-insights";
import { separateCapital } from "../modules/capital/separation";
import { profileV2Schema } from "../modules/profiles/schema-v2";

describe("B5-3 scope rule & B6-7 personalized selection explanation", () => {
  it("B5-3 + B6-7 READY with reserved near-term goal: builds explanation from real response numbers", async () => {
    const f = await customFixture({withCash:true});
    await f.profiles.patchProfile("test-user", f.command.expectedProfileRevision, {
      schemaVersion: 2,
      goals: {
        status: "KNOWN",
        entries: [{
          id: "g_edu", label: "Học phí con", amountToday: known("100000000"),
          dueMonth: known("2027-06"), priority: known("ESSENTIAL"), deferrable: { status: "KNOWN", value: false },
        }],
      },
    });
    const preview = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: f.command.expectedProfileRevision + 1, allocationFunding: "PROTECTED_CAPITAL_V1" };
    const res: any = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, detail: "ALLOCATION_V2" } as never, "selection");

    expect(["READY", "INSUFFICIENT"], JSON.stringify(res)).toContain(res.status);
    expect(res.rule).toContain("ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION");
    expect(Array.isArray(res.explanation)).toBe(true);
    const goalRow = res.explanation.find((e: any) => e.code === "GOAL_CAPITAL_RESERVED");
    expect(goalRow).toBeTruthy();
    expect(goalRow.parameters.goalId).toBe("g_edu");
    expect(goalRow.text).toContain("Học phí con");
    expect(goalRow.text).toContain("2027-06");
    expect(goalRow.text).toContain("giữ riêng trong tiền gửi");

    const horizonRow = res.explanation.find((e: any) => e.code === "LONG_TERM_CAPITAL_HORIZON");
    expect(horizonRow).toBeTruthy();
    expect(horizonRow.parameters.retirementMonth).toBe("2027-01");
    expect(horizonRow.parameters.horizonMonths).toBe(3);

    const pickRow = res.explanation.find((e: any) => e.code === "SELECTED_CANDIDATE" || e.code === "REFERENCE_CANDIDATE");
    expect(pickRow).toBeTruthy();
    expect(pickRow.parameters.id).toBe(res.selectedId ?? res.referenceId);
  });

  it("B6-7 LOSS_REDUCED: records BINDING_CONSTRAINT for loss limit and explains selected candidate", async () => {
    const f = await customFixture();
    const profileRow = await f.db.financialProfile.findUnique({ where: { userId: "test-user" } });
    const profile = profileV2Schema.parse(profileRow!.profileData);
    const assumptions = await f.assumptions.get(f.policy.data.assumptionVersionId, true);
    const capital = separateCapital(profile, assumptions.data);

    const rows = selectionExplanations({
      profile, capital, status: "READY", threshold: "0.90", horizonMonths: 15, retirementMonth: "2027-01",
      turnoverBasis: "CURRENT_HOLDINGS",
      rejected: [{ id: "BASE", issues: ["LOSS_CONSTRAINT_EXCEEDED"] }],
      selected: { id: "LOSS_REDUCED", pEssential: 0.95, cvarEssentialShortfallToday: "0", changePoints: "12.5", turnoverFromCurrentPoints: "8" },
      referenceKind: "QUALIFIED",
      hasLossReduced: true,
    });
    const binding = rows.find(r => r.code === "BINDING_CONSTRAINT");
    expect(binding).toBeTruthy();
    expect(binding!.parameters.codes).toBe("LOSS_CONSTRAINT_EXCEEDED");
    expect(binding!.text).toContain("giới hạn lỗ");
    const picked = rows.find(r => r.code === "SELECTED_CANDIDATE");
    expect(picked!.parameters.id).toBe("LOSS_REDUCED");
    expect(picked!.text).toContain("95%");
    expect(picked!.text).toContain("90%");
  });

  it("B6-7 INSUFFICIENT: includes spec §2 invariant sentence when growth capital is negative or plan is infeasible", async () => {
    const f = await customFixture();
    await f.profiles.patchProfile("test-user", f.command.expectedProfileRevision, {
      schemaVersion: 2,
      allocationCapital: { basis: "TOTAL", totalAmount: "1000000" },
    });
    const preview = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: f.command.expectedProfileRevision + 1, allocationFunding: "PROTECTED_CAPITAL_V1" };
    const res: any = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, detail: "ALLOCATION_V2" } as never, "selection");
    expect(res.status).toBe("INSUFFICIENT");
    expect(res.rule).toContain("ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION");
    const inv = res.explanation.find((e: any) => e.code === "INFEASIBLE_PLAN_INVARIANT");
    expect(inv).toBeTruthy();
    expect(inv.text).toContain("đề xuất điều chỉnh mức góp, lùi tuổi nghỉ hưu hoặc giảm chi tiêu tùy chọn; không tăng lãi suất kỳ vọng");
  });
});
