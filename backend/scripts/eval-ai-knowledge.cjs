#!/usr/bin/env node
/**
 * Read-only check: does the assistant retrieve the right approved document for typical customer questions?
 *
 *   node scripts/eval-ai-knowledge.cjs             # summary + misses
 *   node scripts/eval-ai-knowledge.cjs --verbose   # every question with its top excerpt
 *   node scripts/eval-ai-knowledge.cjs --min=0.9   # exit 1 when hit@4 is below 90%
 *   node scripts/eval-ai-knowledge.cjs --preview-manifest=seed-data/knowledge-test-2026-11/knowledge-manifest.json
 *                                                  # also read that manifest's texts IN MEMORY, as if loaded and approved
 *
 * Uses DATABASE_URL, only SELECTs (KnowledgeService.retrieve). No provider call, no writes.
 * Questions: seed-data/knowledge-eval/questions.json.
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: false });
require("ts-node").register({ transpileOnly: true, project: path.join(__dirname, "..", "tsconfig.json") });
const { PrismaClient } = require("@prisma/client");
const { KnowledgeService, sourceHash } = require("../src/modules/ai/knowledge");
const { previewView, argument } = require("./lib-knowledge-preview.cjs");
const { questions } = require("../seed-data/knowledge-eval/questions.json");

const verbose = process.argv.includes("--verbose"), min = Number(argument("min") || 0);
const matches = (item, hit) => new RegExp(item.expect, "u").test(hit.content) && (!item.expectTitle || new RegExp(item.expectTitle, "u").test(hit.title));

(async () => {
  const db = new PrismaClient();
  const service = new KnowledgeService(db), { view, titles } = previewView(db, sourceHash, argument("preview-manifest"));
  if (titles.length) console.log(`Xem trước ${titles.length} tài liệu (không ghi DB): ${titles.join("; ")}`);
  try {
    let top1 = 0, top4 = 0; const misses = [];
    for (const item of questions) {
      const started = Date.now();
      const hits = await service.retrieve(view, item.q);
      const rank = hits.findIndex(h => matches(item, h));
      if (rank === 0) top1++;
      if (rank >= 0) top4++; else misses.push({ item, hits });
      if (verbose) console.log(`${rank === 0 ? "✓" : rank > 0 ? "~" : "✗"} [${item.topic}] ${item.q}\n    ${hits.length} đoạn, ${Date.now() - started}ms, đúng ở vị trí ${rank < 0 ? "—" : rank + 1}`
        + hits.map((h, i) => `\n    ${i + 1}. (${h.score}, khớp ${Math.round(h.coverage * 100)}%) ${h.title.slice(0, 70)} :: ${h.content.replace(/\s+/g, " ").slice(0, 110)}`).join(""));
    }
    console.log(`\nĐúng ở đoạn đầu: ${top1}/${questions.length} (${Math.round(top1 / questions.length * 100)}%)`);
    console.log(`Đúng trong các đoạn được chọn: ${top4}/${questions.length} (${Math.round(top4 / questions.length * 100)}%)`);
    for (const { item, hits } of misses) console.log(`✗ [${item.topic}] ${item.q}\n    lấy: ${hits.map(h => h.title.slice(0, 60)).join(" | ") || "(không có đoạn nào)"}`);
    if (min && top4 / questions.length < min) process.exitCode = 1;
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
