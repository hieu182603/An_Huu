#!/usr/bin/env node
/**
 * Seed dữ liệu cho giai đoạn TEST (chỉ DB local). Chạy lại nhiều lần an toàn (idempotent).
 *
 *   SEED_PASSWORD=... node scripts/seed-test-data.cjs [--no-images] [--skip-users]
 *
 *   DB từ xa: DATABASE_URL=... node scripts/seed-test-data.cjs --allow-remote=<hostname> --admin=<email admin>
 * Phần 1 (services, actor = admin, mặc định admin@anhuu.test):
 *   - Ảnh logo đối tác / ảnh sản phẩm / ảnh bài viết: vẽ bằng Playwright → Cloudinary (CLOUDINARY_FOLDER/seed-test).
 *   - Đối tác + sản phẩm tiết kiệm/đầu tư từ seed-data/test-catalog-2026-11.json (hiển thị, đủ phí/điều kiện/công bố).
 *   - Dữ liệu đầu tư (investment_product_data) cho sản phẩm có NAV/phí rõ ràng.
 *   - Tri thức AI: cẩm nang sản phẩm (dựng từ danh mục), FAQ, kiến thức nền → index + approve.
 *     Nguồn pháp lý: chạy scripts/load-knowledge.cjs --apply trước; script này duyệt các nguồn INDEXED chưa duyệt.
 *   - Bài viết: xuất bản bài có sẵn, thêm FAQ/thuật ngữ.
 * Phần 2 (HTTP qua app in-process): người dùng mẫu với hồ sơ, kế hoạch, theo dõi, hỗ trợ, thông báo...
 */
require("dotenv").config();
require("ts-node").register({ transpileOnly: true });
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const argv = new Set(process.argv.slice(2));
const ROOT = path.join(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "seed-data", "test-catalog-2026-11.json"), "utf8"));
const KB_DIR = path.join(ROOT, "seed-data", "knowledge-test-2026-11");
const TODAY = "2026-11-08";
const REVIEW_NOTE = "Duyệt cho môi trường TEST bằng scripts/seed-test-data.cjs; cần duyệt lại trước go-live.";

function guard() {
  if (process.env.NODE_ENV === "production") throw new Error("Không chạy seed test trên production.");
  const url = new URL(process.env.DATABASE_URL || "");
  // DB từ xa (vd. Azure test) chỉ khi truyền đúng tên máy chủ: --allow-remote=<hostname>
  const remote = (process.argv.find(a => a.startsWith("--allow-remote=")) || "").split("=")[1];
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && remote !== url.hostname) throw new Error(`DB không phải local (${url.hostname}). Thêm --allow-remote=${url.hostname} nếu chắc chắn.`);
}

// ── Ảnh ─────────────────────────────────────────────────────────────────────
// Ảnh thật tìm trên mạng (trang chính thức của đối tác, Wikimedia Commons), nguồn ghi trong seed-data/test-images-2026-11.json.
const RISK = { LOW: ["Rủi ro thấp"], MEDIUM: ["Rủi ro trung bình"], HIGH: ["Rủi ro cao"] };
const IMAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "seed-data", "test-images-2026-11.json"), "utf8"));
const articleImage = category => IMAGES.articles[/đầu tư|chứng khoán|quỹ/i.test(category) ? "investment" : /tiết kiệm|tích lũy/i.test(category) ? "savings" : "planning"];

async function imageUploader() {
  if (argv.has("--no-images")) return null;
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) { console.warn("! Thiếu cấu hình Cloudinary — bỏ qua ảnh."); return null; }
  const { v2: cloudinary } = require("cloudinary");
  cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret });
  // Tải qua trình duyệt: một số trang ngân hàng chặn client không phải trình duyệt.
  const { chromium } = require(require.resolve("playwright", { paths: [ROOT, path.join(ROOT, "..", "frontend")] }));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" });
  const folder = `${process.env.CLOUDINARY_FOLDER || "anhuu"}/seed-test`;
  const cache = new Map(), failed = [];
  const upload = async (publicId, source) => {
    const url = typeof source === "string" ? source : source?.url;
    if (!url) return null;
    if (cache.has(url)) return cache.get(url);
    try {
      const pg = await ctx.newPage();
      let res, body;
      try { await pg.goto(source.page || new URL(url).origin, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        res = await pg.goto(url, { waitUntil: "load", timeout: 60000 }); body = res && await res.body(); } finally { await pg.close(); }
      if (!res) throw new Error("không có phản hồi");
      const type = res.headers()["content-type"] || "";
      if (!res.ok() || !type.startsWith("image/")) throw new Error(`HTTP ${res.status()} ${type}`);
      const result = await new Promise((resolve, reject) => cloudinary.uploader.upload_stream(
        { folder, public_id: publicId, overwrite: true, invalidate: true, resource_type: "image", ...(type.includes("svg") ? { format: "png" } : {}) },
        (e, r) => e ? reject(e) : resolve(r)).end(body));
      cache.set(url, result.secure_url);
      return result.secure_url;
    } catch (e) { failed.push(`${publicId}: ${String(e.message).split(/\r?\n/)[0]}`); cache.set(url, null); return null; }
  };
  return { upload, failed, close: () => browser.close() };
}

// ── Tri thức AI ─────────────────────────────────────────────────────────────
function productGuide() {
  const lines = ["CẨM NANG SẢN PHẨM TIẾT KIỆM VÀ ĐẦU TƯ CỦA ĐỐI TÁC AN HƯU",
    `Cập nhật ${TODAY}. Thông tin tham khảo; lãi suất, phí và NAV thay đổi theo thời kỳ, cần đối chiếu với tổ chức phát hành. Mức rủi ro là phân nhóm của An Hưu.`, ""];
  for (const p of catalog.partners) {
    const items = catalog.products.filter(x => x.partnerKey === p.key);
    if (!items.length) continue;
    lines.push(`ĐỐI TÁC: ${p.name}`);
    for (const x of items) {
      lines.push(`Sản phẩm ${x.name} (${x.category}, ${RISK[x.riskLevel][0].toLowerCase()}) của ${p.name}.`,
        `Mô tả: ${x.description}`, `Lợi nhuận kỳ vọng: ${x.expectedReturn}`, `Phí: ${x.annualFee}`, `Điều kiện: ${x.conditions}`, `Lưu ý rủi ro: ${x.disclosure}`, "");
    }
  }

  lines.push("GỢI Ý CHỌN NHÓM SẢN PHẨM",
    "Quỹ dự phòng và tiền cần dùng dưới 3 năm: tiền gửi tiết kiệm, tích lũy định kỳ (LPBank, BIDV, TPBank, Techcombank, Vietcombank).",
    "Người sắp hoặc đã nghỉ hưu cần dòng tiền ổn định: Tiết kiệm Lộc Phát An Vui (LPBank), trái phiếu (D-Bond, iBond, MBS), quỹ trái phiếu (DCBF, VFF), iPlan Thu nhập ổn định.",
    "Tích lũy dài hạn trên 5 năm, chấp nhận biến động: quỹ cân bằng (VCBF-TBF, VIBF), quỹ cổ phiếu (DCDS, VEOF), ETF VN30 (E1VFVN30, FUESSV30), D-Goal tích sản.",
    "Không dùng tiền dự phòng cho cổ phiếu, iCopy, phái sinh hay margin.");
  return lines.join("\n");
}

async function upsertKnowledge(db, knowledge, actor, source) {
  let row = await db.knowledgeSource.findFirst({ where: { title: source.title } });
  if (!row) row = await knowledge.create(actor, source);
  else if (row.rawContent !== source.rawContent) row = await knowledge.edit(actor, row.id, { expectedRevision: row.revision, data: source });
  row = await db.knowledgeSource.findUniqueOrThrow({ where: { id: row.id } });
  if (row.status !== "INDEXED") await knowledge.index(actor, row.id, { expectedRevision: row.revision });
  return row.id;
}
async function approveAllIndexed(db, knowledge, actor) {
  const rows = await db.knowledgeSource.findMany({ where: { status: "INDEXED", isApproved: false } });
  let n = 0;
  for (const r of rows) {
    if (r.validUntil && r.validUntil <= new Date()) continue;
    await knowledge.approve(actor, r.id, { expectedRevision: r.revision, approved: true, reviewNote: REVIEW_NOTE, confirm: true }); n++;
  }
  return n;
}

// ── Bài viết bổ sung ────────────────────────────────────────────────────────
const EXTRA_CONTENT = [
  { slug: "faq-an-huu-co-giu-tien-khong", kind: "FAQ", category: "Câu hỏi thường gặp", title: "An Hưu có giữ tiền hay quản lý quỹ của tôi không?",
    excerpt: "Không. An Hưu là công cụ tính toán và lập kế hoạch.", content: "An Hưu không giữ tiền, không nhận ủy thác và không quản lý quỹ của khách hàng. Khi bạn chọn một sản phẩm của đối tác, giao dịch được thực hiện trực tiếp với ngân hàng, công ty chứng khoán hoặc công ty quản lý quỹ đó." },
  { slug: "faq-quy-du-phong-bao-nhieu", kind: "FAQ", category: "Câu hỏi thường gặp", title: "Quỹ dự phòng nên bằng bao nhiêu tháng chi tiêu?",
    excerpt: "Thường từ 3 đến 6 tháng chi tiêu thiết yếu.", content: "Quỹ dự phòng thường bằng 3 đến 6 tháng chi tiêu thiết yếu, nhiều hơn nếu thu nhập không ổn định hoặc có nhiều người phụ thuộc. Nên giữ ở tiền gửi hoặc sản phẩm rút linh hoạt." },
  { slug: "faq-avalanche-snowball", kind: "FAQ", category: "Câu hỏi thường gặp", title: "Nên trả nợ theo Avalanche hay Snowball?",
    excerpt: "Avalanche tiết kiệm lãi nhất; Snowball tạo động lực nhanh.", content: "Avalanche ưu tiên khoản lãi suất cao nhất trước nên tổng tiền lãi thấp nhất. Snowball ưu tiên khoản nhỏ nhất trước để tất toán nhanh từng khoản. Dùng công cụ xem trước lộ trình trả nợ để so sánh." },
  { slug: "faq-ai-dung-du-lieu-gi", kind: "FAQ", category: "Câu hỏi thường gặp", title: "Trợ lý AI dùng dữ liệu nào của tôi?",
    excerpt: "Chỉ câu hỏi, kết quả cần giải thích và tài liệu đã duyệt.", content: "Trợ lý AI chỉ nhận câu hỏi của bạn, các kết quả hệ thống đã tính cần giải thích và trích đoạn tài liệu đã duyệt. Toàn bộ hồ sơ và thông tin liên hệ không được gửi đi. Lưu lịch sử là lựa chọn riêng và tự hết hạn sau 30 ngày." },
  { slug: "thuat-ngu-nav", kind: "GLOSSARY", category: "Thuật ngữ", title: "NAV (Giá trị tài sản ròng)", excerpt: "Giá trị tài sản ròng trên mỗi chứng chỉ quỹ.", content: "NAV là tổng tài sản của quỹ trừ nợ phải trả, chia cho số chứng chỉ quỹ đang lưu hành. Giá mua/bán chứng chỉ quỹ mở dựa trên NAV tại kỳ giao dịch." },
  { slug: "thuat-ngu-ter", kind: "GLOSSARY", category: "Thuật ngữ", title: "TER (Tổng chi phí hoạt động)", excerpt: "Tỷ lệ tổng chi phí hằng năm của quỹ.", content: "TER gồm phí quản lý, giám sát, lưu ký và chi phí khác, tính theo phần trăm NAV mỗi năm. TER càng thấp thì phần lợi nhuận giữ lại cho nhà đầu tư càng nhiều." },
  { slug: "thuat-ngu-etf", kind: "GLOSSARY", category: "Thuật ngữ", title: "ETF (Quỹ hoán đổi danh mục)", excerpt: "Quỹ mô phỏng chỉ số, giao dịch trên sàn.", content: "ETF mô phỏng một chỉ số như VN30, giao dịch như cổ phiếu, phí quản lý thường thấp hơn quỹ chủ động. Lô giao dịch trên HOSE là 100 chứng chỉ quỹ." },
  { slug: "thuat-ngu-lai-coupon", kind: "GLOSSARY", category: "Thuật ngữ", title: "Lãi coupon", excerpt: "Tiền lãi định kỳ của trái phiếu.", content: "Lãi coupon là tiền lãi tổ chức phát hành trả định kỳ cho người nắm giữ trái phiếu theo tỷ lệ ghi trong điều kiện phát hành." },
  { slug: "thuat-ngu-dca", kind: "GLOSSARY", category: "Thuật ngữ", title: "Đầu tư định kỳ (DCA)", excerpt: "Đầu tư số tiền cố định theo chu kỳ.", content: "Đầu tư định kỳ là bỏ một số tiền cố định theo tháng hoặc quý, giúp trung bình hóa giá vốn và giảm rủi ro mua đúng đỉnh." },
  { slug: "thuat-ngu-lam-phat", kind: "GLOSSARY", category: "Thuật ngữ", title: "Lạm phát", excerpt: "Mức tăng giá chung làm giảm sức mua.", content: "Lạm phát làm cùng một số tiền mua được ít hàng hóa hơn theo thời gian. Kế hoạch nghỉ hưu quy đổi chi tiêu hiện tại sang giá trị tương lai theo giả định lạm phát đã duyệt." },
  { slug: "chon-kenh-tiet-kiem-dau-tu-theo-do-tuoi", kind: "ARTICLE", category: "Đầu tư", title: "Chọn kênh tiết kiệm và đầu tư theo thời gian còn lại đến nghỉ hưu",
    excerpt: "Còn nhiều năm thì tăng trưởng, càng gần nghỉ hưu càng ưu tiên ổn định.", content: fs.readFileSync(path.join(KB_DIR, "kien-thuc-tiet-kiem-dau-tu.md"), "utf8") },
];

async function seedCatalogAndKnowledge(db, s, admin, img) {
  const partnerIds = {}, partnerRows = {};
  for (const p of catalog.partners) {
    // Tên có thể khác giữa các DB (aliases): giữ nguyên tên đang có để không tạo trùng.
    let row = await db.partner.findFirst({ where: { name: { in: [p.name, p.existingName, ...(p.aliases || [])].filter(Boolean) } } });
    const logoUrl = (img && await img.upload(`partner-${p.key}`, IMAGES.partners[p.key])) || row?.logoUrl || null;
    const data = { name: row?.name ?? p.name, type: p.type, logoUrl, website: p.website, contactEmail: null, isHighlight: p.isHighlight, isVisible: true };
    row = row ? await s.catalog.writePartner(admin, data, row.id, row.revision) : await s.catalog.writePartner(admin, data);
    partnerIds[p.key] = row.id; partnerRows[p.key] = p;
  }
  console.log(`✓ ${catalog.partners.length} đối tác (hiển thị, có logo).`);

  const productIds = {};
  const all = [...catalog.products, ...catalog.existingProducts];
  for (const prod of all) {
    const partnerId = partnerIds[prod.partnerKey];
    let row = await db.partnerProduct.findFirst({ where: { partnerId, name: { in: [prod.name, ...(prod.aliases || [])] } } });
    if (!row && !prod.category) { console.warn(`! Không thấy sản phẩm cũ: ${prod.name}`); continue; }
    const base = row ?? {};
    const merged = { category: prod.category ?? base.category, riskLevel: prod.riskLevel ?? base.riskLevel, name: prod.name };
    const imageUrl = img ? (await img.upload(`product-${prod.key || crypto.createHash("sha1").update(prod.partnerKey + prod.name).digest("hex").slice(0, 12)}`, IMAGES.products[prod.key || prod.name])) || undefined : undefined;
    const data = { partnerId, name: row?.name ?? prod.name, category: merged.category, riskLevel: merged.riskLevel,
      expectedReturn: prod.expectedReturn ?? base.expectedReturn, description: prod.description ?? base.description ?? null,
      annualFee: prod.annualFee, conditions: prod.conditions, disclosure: prod.disclosure, isVisible: true, ...(imageUrl ? { imageUrl } : {}) };
    row = row ? await s.catalog.writeProduct(admin, data, row.id, row.revision) : await s.catalog.writeProduct(admin, data);
    productIds[prod.key || prod.name] = row.id;

    if (prod.investment) {
      const inv = prod.investment, partner = partnerRows[prod.partnerKey];
      const assetClass = { TERM_DEPOSIT: "CASH", GOVERNMENT_BOND: "BOND", OPEN_BOND_FUND: "BOND", EQUITY_ETF: "EQUITY", ACTIVE_EQUITY_FUND: "EQUITY", PHYSICAL_GOLD: "GOLD" }[inv.category];
      const priceAsOf = inv.priceAsOf || TODAY;
      const document = { code: inv.code, assetClass, category: inv.category, nav: inv.nav, annualExpenseRatioPercent: inv.ter,
        liquidityDays: inv.liquidityDays, lotSize: inv.lotSize, minimumInvestmentVnd: inv.min, riskScore: inv.riskScore,
        isDistributionPermitted: true, status: "ACTIVE", sourceKind: "REVIEWED_MANUAL",
        sourceReference: prod.sourceUrl || `${partner.website} — trang sản phẩm, tra cứu ${TODAY}`, currency: "VND",
        priceAsOf, validUntil: "2027-02-08",
        distributionEvidence: "DỮ LIỆU TEST: chưa có hợp đồng phân phối; phải xác nhận với đối tác trước go-live." };
      const old = await db.investmentProductData.findUnique({ where: { productId: row.id } });
      if (!old || JSON.stringify(old.document) !== JSON.stringify(document))
        await s.recommendations.writeProduct(admin, row.id, { expectedRevision: old?.revision ?? 0, data: document });
    }
  }
  console.log(`✓ ${all.length} sản phẩm (hiển thị, có ảnh) + ${all.filter(p => p.investment).length} bản ghi dữ liệu đầu tư.`);

  // Tri thức AI
  const kb = [
    { title: "Cẩm nang sản phẩm tiết kiệm và đầu tư của đối tác An Hưu", referenceCode: "AH-PRODUCTS-2026-11", category: "PRODUCT_GUIDE", version: TODAY, rawContent: productGuide() },
    { title: "Hướng dẫn sử dụng An Hưu và câu hỏi thường gặp", referenceCode: "AH-FAQ-2026-11", category: "PLATFORM_FAQ", version: TODAY, rawContent: fs.readFileSync(path.join(KB_DIR, "anhuu-huong-dan-faq.md"), "utf8").trim() },
    { title: "Kiến thức nền về tiết kiệm và đầu tư cho nghỉ hưu", referenceCode: "AH-EDU-2026-11", category: "FINANCIAL_EDUCATION", version: TODAY, rawContent: fs.readFileSync(path.join(KB_DIR, "kien-thuc-tiet-kiem-dau-tu.md"), "utf8").trim() },
  ].map(k => ({ ...k, effectiveDate: `${TODAY}T00:00:00.000Z`, validUntil: null }));
  for (const k of kb) await upsertKnowledge(db, s.knowledge, admin, k);
  const approved = await approveAllIndexed(db, s.knowledge, admin);
  console.log(`✓ ${kb.length} nguồn tri thức nội bộ đã index; duyệt thêm ${approved} nguồn.`);

  // Bài viết
  for (const a of await db.article.findMany({ where: { kind: "ARTICLE" } })) {
    const thumbnail = (img && await img.upload(`article-${articleImage(a.category) === IMAGES.articles.investment ? "investment" : articleImage(a.category) === IMAGES.articles.savings ? "savings" : "planning"}`, articleImage(a.category))) || a.thumbnail;
    if (a.status !== "PUBLISHED" || a.thumbnail !== thumbnail)
      await s.content.write(admin, { title: a.title, slug: a.slug, excerpt: a.excerpt, content: a.content, category: a.category, authorName: a.authorName,
        thumbnail: thumbnail ?? null, kind: "ARTICLE", status: "PUBLISHED" }, a.id, a.revision);
  }
  for (const c of EXTRA_CONTENT) {
    const old = await db.article.findUnique({ where: { slug: c.slug } });
    const thumbnail = img && c.kind === "ARTICLE" ? await img.upload("article-investment", articleImage(c.category)) : null;
    const data = { ...c, authorName: "An Hưu", thumbnail, status: "PUBLISHED" };
    if (!old) await s.content.write(admin, data);
  }
  console.log(`✓ Bài viết đã xuất bản + ${EXTRA_CONTENT.length} FAQ/thuật ngữ/bài mới.`);
  return productIds;
}

async function main() {
  guard();
  const { loadEnv } = require("../src/config/env");
  const { createServices } = require("../src/modules/services");
  const config = loadEnv({ ...process.env, PREVIEW_WORKERS: "0" });
  const db = new PrismaClient({ log: [] });
  // Seed từ xa (độ trễ cao): nới timeout transaction 10s của app lên 120s, chỉ trong script này.
  const remoteDb = !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname);
  if (remoteDb) { const tx = db.$transaction.bind(db); db.$transaction = (work, opts) => typeof work === "function" ? tx(work, { ...opts, maxWait: 60000, timeout: 120000 }) : tx(work, opts); }
  const s = createServices(db, config);
  let img = null;
  try {
    const adminEmail = (process.argv.find(a => a.startsWith("--admin=")) || "--admin=admin@anhuu.test").split("=")[1];
    const admin = await db.user.findUnique({ where: { email: adminEmail } });
    if (!admin || admin.role !== "ADMIN") throw new Error(`Không thấy ADMIN ${adminEmail} — chạy npm run db:seed hoặc truyền --admin=.`);
    for (const role of ["DATA_ADMIN", "ADVISOR", "APPROVER", "OPERATIONS"])
      await db.investmentRoleGrant.upsert({ where: { userId_role: { userId: admin.id, role } }, update: {}, create: { userId: admin.id, role, grantedBy: admin.id } });
    img = await imageUploader();
    const productIds = await seedCatalogAndKnowledge(db, s, admin.id, img);
    if (!argv.has("--skip-users")) await require("./seed-test-users.cjs")({ db, s, config, admin, productIds, catalog });
  } finally {
    if (img?.failed.length) console.warn("! Không tải được:\n  " + img.failed.join("\n  "));
    await img?.close();
    await s.previewPool?.close?.();
    await db.$disconnect();
  }
}
main().catch(e => { console.error("✗", e.code || "", e.message, e.details ? JSON.stringify(e.details).slice(0, 800) : ""); process.exitCode = 1; });
