import { describe, expect, it } from "vitest";
import { OperationsService, dailyBuckets } from "../modules/operations/service";

describe("admin overview", () => {
  it("buckets signups by Vietnam calendar day, oldest first", () => {
    const now = new Date("2026-10-14T10:00:00Z"); // 17:00 in Vietnam
    const rows = dailyBuckets([new Date("2026-10-13T18:30:00Z"), new Date("2026-10-14T01:00:00Z"), new Date("2026-10-13T16:00:00Z"), new Date("2026-09-01T00:00:00Z")], 3, now);
    // 2026-10-13T18:30Z and 2026-10-14T01:00Z are both 14/10 in UTC+7; 16:00Z is 23:00 on 13/10.
    expect(rows).toEqual([{ date: "2026-10-12", count: 0 }, { date: "2026-10-13", count: 1 }, { date: "2026-10-14", count: 2 }]);
  });

  it("aggregates counts into one payload", async () => {
    const group = (key: string, rows: [unknown, number][]) => rows.map(([v, n]) => ({ [key]: v, _count: { _all: n } }));
    const model = (over: Record<string, unknown> = {}) => ({ count: async () => 3, findMany: async () => [], findFirst: async () => null, groupBy: async () => [], ...over });
    const db: any = {
      user: model({ groupBy: async () => group("status", [["ACTIVE", 8], ["SUSPENDED", 2]]) }),
      financialProfile: model(), retirementPlan: model({ groupBy: async () => [{ userId: "a" }, { userId: "b" }] }),
      loginLog: model({ groupBy: async () => [{ userId: "a" }] }), supportTicket: model({ groupBy: async () => group("status", [["OPEN", 4]]) }),
      consultation: model(), article: model(), knowledgeSource: model({ groupBy: async () => group("status", [["INDEXED", 30], ["PENDING", 3]]) }),
      aiConversation: model(), aiMessage: model(), legalRuleSetVersion: model(), assumptionSetVersion: model(),
      partner: model({ groupBy: async () => group("isVisible", [[true, 5], [false, 2]]) }), partnerProduct: model(), systemLog: model(), auditLog: model(),
      outboxEvent: model(),
    };
    const s = await new OperationsService(db).summary();
    expect(s.users).toMatchObject({ total: 10, byStatus: { ACTIVE: 8, SUSPENDED: 2 }, withPlan: 2, active7d: 1 });
    expect(s.users.signups14d).toHaveLength(14);
    expect(s.support.byStatus).toEqual({ OPEN: 4 });
    expect(s.ai.knowledge).toEqual({ byStatus: { INDEXED: 30, PENDING: 3 }, approved: 3 });
    expect(s.catalog.partners).toEqual({ total: 7, visible: 5 });
  });
});

describe("admin period report", () => {
  it("pairs current vs previous window and merges daily series", async () => {
    const count = async ({ where }: any) => (where?.createdAt?.lt ? 2 : 5);
    const findMany = async () => [{ createdAt: new Date() }];
    const groupBy = async ({ by }: any) => by[0] === "userId" ? [{ userId: "a" }] : by[0] === "action" ? [{ action: "AUTH_LOGIN", _count: { _all: 9 } }] : [{ [by[0]]: "X", _count: { _all: 4 } }];
    const model = { count, findMany, groupBy };
    const db: any = new Proxy({}, { get: () => model });
    const r = await new OperationsService(db).report(7);
    expect(r.kpis.signups).toEqual({ current: 5, previous: 2 });
    expect(r.kpis.activeUsers).toEqual({ current: 1, previous: 1 });
    expect(r.series).toHaveLength(7);
    expect(r.series[6]).toMatchObject({ signups: 1, logins: 1, aiQuestions: 1, tickets: 1 });
    expect(r.series[0]).toMatchObject({ signups: 0 });
    expect(r.adminActions).toEqual([{ action: "AUTH_LOGIN", count: 9 }]);
    expect(r.support.byStatus).toEqual({ X: 4 });
  });
});
