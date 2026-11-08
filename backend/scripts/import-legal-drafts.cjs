#!/usr/bin/env node
/**
 * Nhập các bộ quy định lương hưu NHÁP trong seed-data/legal-2026/*.draft.json qua LegalRulesService
 * (kiểm tra schema, audit). Chỉ tạo bản DRAFT — duyệt/công bố là bước rà soát pháp lý riêng trên màn hình admin.
 *
 *   node scripts/import-legal-drafts.cjs --admin=<email ADMIN> [--apply]
 * Không --apply: chỉ in kế hoạch. Bỏ qua bộ đã có bản cùng code + documentHash.
 */
require("dotenv").config({ override: false });
require("ts-node").register({ transpileOnly: true });
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { LegalRulesService } = require("../src/modules/pensions/legal-service");
const { digest } = require("../src/common/digest");

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=");
const apply = process.argv.includes("--apply");
const dir = path.join(__dirname, "..", "seed-data", "legal-2026");
const uuidFrom = text => { const h = crypto.createHash("sha256").update(text).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

(async () => {
  const db = new PrismaClient({ log: [] });
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) {
    const tx = db.$transaction.bind(db); // DB từ xa có độ trễ cao: nới timeout transaction chỉ trong script này.
    db.$transaction = (work, opts) => typeof work === "function" ? tx(work, { ...opts, maxWait: 60000, timeout: 120000 }) : tx(work, opts);
  }
  try {
    const admin = await db.user.findUnique({ where: { email: arg("admin") || "admin@anhuu.test" } });
    if (!admin || admin.role !== "ADMIN") throw new Error("Cần --admin=<email ADMIN>.");
    const service = new LegalRulesService(db);
    const rows = [];
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".draft.json")).sort()) {
      const body = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const hash = digest(body.document);
      const existing = await db.legalRuleSetVersion.findFirst({ where: { code: body.code, documentHash: hash } });
      let action = existing ? `có sẵn v${existing.version} ${existing.status}` : "create";
      if (!existing && apply) {
        const row = await service.create(admin.id, body, uuidFrom(`legal-draft:${body.code}:${hash}`));
        action = `DRAFT v${row.version}`;
      }
      rows.push({ file, code: body.code, effectiveFrom: body.effectiveFrom, action });
    }
    console.table(rows);
    console.log(apply ? "Đã nhập. Các bộ ở trạng thái DRAFT, chưa duyệt/công bố." : "Chạy thử. Thêm --apply để ghi.");
  } finally { await db.$disconnect(); }
})().catch(e => { console.error("✗", e.code || "", e.message, e.details ? JSON.stringify(e.details).slice(0, 600) : ""); process.exitCode = 1; });
