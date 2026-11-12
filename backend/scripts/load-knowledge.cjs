#!/usr/bin/env node
/**
 * Load the official legal texts listed in seed-data/legal-2026/knowledge-manifest.json
 * into the AI knowledge base through KnowledgeService (validation, revisions, audit log).
 *
 *   node scripts/load-knowledge.cjs --actor=<ADMIN user id>            # dry run: prints the plan
 *   node scripts/load-knowledge.cjs --actor=<ADMIN user id> --apply    # create/edit + index
 *   node scripts/load-knowledge.cjs --manifest=seed-data/knowledge-test-2026-11/knowledge-manifest.json --actor=<id> --apply --approve
 *                                     # another manifest (texts in its "textDir"); --approve also approves ITS sources
 *
 * Uses DATABASE_URL from the environment. Without --approve sources end INDEXED and NOT approved:
 * approval remains an explicit admin review in the AI configuration screen. --approve records that
 * review for the sources of the given manifest only (review note below), under the --actor admin.
 * Texts longer than the 50,000-character source limit are split at "Điều" boundaries.
 */
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env"), override: false });
require("ts-node").register({ transpileOnly: true, project: require("node:path").join(__dirname, "..", "tsconfig.json") });
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { KnowledgeService } = require("../src/modules/ai/knowledge");

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=");
const apply = process.argv.includes("--apply"), approve = process.argv.includes("--approve");
const REVIEW_NOTE = "Đã đối chiếu nội dung với văn bản đã ban hành trong kho nguồn; duyệt qua scripts/load-knowledge.cjs --approve.";
const actor = arg("actor");
const manifestPath = arg("manifest") ? path.resolve(arg("manifest")) : path.join(__dirname, "..", "seed-data", "legal-2026", "knowledge-manifest.json");
const root = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const LIMIT = 45000;

function tidy(text) {
  return text.replace(/\[pic\]/g, "").split("\n").filter(l => !/^\s*(\|\s*)+$/.test(l)).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}
/** Split at "Điều n" headings (or blank lines as a fallback) into parts ≤ LIMIT chars. */
function split(text) {
  if (text.length <= LIMIT) return [text];
  const blocks = text.split(/\n(?=\s*Điều\s+\d+[a-zđ]?\.)/u);
  const parts = []; let current = "";
  const push = () => { if (current.trim()) parts.push(current.trim()); current = ""; };
  for (const block of blocks) {
    if (block.length > LIMIT) { // a single huge block (e.g. appendix): cut on paragraph breaks
      push();
      let rest = block;
      while (rest.length > LIMIT) { const cut = rest.lastIndexOf("\n\n", LIMIT) > LIMIT / 2 ? rest.lastIndexOf("\n\n", LIMIT) : rest.lastIndexOf("\n", LIMIT); parts.push(rest.slice(0, cut).trim()); rest = rest.slice(cut); }
      current = rest; continue;
    }
    if ((current + "\n" + block).length > LIMIT) push();
    current += (current ? "\n" : "") + block;
  }
  push();
  return parts;
}
const articleRange = part => {
  const nums = [...part.matchAll(/(?:^|\n)\s*Điều\s+(\d+[a-zđ]?)\./gu)].map(m => m[1]);
  return nums.length ? (nums[0] === nums[nums.length - 1] ? `Điều ${nums[0]}` : `Điều ${nums[0]}–${nums[nums.length - 1]}`) : null;
};
const iso = d => new Date(`${d}T00:00:00.000Z`).toISOString();

(async () => {
  if (!actor) throw new Error("--actor=<ADMIN user id> is required (recorded in the audit log).");
  const db = new PrismaClient();
  const service = new KnowledgeService(db);
  try {
    const admin = await db.user.findUnique({ where: { id: actor }, select: { role: true, status: true } });
    if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") throw new Error("--actor must be an ACTIVE ADMIN user id.");
    const rows = [];
    for (const src of manifest.sources) {
      const text = tidy(fs.readFileSync(path.join(root, manifest.textDir ?? "sources-kb-text", src.text), "utf8"));
      const parts = split(text);
      for (let i = 0; i < parts.length; i++) {
        const range = articleRange(parts[i]);
        const suffix = parts.length > 1 ? ` — Phần ${i + 1}/${parts.length}${range ? ` (${range})` : ""}` : "";
        const title = (src.title.length + suffix.length > 200 ? src.title.slice(0, 200 - suffix.length - 1) + "…" : src.title) + suffix;
        const data = { title, referenceCode: src.referenceCode, category: src.category, version: src.version, rawContent: parts[i],
          fileUrl: src.fileUrl, effectiveDate: iso(src.effectiveDate), validUntil: src.validUntil ? iso(src.validUntil) : null };
        const lookup = i === 0 && src.replaceTitle ? [title, src.replaceTitle] : [title];
        const existing = await db.knowledgeSource.findFirst({ where: { title: { in: lookup } }, orderBy: { createdAt: "asc" } });
        const same = existing && existing.rawContent === data.rawContent && existing.title === title && existing.status === "INDEXED"
          && (existing.fileUrl ?? null) === (data.fileUrl ?? null) && existing.effectiveDate?.toISOString() === data.effectiveDate;
        const action = !existing ? "create" : same ? "unchanged" : "update";
        rows.push({ action, title: title.slice(0, 90), chars: parts[i].length });
        if (!apply) continue;
        let source = existing;
        if (action !== "unchanged") {
          source = action === "create" ? await service.create(actor, data)
            : await service.edit(actor, existing.id, { expectedRevision: existing.revision, data });
          source = await service.index(actor, source.id, { expectedRevision: source.revision });
        }
        if (approve && !source.isApproved)
          source = await service.approve(actor, source.id, { expectedRevision: source.revision, approved: true, reviewNote: REVIEW_NOTE, confirm: true });
        rows[rows.length - 1].status = `${source.status} r${source.revision}${source.isApproved ? " đã duyệt" : ""}`;
      }
    }
    console.table(rows);
    console.log(!apply ? "Dry run only. Re-run with --apply to write." : approve ? "Applied and approved." : "Applied. Sources are INDEXED, not approved.");
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
