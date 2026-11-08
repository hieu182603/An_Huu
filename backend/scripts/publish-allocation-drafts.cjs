#!/usr/bin/env node
/**
 * Công bố bộ giả định v3 + chính sách danh mục v4 (seed-data/allocation-2026-10) qua service chuẩn:
 * tạo nháp → xem tác động → phê duyệt → công bố (có audit). Chạy lại an toàn: bỏ qua bước đã xong.
 * Công bố chỉ thêm phiên bản mới để chọn; kế hoạch đã lưu giữ nguyên phiên bản đã ghim.
 *
 *   node scripts/publish-allocation-drafts.cjs --admin=<email ADMIN> --note="<ghi chú phê duyệt>" [--apply]
 */
require("dotenv").config({ override: false });
require("ts-node").register({ transpileOnly: true });
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { AssumptionsService } = require("../src/modules/assumptions/service");
const { PortfoliosService } = require("../src/modules/portfolios/service");
const { ASSUMPTION_SERIES_CODE } = require("../src/modules/assumptions/schema");
const { PORTFOLIO_POLICY_CODE } = require("../src/modules/portfolios/schema");

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=");
const apply = process.argv.includes("--apply");
const DIR = path.join(__dirname, "..", "seed-data", "allocation-2026-10");
const read = name => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

(async () => {
  const db = new PrismaClient({ log: [] });
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) {
    const tx = db.$transaction.bind(db); // DB từ xa có độ trễ cao: nới timeout transaction chỉ trong script này.
    db.$transaction = (work, opts) => typeof work === "function" ? tx(work, { ...opts, maxWait: 60000, timeout: 120000 }) : tx(work, opts);
  }
  try {
    const admin = await db.user.findUnique({ where: { email: arg("admin") || "admin@anhuu.test" } });
    if (!admin || admin.role !== "ADMIN") throw new Error("Cần --admin=<email ADMIN>.");
    const note = arg("note");
    if (apply && note.length < 10) throw new Error('Cần --note="<ghi chú phê duyệt, ≥10 ký tự>".');
    const assumptions = new AssumptionsService(db), portfolios = new PortfoliosService(db);
    const a = read("draft-assumptions-v3.json"), p = read("draft-policy-v4.json");
    const find = (modelCode, title) => db.assumptionSetVersion.findFirst({ where: { modelCode, source: { path: ["title"], equals: title } }, orderBy: { version: "desc" } })
      .then(r => r ?? db.assumptionSetVersion.findMany({ where: { modelCode }, orderBy: { version: "desc" } }).then(rows => rows.find(x => [x.values, x.policy].some(d => d?.title === title)) ?? null));

    let av = await find(ASSUMPTION_SERIES_CODE, a.title);
    console.log("Giả định v3:", av ? `${av.status} (version ${av.version})` : "chưa có");
    if (!apply) { console.log("Chính sách v4:", (await find(PORTFOLIO_POLICY_CODE, p.title))?.status ?? "chưa có"); console.log("Chạy thử. Thêm --apply để ghi."); return; }
    if (!av) av = await assumptions.create(admin.id, a);
    av = await db.assumptionSetVersion.findUniqueOrThrow({ where: { id: av.id } });
    if (av.status === "DRAFT") {
      const impact = await assumptions.previewImpact(admin.id, av.id, { expectedRevision: av.revision });
      await assumptions.approve(admin.id, av.id, { expectedRevision: av.revision, impactToken: impact.impactToken, reviewNote: note });
      av = await db.assumptionSetVersion.findUniqueOrThrow({ where: { id: av.id } });
    }
    if (av.status === "APPROVED") av = await assumptions.publish(admin.id, av.id, { expectedRevision: av.revision, confirm: true });
    console.log("✓ Giả định v3:", av.status, av.id);

    let pv = await find(PORTFOLIO_POLICY_CODE, p.title);
    if (!pv) pv = await portfolios.create(admin.id, { ...p, assumptionVersionId: av.id });
    pv = await db.assumptionSetVersion.findUniqueOrThrow({ where: { id: pv.id } });
    if (pv.status === "DRAFT") {
      const check = await portfolios.validate(pv.id);
      if (check.status !== "VALID") throw new Error("Chính sách v4 không hợp lệ: " + JSON.stringify(check.issues).slice(0, 500));
      await portfolios.approve(admin.id, pv.id, { expectedRevision: pv.revision, confirm: true, reviewNote: note });
      pv = await db.assumptionSetVersion.findUniqueOrThrow({ where: { id: pv.id } });
    }
    if (pv.status === "APPROVED") pv = await portfolios.publish(admin.id, pv.id, { expectedRevision: pv.revision, confirm: true });
    console.log("✓ Chính sách v4:", pv.status, pv.id);
  } finally { await db.$disconnect(); }
})().catch(e => { console.error("✗", e.code || "", e.message, e.details ? JSON.stringify(e.details).slice(0, 600) : ""); process.exitCode = 1; });
