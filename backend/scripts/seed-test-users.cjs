// Phần 2 của seed-test-data.cjs: người dùng mẫu đi qua API thật (supertest, app in-process, không mock).
// Mật khẩu: SEED_PASSWORD trong backend/.env (tự sinh và ghi vào .env nếu chưa có).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const request = require("supertest");

const known = value => ({ status: "KNOWN", value });
const unknown = { status: "UNKNOWN" };
const VALUATION = "2026-10-31";

// Chân dung theo tài liệu dự án: người đi làm 35+, "thế hệ kẹp", sắp nghỉ hưu...
const PERSONAS = [
  { email: "minh.anh@anhuu.test", fullName: "Nguyễn Minh Anh", city: "Hà Nội", birth: "1976-03", retire: "2036-03", income: "32000000", essential: "14000000", lifestyle: "5000000",
    deposit: "450000000", fund: "120000000", debt: null, risk: [1, 2, 1, 1, 1, 1], contribution: "8000000", loss: { percent: "20", amount: "100000000", reaction: "HOLD" }, stability: "STABLE", note: "52 tuổi, ưu tiên an toàn" },
  { email: "hoang.nam@anhuu.test", fullName: "Trần Hoàng Nam", city: "TP. Hồ Chí Minh", birth: "1981-07", retire: "2040-07", income: "45000000", essential: "22000000", lifestyle: "6000000",
    deposit: "150000000", fund: "60000000", debt: { label: "Vay mua nhà", balance: "1200000000", payment: "15000000", end: "2038-12" }, risk: [2, 2, 1, 2, 2, 1], contribution: "5000000", loss: { percent: "25", amount: "20000000", reaction: "HOLD" }, stability: "STABLE", note: "Thế hệ kẹp, đang trả nợ nhà" },
  { email: "thu.ha@anhuu.test", fullName: "Lê Thị Thu Hà", city: "Đà Nẵng", birth: "1970-11", retire: "2030-11", income: "25000000", essential: "12000000", lifestyle: "3000000",
    deposit: "900000000", fund: "0", debt: null, risk: [0, 0, 0, 0, 0, 1], contribution: "7000000", loss: { percent: "5", amount: "30000000", reaction: "SELL" }, stability: "STABLE", note: "Sắp nghỉ hưu, cần dòng tiền ổn định" },
  { email: "quoc.bao@anhuu.test", fullName: "Phạm Quốc Bảo", city: "Hà Nội", birth: "1988-01", retire: "2040-12", income: "60000000", essential: "20000000", lifestyle: "12000000",
    deposit: "200000000", fund: "350000000", debt: { label: "Vay mua ô tô", balance: "300000000", payment: "9000000", end: "2029-06" }, risk: [3, 3, 2, 3, 3, 2], contribution: "12000000", loss: { percent: "30", amount: "200000000", reaction: "BUY_MORE" }, stability: "VARIABLE", note: "Tăng trưởng, chấp nhận rủi ro" },
  { email: "ngoc.mai@anhuu.test", fullName: "Hoàng Ngọc Mai", city: "Cần Thơ", birth: "1978-05", retire: "2038-05", income: "28000000", essential: "15000000", lifestyle: "4000000",
    deposit: "250000000", fund: "80000000", debt: null, risk: [2, 2, 1, 2, 1, 1], contribution: "6000000", loss: { percent: "20", amount: "60000000", reaction: "HOLD" }, stability: "STABLE", note: "Cân bằng, có cha mẹ phụ thuộc" },
  { email: "khanh.linh@anhuu.test", fullName: "Võ Khánh Linh", city: "Huế", birth: "1985-09", draftOnly: true, note: "Mới đăng ký, onboarding dở dang" },
];

function profileOf(p) {
  const assets = [{ id: "deposit", label: "Tiền gửi tiết kiệm", type: "DEPOSIT", value: known(p.deposit), currency: "VND", valuedOn: known(VALUATION),
    ownershipShare: known("1"), retirementShare: known("0.7"), emergencyShare: known("0.3"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }];
  if (p.fund !== "0") assets.push({ ...assets[0], id: "fund", label: "Chứng chỉ quỹ mở", type: "STOCK_FUND", value: known(p.fund), retirementShare: known("1"), emergencyShare: known("0") });
  return { schemaVersion: 2, valuationDate: VALUATION, currency: "VND", periodUnit: "MONTH",
    personal: { birthMonth: known(p.birth), desiredRetirementMonth: known(p.retire), pensionStartMonth: unknown },
    incomeStability: known(p.stability || "STABLE"), goals: { status: "KNOWN", entries: [] }, lossTolerance: { percent: known(p.loss?.percent || "10"), amountVnd: known(p.loss?.amount || "50000000"), reaction: known(p.loss?.reaction || "HOLD") },
    income: { status: "KNOWN", entries: [{ id: "salary", label: "Lương sau thuế", kind: "FIXED", basis: "DISPOSABLE", amount: known(p.income), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] },
    expenses: { status: "KNOWN", entries: [
      { id: "essential", label: "Chi tiêu thiết yếu", category: "ESSENTIAL", amount: known(p.essential), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null },
      { id: "lifestyle", label: "Chi tiêu khác", category: "OPTIONAL", amount: known(p.lifestyle), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] },
    assets: { status: "KNOWN", entries: assets },
    debts: p.debt ? { status: "KNOWN", entries: [{ id: "loan", label: p.debt.label, outstandingBalance: known(p.debt.balance), balanceAsOf: known(VALUATION), currency: "VND",
      payment: known(p.debt.payment), paymentShare: known("1"), balanceShare: known("1"), responsibility: unknown, frequency: "MONTHLY", startMonth: "2026-01", endMonth: p.debt.end }] }
      : { status: "KNOWN", entries: [] } };
}

function ensurePassword() {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD;
  const pw = "Ah-test-" + crypto.randomBytes(9).toString("base64url");
  fs.appendFileSync(path.join(__dirname, "..", ".env"), `\n# Mật khẩu chung cho tài khoản test *@anhuu.test do seed-test-users.cjs tạo\nSEED_PASSWORD="${pw}"\n`);
  process.env.SEED_PASSWORD = pw;
  console.log("✓ Đã sinh SEED_PASSWORD và ghi vào backend/.env");
  return pw;
}

module.exports = async function seedUsers({ db, s, config, admin, productIds }) {
  const { createApp } = require("../src/app");
  const app = createApp({ config, services: s });
  const info = console.info, log = console.log; console.info = () => {};
  const quiet = line => typeof line === "string" && line.startsWith("{\"time\"");
  console.log = (...a) => { if (!quiet(a[0])) log(...a); };
  const password = ensurePassword();
  const hash = await bcrypt.hash(password, 12);
  const call = async (token, method, url, body, expect = [200, 201]) => {
    let r = request(app)[method]("/api/v1" + url).set("Authorization", "Bearer " + token).set("Idempotency-Key", crypto.randomUUID()).set("X-CSRF-Protection", "1");
    if (body !== undefined) r = r.send(body);
    const res = await r;
    if (!expect.includes(res.status)) { const e = new Error(`${method.toUpperCase()} ${url} → ${res.status} ${res.body?.error?.code ?? ""} ${res.body?.error?.message ?? ""}`); e.details = res.body?.error?.details; throw e; }
    return res.body.data;
  };
  const login = async email => {
    const res = await request(app).post("/api/v1/auth/login").set("X-CSRF-Protection", "1").send({ email, password, remember: false });
    if (res.status !== 200) throw new Error(`Đăng nhập ${email} thất bại: ${res.status} ${res.body?.error?.code}`);
    return res.body.data.accessToken;
  };

  const policy = await db.assumptionSetVersion.findFirst({ where: { modelCode: "portfolio-policy-v1", status: "PUBLISHED" }, orderBy: { version: "desc" } });
  const questions = [policy.values, policy.policy].find(v => v && v.questions).questions;
  const productList = Object.values(productIds);
  const articles = await db.article.findMany({ where: { status: "PUBLISHED", kind: "ARTICLE" }, select: { id: true } });
  const summary = [];

  for (const [i, p] of PERSONAS.entries()) {
    const initials = p.fullName.split(" ").slice(-2).map(w => w[0]).join("");
    let user = await db.user.findUnique({ where: { email: p.email } });
    if (!user) user = await db.user.create({ data: { email: p.email, fullName: p.fullName, initials, city: p.city, role: "USER", status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: hash } });
    else if (!(await bcrypt.compare(password, user.passwordHash))) await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    const token = await login(p.email);
    const done = [];

    // Hồ sơ tài chính
    if (!await db.financialProfile.findUnique({ where: { userId: user.id } })) {
      const draft = await db.onboardingDraft.findUnique({ where: { userId: user.id } });
      const profile = p.draftOnly ? { ...profileOf({ ...PERSONAS[0], birth: p.birth }), } : profileOf(p);
      const saved = await call(token, "put", "/me/onboarding-draft", { expectedRevision: draft?.revision ?? 0, step: p.draftOnly ? "income" : "summary", data: profile });
      if (!p.draftOnly) await call(token, "post", "/me/onboarding/complete", { expectedDraftRevision: saved.revision, expectedProfileRevision: 0 });
      done.push(p.draftOnly ? "nháp onboarding" : "hồ sơ");
    }
    if (p.draftOnly) { summary.push({ email: p.email, persona: p.note, done: done.join(", ") }); continue; }

    // Hồ sơ tạo bằng bản seed cũ thiếu 2 trường bộ máy đề xuất cần → bổ sung qua API.
    let fp = await db.financialProfile.findUnique({ where: { userId: user.id } });
    if (!fp.profileData?.incomeStability || !fp.profileData?.goals || fp.profileData?.lossTolerance?.percent?.value !== (p.loss?.percent || "10")) {
      await call(token, "patch", "/me/financial-profile", { expectedRevision: fp.revision, changes: { schemaVersion: 2, incomeStability: known(p.stability), goals: { status: "KNOWN", entries: [] }, lossTolerance: { percent: known(p.loss?.percent || "10"), amountVnd: known(p.loss?.amount || "50000000"), reaction: known(p.loss?.reaction || "HOLD") } } });
      fp = await db.financialProfile.findUnique({ where: { userId: user.id } });
      done.push("bổ sung hồ sơ");
    }

    // Kế hoạch nghỉ hưu: xem trước → lưu → áp dụng (tạo phiên bản mới nếu hồ sơ đã đổi)
    const answers = questions.map((q, k) => ({ questionId: q.id, choiceId: q.choices[Math.min(p.risk[k] ?? 0, q.choices.length - 1)].id }));
    const preview = { expectedProfileRevision: fp.revision, policyVersionId: policy.id, scenario: "BASE", answers, liquidityNeedMonths: 6,
      endMonth: p.retire, monthlyExpenseToday: String(Number(p.essential) + Number(p.lifestyle)), monthlyContribution: p.contribution, monthlyReserve: "0", retirementIncomeIds: [] };
    const evaluate = async () => {
      const evaluated = await call(token, "post", "/me/retirement/preview", preview);
      if (evaluated.status !== "READY") throw new Error(`${p.email}: preview ${evaluated.status} ${JSON.stringify(evaluated.issues ?? evaluated.blockers ?? "").slice(0, 400)}`);
      return evaluated;
    };
    let plan = await db.retirementPlan.findFirst({ where: { userId: user.id } });
    if (!plan) {
      const evaluated = await evaluate();
      const created = await call(token, "post", "/me/retirement/plans", { expectedRevision: 0, expectedInputHash: evaluated.inputHash, preview });
      await call(token, "post", `/me/retirement/plans/${created.planId}/apply`, { versionId: created.saved.id, expectedRevision: 1, expectedProfileRevision: fp.revision, confirm: true });
      plan = await db.retirementPlan.findUnique({ where: { id: created.planId } });
      done.push("kế hoạch");
    } else {
      const current = plan.currentVersionId && await db.planVersion.findUnique({ where: { id: plan.currentVersionId } });
      if (plan.stale || !current || current.profileRevision !== fp.revision || current.inputSnapshot?.preview?.selection?.policyVersionId !== policy.id) {
        const evaluated = await evaluate();
        const saved = await call(token, "post", `/me/retirement/plans/${plan.id}/versions`, { expectedRevision: plan.revision, expectedInputHash: evaluated.inputHash, preview });
        await call(token, "post", `/me/retirement/plans/${plan.id}/apply`, { versionId: saved.saved.id, expectedRevision: plan.revision + 1, expectedProfileRevision: fp.revision, confirm: true });
        plan = await db.retirementPlan.findUnique({ where: { id: plan.id } });
        done.push("kế hoạch v mới");
      }
    }

    // Theo dõi thực tế 2 tháng gần nhất
    if (!await db.actualMonth.findFirst({ where: { userId: user.id } })) {
      const opening = Number(p.deposit) * 0.7 + Number(p.fund);
      let bal = opening;
      for (const [k, period] of ["2026-09", "2026-10"].entries()) {
        const contribution = Number(p.contribution) - (k === 1 ? 1000000 : 0), income = Math.round(bal * 0.004);
        const entries = [{ eventId: crypto.randomUUID(), date: `${period}-05`, kind: "CONTRIBUTION", amount: String(contribution) },
          { eventId: crypto.randomUUID(), date: `${period}-28`, kind: "INVESTMENT_INCOME", amount: String(income) }];
        const close = bal + contribution + income;
        await call(token, "put", `/me/retirement/actuals/${period}`, { expectedRevision: 0, data: { currency: "VND", openingBalance: String(bal), closingBalance: String(close), entries, correctionReason: "Dữ liệu test" } });
        bal = close;
      }
      done.push("theo dõi 2 tháng");
    }

    // Đồng ý AI, cài đặt thông báo
    const priv = await call(token, "get", "/me/ai/privacy");
    if (!priv.processing) await call(token, "put", "/me/ai/privacy", { expectedRevision: priv.revision, policyVersion: priv.policyVersion, processing: true, saveHistory: i % 2 === 0 });
    const ns = await call(token, "get", "/me/notification-settings");
    if (ns.revision === 0) await call(token, "put", "/me/notification-settings", { expectedRevision: 0, emailDigest: true, goalAlerts: true, partnerUpdates: i % 2 === 1 });
    if (i % 2 === 0 && !await db.aiConversation.findFirst({ where: { userId: user.id } })) await call(token, "post", "/me/ai/conversations", {});

    // Lưu sản phẩm/bài viết, yêu cầu tư vấn
    for (const pid of productList.slice(i * 3, i * 3 + 3)) await call(token, "put", `/me/saved-products/${pid}`, {}, [200, 201, 204]);
    for (const a of articles.slice(i, i + 2)) await call(token, "put", `/me/saved-articles/${a.id}`, {}, [200, 201, 204]);
    if (!await db.supportTicket.findFirst({ where: { userId: user.id, subject: { startsWith: "Tư vấn:" } } }))
      await call(token, "post", `/me/products/${productList[i * 2]}/consult`, { message: "Tôi muốn được tư vấn thêm về sản phẩm này cho kế hoạch nghỉ hưu.", channel: i % 2 ? "EMAIL" : "PHONE", phone: "0900000" + String(100 + i), consent: true });
    done.push("lưu SP/bài viết, tư vấn");

    // Danh mục nắm giữ (thông tin)
    const invested = await db.investmentProductData.findMany({ select: { productId: true, document: true }, take: 20 });
    if (!await db.investmentHolding.findFirst({ where: { userId: user.id } })) {
      for (const h of invested.filter((_, k) => k % 3 === i % 3).slice(0, 2)) {
        const nav = Number(h.document.nav), qty = nav === 1 ? Math.round(Number(p.deposit) * 0.3) : Math.max(h.document.lotSize, Math.round(20000000 / nav / h.document.lotSize) * h.document.lotSize);
        await call(token, "put", "/investments/holdings", { productId: h.productId, quantity: String(qty), unitCost: String(nav), lockedUntil: null, expectedRevision: 0 });
      }
      done.push("danh mục nắm giữ");
    }

    // Hỗ trợ
    if (!await db.supportTicket.findFirst({ where: { userId: user.id, NOT: { subject: { startsWith: "Tư vấn:" } } } })) {
      const t = await call(token, "post", "/me/support", { subject: ["Không cập nhật được thu nhập", "Hỏi về cách tính lạm phát", "Đổi email đăng nhập", "Đề xuất thêm sản phẩm vàng", "Lỗi hiển thị biểu đồ"][i],
        category: ["Sử dụng website", "Nội dung", "Tài khoản", "Khác", "Sử dụng website"][i], message: "Nội dung yêu cầu hỗ trợ mẫu cho giai đoạn test." });
      if (i % 2 === 0) await s.community.reply(admin.id, true, t.id, "Chào anh/chị, An Hưu đã nhận yêu cầu và đang kiểm tra.");
      done.push("ticket hỗ trợ");
    }
    if (!await db.notification.findFirst({ where: { userId: user.id, title: "Chào mừng đến với An Hưu" } }))
      await db.notification.createMany({ data: [
        { userId: user.id, title: "Chào mừng đến với An Hưu", message: "Hồ sơ của bạn đã sẵn sàng. Hãy xem kế hoạch nghỉ hưu đầu tiên.", path: "/plan" },
        { userId: user.id, title: "Nhắc cập nhật tháng 11", message: "Ghi nhận số dư tháng 11/2026 để theo dõi tiến độ.", path: "/tracking", readAt: i % 2 ? new Date() : null }] });
    // Đề xuất đầu tư (nháp) do admin có vai trò ADVISOR lập từ kế hoạch đang áp dụng.
    if (!await db.investmentRecommendation.findFirst({ where: { userId: user.id, planVersionId: plan.currentVersionId } })) {
      try { await s.recommendations.create(admin.id, { userId: user.id, planId: plan.id, versionId: plan.currentVersionId }); done.push("đề xuất đầu tư"); }
      catch (e) { done.push("đề xuất: " + (e.code || e.message)); }
    }
    summary.push({ email: p.email, persona: p.note, done: done.join(", ") || "đã có sẵn" });
  }
  console.table(summary);
};
