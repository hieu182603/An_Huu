import { describe, expect, it } from "vitest";
import { customFixture } from "./allocation-custom-fixtures";
import { retirementCommand } from "./retirement-fixtures";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { AppError } from "../common/errors";

async function withThresholdRange(range?: { min: string; max: string }) {
  const f = await customFixture();
  let policyId = f.policy.id;
  if (range) {
    if (f.policy.data.schemaVersion !== 2) throw new Error("Expected schema v2 policy");
    const policy = await f.portfolios.create("test-admin", {
      ...f.policy.data,
      allocationRisk: { ...f.policy.data.allocationRisk!, essentialThresholdRange: range },
    });
    await f.portfolios.approve("test-admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "B6-8 custom range" });
    await f.portfolios.publish("test-admin", policy.id, { expectedRevision: 2, confirm: true });
    policyId = policy.id;
  }
  const preview = { ...retirementCommand(policyId), ...f.command, policyVersionId: policyId, allocationFunding: "PROTECTED_CAPITAL_V1" };
  return { service: new AllocationRiskService(f.db), preview };
}

describe("B6-8 customer-chosen essentialThreshold override", () => {
  it("uses policy default when omitted, accepts 0.92 in default [0.90, 0.95], and rejects 0.85 / 0.98 with 422", async () => {
    const { service, preview } = await withThresholdRange();

    const defaulted: any = await service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20 } as never, "selection");
    expect(defaulted.threshold).toBe("0.9");

    const chosen: any = await service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, essentialThreshold: "0.92" } as never, "selection");
    expect(chosen.threshold).toBe("0.92");

    for (const bad of ["0.85", "0.98"]) {
      await expect(service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, essentialThreshold: bad } as never, "selection"))
        .rejects.toSatisfy((err: unknown) => err instanceof AppError && err.status === 422 && err.code === "ESSENTIAL_THRESHOLD_OUT_OF_RANGE");
    }
  });

  it("enforces custom policy essentialThresholdRange when configured", async () => {
    const { service, preview } = await withThresholdRange({ min: "0.85", max: "0.92" });

    const ok: any = await service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, essentialThreshold: "0.86" } as never, "selection");
    expect(ok.threshold).toBe("0.86");

    await expect(service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, essentialThreshold: "0.94" } as never, "selection"))
      .rejects.toSatisfy((err: unknown) => err instanceof AppError && err.status === 422 && err.code === "ESSENTIAL_THRESHOLD_OUT_OF_RANGE");
  });
});
