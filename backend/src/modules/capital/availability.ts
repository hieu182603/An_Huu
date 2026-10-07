import { z } from "zod";
import { dateSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { digest } from "../../common/digest";
import { AppError } from "../../common/errors";
import { RetirementDecimal as D } from "../retirement/engine";

export const capitalAvailabilitySchema = z.object({ amountScope: z.literal("NET_SOURCE_SHARE"), releases: z.array(z.object({
  releaseId: z.string().uuid(), availableOn: dateSchema, amount: moneySchema, status: z.enum(["CONFIRMED", "EXPECTED"]),
  evidence: z.array(z.object({ reference: z.string().trim().min(1).max(1000), contentHash: z.string().regex(/^[a-f0-9]{64}$/), confirmedOn: dateSchema }).strict()).min(1).max(20),
}).strict()).min(1).max(200) }).strict();
type Availability = z.infer<typeof capitalAvailabilitySchema>;
const fail = (code: string): never => { throw new AppError(422, code, "Cần đối chiếu từng đợt tiền sẵn có trước khi góp vào quỹ."); };

export function assertAvailabilityHistory(previous: Availability | undefined, current: Availability | undefined) {
  if (!previous) return;
  if (!current) fail("ASSET_AVAILABILITY_HISTORY_REQUIRED");
  for (const release of previous.releases.filter(r => r.status === "CONFIRMED")) {
    const next = current!.releases.find(r => r.releaseId === release.releaseId);
    if (!next || digest(next) !== digest(release)) fail("ASSET_CONFIRMED_RELEASE_IMMUTABLE");
  }
}

/** Availability is an evidenced outside-fund cash declaration. It never creates
 * a fund event; actual contributions require confirmed releases by booked date. */
export function assertCapitalAvailability(input: {
  availability: Availability; availableOn: string; limit: InstanceType<typeof D>; knownOn: string; cutoff: string; liquidity: "AVAILABLE" | "PLANNED_RELEASE";
  receipts: Array<{ bookedOn: string; amount: string }>;
  planned: Array<{ month: string; amount: string }>;
}) {
  const { availability: { releases }, availableOn, limit, knownOn, cutoff, liquidity, receipts, planned } = input;
  const ids = new Set<string>();
  for (const r of releases) {
    if (ids.has(r.releaseId) || new D(r.amount).lte(0) || r.evidence.some(e => e.confirmedOn > knownOn)) fail("ASSET_RELEASE_INVALID");
    ids.add(r.releaseId);
    if (r.status === "CONFIRMED" && (r.availableOn > knownOn || !r.evidence.some(e => e.confirmedOn >= r.availableOn))) fail("ASSET_RELEASE_CONFIRMATION_INVALID");
  }
  if (availableOn !== [...releases].sort((a, b) => a.availableOn.localeCompare(b.availableOn))[0].availableOn ||
    (liquidity === "AVAILABLE" && releases.some(r => r.status !== "CONFIRMED"))) fail("ASSET_RELEASE_AVAILABILITY_MISMATCH");
  if (releases.reduce((sum, r) => sum.plus(r.amount), new D(0)).gt(limit)) fail("ASSET_RELEASE_LIMIT_EXCEEDED");
  let used = new D(0);
  for (const receipt of [...receipts].sort((a, b) => a.bookedOn.localeCompare(b.bookedOn))) {
    used = used.plus(receipt.amount);
    const confirmed = releases.filter(r => r.status === "CONFIRMED" && r.availableOn <= receipt.bookedOn).reduce((sum, r) => sum.plus(r.amount), new D(0));
    if (used.gt(confirmed)) fail("ASSET_RECEIPT_BEFORE_RELEASE");
  }
  if (releases.some(r => r.status === "EXPECTED" && r.availableOn.slice(0, 7) <= cutoff)) fail("ASSET_RELEASE_RECONCILIATION_REQUIRED");
  for (const installment of [...planned].sort((a, b) => a.month.localeCompare(b.month))) {
    used = used.plus(installment.amount);
    // Contributions are month-end only: a release later in the same month is
    // usable then, but one dated in the next month is not.
    const available = releases.filter(r => r.availableOn.slice(0, 7) <= installment.month).reduce((sum, r) => sum.plus(r.amount), new D(0));
    if (used.gt(available)) fail("ASSET_PLANNED_CONTRIBUTION_BEFORE_RELEASE");
  }
}
