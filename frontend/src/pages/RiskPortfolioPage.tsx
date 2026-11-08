function formatHorizonText(months: number, lang: "vi" | "en") {
  if (!months || months <= 0) return lang === "en" ? "Undetermined" : "Chưa đặt";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years > 0 && remMonths > 0) {
    return lang === "en" ? `${years} years ${remMonths} months` : `${years} năm ${remMonths} tháng`;
  }
  if (years > 0) {
    return lang === "en" ? `${years} years` : `${years} năm`;
  }
  return lang === "en" ? `${months} months` : `${months} tháng`;
}
import { useState, useEffect, useMemo, useRef } from "react";
import { AssetRoles } from "../components/AssetRoles";
import { Alert, Badge, Button, Card, Icon, Input, Modal, Select, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import {
  fetchUserPortfolioPolicies,
  fetchUserPortfolioPolicyDetail,
  previewUserPortfolio,
  type PortfolioPolicyDetail,
  type PortfolioPreviewResult,
  type PortfolioAnswerItem,
} from "../services/portfolios";
import { Link, useNavigate } from "react-router";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { readRiskDraft, writeRiskDraft } from "../services/riskDraft";
import { useI18n } from "../i18n";
import { Explain } from "../components/explanations/ExplainMode";
import { fetchUserAssumptionDetail } from "../services/assumptions";
import { formatVNDCurrency, translateIssueCode } from "../services/retirement";
import { RebalanceProposal } from "../components/retirement/RiskAnalysis";
import { ApiError } from "../services/api";
import { PortfolioGlidePath } from "../components/PortfolioGlidePath";
import { PortfolioScenarios } from "../components/PortfolioScenarios";
import "./risk-portfolio.css";
import { portfolioAssetLabel } from "../utils/portfolioGlidePath";

const getDimensionLabel = (dimension: string, language: "vi" | "en") => {
  const viMap: Record<string, string> = {
    OBJECTIVE: "Mục tiêu đầu tư",
    HORIZON: "Bạn dự định giữ khoản đầu tư bao lâu?",
    LIQUIDITY: "Nhu cầu giữ tiền sẵn để sử dụng",
    LOSS_TOLERANCE: "Khả năng chịu lỗ",
    EXPERIENCE: "Kinh nghiệm đầu tư",
    FINANCIAL_CAPACITY: "Khả năng dành tiền và chịu lỗ của bạn",
  };
  const enMap: Record<string, string> = {
    OBJECTIVE: "Investment Objective",
    HORIZON: "Holding Horizon",
    LIQUIDITY: "Liquidity Needs",
    LOSS_TOLERANCE: "Risk Tolerance",
    EXPERIENCE: "Investment Experience",
    FINANCIAL_CAPACITY: "Financial Capacity",
  };
  return (language === "en" ? enMap[dimension] : viMap[dimension]) || dimension;
};

export default function RiskPortfolioPage() {
  const { user } = useAuth();
  const requestSeq = useRef(0);
  const { language } = useI18n();
  const { v2Profile, profile } = useFinancialProfile();
  const { currentVersion, draftSelection, updateDraft, loadingPlans } = useRetirementPlan();
  const navigate = useNavigate();
  const selection = { ...currentVersion?.preview.selection, ...draftSelection };
  const desiredRetirement = v2Profile?.personal.desiredRetirementMonth;
  const retirementMonth = selection.whatIf?.retirementMonth ?? (desiredRetirement?.status === "KNOWN" ? desiredRetirement.value : undefined);
  const birth = v2Profile?.personal.birthMonth;
  const endMonth = selection.endMonth ?? (birth?.status === "KNOWN" ? `${Number(birth.value.slice(0, 4)) + profile.goal.lifeExpectancy}-${birth.value.slice(5, 7)}` : "");
  const startMonth = v2Profile?.valuationDate.slice(0, 7) ?? "";
  const horizonMonths = endMonth && startMonth ? (Number(endMonth.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 + Number(endMonth.slice(5, 7)) - Number(startMonth.slice(5, 7)) + 1 : 0;
  const { notify } = useNotification();

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [assetLabels, setAssetLabels] = useState<Record<string, string>>({});
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyStatus, setPolicyStatus] = useState<"UNCONFIGURED" | "AVAILABLE">("UNCONFIGURED");
  // A failed request is not the same as "no published policy": keep them apart.
  const [policyLoadError, setPolicyLoadError] = useState<"" | "RATE_LIMITED" | "FAILED">("");
  const [policyAttempt, setPolicyAttempt] = useState(0);

  // User input answers: map of questionId -> choiceId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [liquidityNeedMonths, setLiquidityNeedMonths] = useState<number>(6);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [allocStep, setAllocStep] = useState<number>(0);
  const [showRebalanceModal, setShowRebalanceModal] = useState<boolean>(false);

  const totalInvestable = (profile.assets.cashSavings || 0) + (profile.assets.stockFundValue || 0) + (profile.assets.liquidAssets || 0);
  const monthlyEssential = profile.expenses.essentialExpense || Math.round((profile.expenses.essentialExpense + profile.expenses.lifestyleExpense) * 0.6);
  const emergencyCapital = liquidityNeedMonths * monthlyEssential;
  const goalCapital = v2Profile?.goals?.status === "KNOWN"
    ? v2Profile.goals.entries.reduce((sum, g) => sum + (g.amountToday?.status === "KNOWN" ? Number(g.amountToday.value) : 0), 0)
    : 0;
  const growthCapital = Math.max(0, totalInvestable - emergencyCapital - goalCapital);
  const shortageCapital = Math.max(0, (emergencyCapital + goalCapital) - totalInvestable);

  const [previewResult, setPreviewResult] = useState<PortfolioPreviewResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Load published policy
  useEffect(() => {
    let active = true;
    setLoadingPolicy(true);
    setPolicyLoadError("");
    if (loadingPlans) return;
    fetchUserPortfolioPolicies(1, 50)
      .then(async (res) => {
        if (!active) return;
        setPolicyStatus(res.status);
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(selection.policyVersionId ?? res.items[0].id);
          if (active) {
            setPolicyDetail(detail);
            if (user) setAnswers(selection.answers?.length ? Object.fromEntries(selection.answers.map(a => [a.questionId, a.choiceId])) : readRiskDraft(user.id, detail.id, detail.data?.questions || []));
            setLiquidityNeedMonths(selection.liquidityNeedMonths ?? 6);
            setSelectedTemplateId(selection.templateId ?? "");
          }
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = (error as { status?: number } | null)?.status;
        setPolicyLoadError(status === 429 ? "RATE_LIMITED" : "FAILED");
      })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });

    return () => {
      requestSeq.current++;
      active = false;
    };
  }, [loadingPlans, currentVersion?.id, policyAttempt]);

  useEffect(() => {
    let active = true;
    setAssetLabels({});
    if (policyDetail?.data?.schemaVersion === 2 && policyDetail.data.assumptionVersionId) {
      fetchUserAssumptionDetail(policyDetail.data.assumptionVersionId).then(detail => {
        if (active) setAssetLabels(Object.fromEntries(detail.data.assetClasses.map(a => [a.code, a.label])));
      }).catch(() => { /* Localized known groups and raw codes remain available. */ });
    }
    return () => { active = false; };
  }, [policyDetail]);

  const valuationMonth = useMemo(() => {
    return v2Profile?.valuationDate ? v2Profile.valuationDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  }, [v2Profile]);

  const questions = policyDetail?.data?.questions || [];
  const allAnswered = questions.length > 0 && questions.every((q) => q.choices.some(c => c.id === answers[q.id]));

  const runPreview = async (overrideTemplateId?: string) => {
    if (!policyDetail || !allAnswered || horizonMonths <= 0) return;

    const seq = ++requestSeq.current;
    setPreviewResult(null);
    setIsCalculating(true);
    setCalculationError(null);

    const answerArray: PortfolioAnswerItem[] = Object.entries(answers).map(([questionId, choiceId]) => ({
      questionId,
      choiceId,
    }));

    const activeTemplate = overrideTemplateId !== undefined ? overrideTemplateId : selectedTemplateId;

    try {
      const res = await previewUserPortfolio({
        policyVersionId: policyDetail.id,
        startMonth: valuationMonth,
        retirementMonth,
        horizonMonths,
        liquidityNeedMonths,
        templateId: activeTemplate || undefined,
        answers: answerArray,
      });
      if (seq !== requestSeq.current) return;
      setPreviewResult(res);
      if (res.assessment.selectedTemplateId && !activeTemplate) {
        setSelectedTemplateId(res.assessment.selectedTemplateId);
      }
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setCalculationError(e instanceof ApiError && e.code === "RETIREMENT_MONTH_REQUIRED"
        ? translateIssueCode(e.code, language)
        : e instanceof Error ? e.message : (language === "en" ? "Could not analyze portfolio." : "Chưa thể phân tích danh mục."));
    } finally {
      if (seq === requestSeq.current) setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (policyDetail && allAnswered) {
      runPreview();
    }
    return () => { requestSeq.current++; };
  }, [policyDetail, answers, horizonMonths, liquidityNeedMonths, valuationMonth, retirementMonth]);

  const handleSelectChoice = (questionId: string, choiceId: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: choiceId };
      if (user && policyDetail) writeRiskDraft(user.id, policyDetail.id, next);
      requestSeq.current++;
      setPreviewResult(null);
      setSelectedTemplateId("");
      return next;
    });
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    runPreview(templateId);
  };

  const selectedTemplate = useMemo(() => {
    if (!policyDetail) return null;
    const targetId = selectedTemplateId || previewResult?.assessment.selectedTemplateId;
    return policyDetail.data.templates.find((t) => t.id === targetId) || null;
  }, [policyDetail, selectedTemplateId, previewResult]);

  const matchedBand = useMemo(() => {
    if (!policyDetail || !previewResult?.assessment.riskBandId) return null;
    return policyDetail.data.riskBands.find((b) => b.id === previewResult.assessment.riskBandId) || null;
  }, [policyDetail, previewResult]);

  return (
    <div className="phase-page risk-portfolio-page" style={{ padding: "var(--space-6) var(--space-4)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page head (demo: plain title + short lead) */}
      <div className="retirement-page-header risk-page-head">
        <div className="retirement-header-main">
          <span className="risk-page-head__eyebrow">{language === "en" ? "Your investment plan" : "Kế hoạch đầu tư của bạn"}</span>
          <h1>{language === "en" ? "Asset allocation" : "Phân bổ tài sản"}</h1>
          <p>
            {language === "en"
              ? "Know where your money goes. Understand why the choice fits you."
              : <>Biết tiền đi đâu. Hiểu vì sao lựa chọn đó phù hợp. Kết quả khảo sát dùng để chọn phương án đầu tư mẫu và <Explain term="glidePath">lộ trình giảm dần rủi ro</Explain>.</>}
          </p>
        </div>
        <a href="#risk-survey" className="button button-secondary risk-page-head__jump">{language === "en" ? "Risk tolerance →" : "Khả năng chịu rủi ro →"}</a>
      </div>

      {allAnswered && (
        <p className="risk-done-notice" role="status">
          <Icon name="check" size="small" />
          {language === "en"
            ? "You have answered every question. You can review or update your choices below."
            : "Bạn đã trả lời đủ các câu hỏi. Có thể xem lại hoặc cập nhật lựa chọn bên dưới."}
        </p>
      )}

      {loadingPolicy ? (
        <Card style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <p>{language === "en" ? "Loading official risk survey questions..." : "Đang tải bộ câu hỏi khảo sát rủi ro chính thức..."}</p>
        </Card>
      ) : policyLoadError ? (
        <Alert
          tone="warning"
          title={language === "en" ? "Could not load the survey" : "Chưa tải được bộ câu hỏi"}
          action={<Button variant="secondary" onClick={() => setPolicyAttempt(n => n + 1)}>{language === "en" ? "Try again" : "Thử lại"}</Button>}
        >
          {policyLoadError === "RATE_LIMITED"
            ? (language === "en" ? "Too many requests in a short time. Please wait a minute, then try again." : "Hệ thống đang nhận quá nhiều yêu cầu. Vui lòng chờ khoảng một phút rồi thử lại.")
            : (language === "en" ? "Check your connection and try again. Your saved answers are kept." : "Kiểm tra kết nối rồi thử lại. Các câu trả lời đã lưu vẫn được giữ.")}
        </Alert>
      ) : policyStatus === "UNCONFIGURED" || !policyDetail ? (
        <Card style={{ padding: "var(--space-6)", textAlign: "center", border: "1px dashed var(--color-border)" }}>
          <Icon name="info" size="large" />
          <h3 style={{ marginTop: "var(--space-2)" }}>
            {language === "en" ? "Portfolio Policy Pending Publication" : "Chính sách danh mục đang được hoàn thiện"}
          </h3>
          <p style={{ color: "var(--color-text-muted)", margin: "0 auto", maxWidth: "500px" }}>
            {language === "en"
              ? "The Risk Management Committee has not yet published the standard portfolio policy version on the server. Please return once published."
              : "Hội đồng quản trị rủi ro chưa công bố phiên bản chính sách danh mục chuẩn trên hệ thống. Vui lòng quay lại sau khi chính sách phương án đầu tư được công bố."}
          </p>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-6)" }}>
          {/* 1. Allocation Onboarding: 2-column layout matching demo */}
          <section className="allocation-onboarding">
            <div className="allocation-start">
              <span className="eyebrow">{language === "en" ? "EVERY FUND, ONE ROLE" : "MỖI KHOẢN TIỀN, MỘT VAI TRÒ"}</span>
              <h2>{language === "en" ? "Invest from capital you can commit long-term." : "Đầu tư từ phần tiền bạn có thể dành dài hạn."}</h2>
              <p>
                {language === "en"
                  ? "Emergency buffers and near-term commitments are protected separately from market volatility."
                  : "Tiền dự phòng và mục tiêu gần hạn được bảo vệ riêng, không chịu rủi ro biến động thị trường."}
              </p>

              <dl>
                <div>
                  <dt>{language === "en" ? "Total capital considered" : "Tổng vốn đang xét"}</dt>
                  <dd>{formatVNDCurrency(totalInvestable)}</dd>
                </div>
                <div>
                  <dt>{language === "en" ? `Emergency reserve (${liquidityNeedMonths} mo)` : `Dự phòng cần giữ (${liquidityNeedMonths} tháng)`}</dt>
                  <dd>{formatVNDCurrency(emergencyCapital)}</dd>
                </div>
                <div>
                  <dt>{language === "en" ? "Near-term goals" : "Mục tiêu gần hạn"}</dt>
                  <dd>{formatVNDCurrency(goalCapital)}</dd>
                </div>
                <div className="allocation-start-total">
                  <dt>{growthCapital > 0 ? (language === "en" ? "Remaining for long-term:" : "Còn lại cho dài hạn:") : (language === "en" ? "Shortfall to secure reserve:" : "Còn thiếu để giữ đủ vốn:")}</dt>
                  <dd>{formatVNDCurrency(growthCapital > 0 ? growthCapital : shortageCapital)}</dd>
                </div>
              </dl>

              <div className="allocation-start-footer">
                <span>{language === "en" ? "3 steps, reusing your profile data." : "3 bước, dùng lại hồ sơ đã khai."}</span>
                <span>{language === "en" ? "No need to re-enter income or all assets." : "Không cần nhập lại thu nhập và toàn bộ tài sản."}</span>
              </div>
            </div>

            <Card className="allocation-editor">
              <nav className="allocation-steps" aria-label={language === "en" ? "Allocation steps" : "Các bước phân bổ"}>
                <button
                  type="button"
                  className={allocStep === 0 ? "is-active" : ""}
                  aria-current={allocStep === 0 ? "step" : undefined}
                  onClick={() => setAllocStep(0)}
                >
                  <span>1</span>
                  {language === "en" ? "Investable Capital" : "Tiền có thể đầu tư"}
                </button>
                <button
                  type="button"
                  className={allocStep === 1 ? "is-active" : ""}
                  aria-current={allocStep === 1 ? "step" : undefined}
                  onClick={() => setAllocStep(1)}
                >
                  <span>2</span>
                  {language === "en" ? "Protection & Limits" : "Khoản cần bảo vệ"}
                </button>
                <button
                  type="button"
                  className={allocStep === 2 ? "is-active" : ""}
                  aria-current={allocStep === 2 ? "step" : undefined}
                  onClick={() => setAllocStep(2)}
                >
                  <span>3</span>
                  {language === "en" ? "Review & Survey" : "Kiểm tra và tính"}
                </button>
              </nav>

              {allocStep === 0 && (
                <div style={{ display: "grid", gap: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "var(--navy, #052659)" }}>
                    {language === "en" ? "Investable Capital" : "Tiền có thể đầu tư"}
                  </h3>

                  <Select
                    label={language === "en" ? "Capital source for allocation" : "Số vốn dùng để phân bổ"}
                    value={language === "en" ? "Retirement capital in profile" : "Tiền nghỉ hưu đã khai trong hồ sơ"}
                    options={[
                      language === "en" ? "Retirement capital in profile" : "Tiền nghỉ hưu đã khai trong hồ sơ",
                      language === "en" ? "Total investment capital (including reserve)" : "Tổng vốn đầu tư (gồm cả dự phòng)"
                    ]}
                    onChange={() => {}}
                  />

                  <div className="allocation-known" style={{ background: "#F8FAFC", padding: "12px 14px", borderRadius: "8px", border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "12px", color: "#64748B", display: "block" }}>
                        {language === "en" ? "Retirement capital in profile" : "Tiền đã dành cho nghỉ hưu trong hồ sơ"}
                      </span>
                      <strong style={{ fontSize: "15px", color: "#0F172A" }}>
                        {formatVNDCurrency(profile.assets.cashSavings || 400000000)}
                      </strong>
                    </div>
                    <Link to="/user/profile" className="text-button" style={{ fontSize: "12px", color: "#0D9488", fontWeight: 600 }}>
                      {language === "en" ? "Edit in Finances" : "Sửa trong Tài chính"}
                    </Link>
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#052659", display: "block", marginBottom: "6px" }}>
                      {language === "en" ? "Emergency Reserve Months (6-12 months)" : "Bạn muốn dự phòng mấy tháng chi tiêu thiết yếu? (6 đến 12)"}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <input
                        type="number"
                        min={6}
                        max={12}
                        value={liquidityNeedMonths}
                        onChange={(e) => setLiquidityNeedMonths(Math.max(6, Math.min(12, Number(e.target.value))))}
                        style={{ width: "80px", height: "38px", padding: "0 10px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "15px", fontWeight: 600, color: "#052659" }}
                      />
                      <input
                        type="range"
                        min={6}
                        max={12}
                        value={liquidityNeedMonths}
                        onChange={(e) => setLiquidityNeedMonths(Number(e.target.value))}
                        style={{ flex: 1, height: "38px", accentColor: "#0D9488" }}
                      />
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748B" }}>
                      {language === "en" ? `Equivalent to ${formatVNDCurrency(emergencyCapital)} kept safely in savings/deposits.` : `Tương đương ${formatVNDCurrency(emergencyCapital)} giữ an toàn trong tiền gửi/tiết kiệm.`}
                    </p>
                  </div>

                  <details className="allocation-optional" style={{ fontSize: "13px", color: "#475569" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, color: "#052659" }}>
                      {language === "en" ? "I have separate funds outside retirement fund" : "Tôi có khoản để riêng ngoài quỹ nghỉ hưu"}
                    </summary>
                    <p style={{ margin: "8px 0 0", color: "#64748B", fontSize: "12px" }}>
                      {language === "en" ? "Separate emergency and near-term funds will be protected before investing." : "Dự phòng và tiền cho mục tiêu gần hạn sẽ được tách trước khi đầu tư."}
                    </p>
                  </details>

                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748B" }}>
                    {language === "en" ? "Emergency and near-term funds will be separated before investing." : "Dự phòng và tiền cho mục tiêu gần hạn sẽ được tách trước khi đầu tư."}
                  </p>

                  <div className="form-actions allocation-wizard-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                    <Button variant="primary" onClick={() => setAllocStep(1)}>
                      {language === "en" ? "Continue →" : "Tiếp tục →"}
                    </Button>
                  </div>
                </div>
              )}

              {allocStep === 1 && (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#052659", display: "block", marginBottom: "4px" }}>
                        {language === "en" ? "Essential expenses today" : "Chi thiết yếu mỗi tháng hiện nay"}
                      </label>
                      <strong style={{ fontSize: "16px", color: "#052659" }}>{formatVNDCurrency(monthlyEssential)}</strong>
                    </div>
                    <div>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#052659", display: "block", marginBottom: "4px" }}>
                        {language === "en" ? "Retirement essential expense" : "Chi thiết yếu khi nghỉ hưu"}
                      </label>
                      <strong style={{ fontSize: "16px", color: "#052659" }}>{formatVNDCurrency(profile.goal.monthlyExpenseInRetirement || monthlyEssential)}</strong>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#052659", display: "block", marginBottom: "6px" }}>
                      {language === "en" ? "Maximum Acceptable Loss Limit" : "Mức giảm vốn tối đa có thể chấp nhận"}
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      {[5, 10, 15, 20].map((pct) => (
                        <Button
                          key={pct}
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            // Quick fill loss preference
                          }}
                        >
                          {pct}% {language === "en" ? "long-term capital" : "vốn dài hạn"}
                        </Button>
                      ))}
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#64748B" }}>
                      {language === "en"
                        ? "Limits are checked against stress test models before proposing an asset allocation."
                        : "Giới hạn này dùng để kiểm tra rủi ro qua mô phỏng trước khi đề xuất danh mục phù hợp."}
                    </p>
                  </div>
                </div>
              )}

              {allocStep === 2 && (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ background: "#F9FBFF", padding: "16px", borderRadius: "12px", border: "1px solid #D0E4FE" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#052659" }}>
                      {language === "en" ? "Ready for Portfolio Verification" : "Sẵn sàng tính toán phân bổ"}
                    </h4>
                    <p style={{ margin: 0, fontSize: "13px", color: "#456B91", lineHeight: 1.6 }}>
                      {language === "en"
                        ? "Answers from the survey below calibrate your risk profile and select the optimal portfolio template."
                        : "Các câu hỏi khảo sát bên dưới giúp xếp nhóm khẩu vị rủi ro và chọn phương án danh mục mẫu tối ưu."}
                    </p>
                  </div>

                  <a href="#risk-survey" className="button button-primary" style={{ textAlign: "center" }}>
                    {language === "en" ? "Complete Risk Tolerance Survey ↓" : "Làm khảo sát chịu rủi ro ↓"}
                  </a>
                </div>
              )}
            </Card>
          </section>

          {(allocStep === 2 || allAnswered) && (
            <>
          {/* 3 Capital Pillars matching demo */}
          <div className="allocation-compact-pillars capital-pillars">
            <div className="alloc-pillar">
              <span>{language === "en" ? `1. Emergency Reserve (${liquidityNeedMonths} mo)` : `1. Dự phòng giữ riêng (${liquidityNeedMonths} tháng)`}</span>
              <strong>{formatVNDCurrency(emergencyCapital)}</strong>
              <small>{language === "en" ? "Essential emergency buffer" : "Bảo vệ chi tiêu khẩn cấp"}</small>
            </div>
            <div className="alloc-pillar">
              <span>{language === "en" ? "2. Near-Term Goals (<= 5 yrs)" : "2. Vốn mục tiêu gần hạn (<= 5 năm)"}</span>
              <strong>{formatVNDCurrency(goalCapital)}</strong>
              <small>{language === "en" ? "Separated from market risk" : "Tách riêng khỏi rủi ro thị trường"}</small>
            </div>
            <div className="alloc-pillar highlight">
              <span>{language === "en" ? "3. Long-Term Investment Capital" : "3. Vốn đầu tư dài hạn"}</span>
              <strong>{formatVNDCurrency(growthCapital)}</strong>
              <small>{language === "en" ? "Retirement wealth accumulation" : "Tăng trưởng hưu trí"}</small>
            </div>
          </div>

          {/* Questionnaire */}
          <section id="risk-survey" className="risk-survey-section">
            <h2 className="risk-survey-section__title">{language === "en" ? "Risk tolerance" : "Khả năng chịu rủi ro"}</h2>
            <p className="risk-survey-section__lead">{language === "en" ? `Update how you feel and your limits before trying a portfolio (${questions.length} questions).` : `Cập nhật cảm nhận và giới hạn trước khi thử danh mục (${questions.length} câu hỏi).`}</p>

            {questions.length > 0 && (
              <div className="risk-survey-sticky-bar">
                <span>{language === "en" ? `Answered ${Object.keys(answers).length}/${questions.length} questions` : `Đã trả lời ${Object.keys(answers).length}/${questions.length} câu`}</span>
                {questions.find(q => !answers[q.id]) && (
                  <a href={`#question-${questions.find(q => !answers[q.id])!.id}`} className="risk-survey-next-btn">
                    {language === "en" ? "Next question" : "Câu tiếp theo"}
                  </a>
                )}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {questions.map((question, qIdx) => {
                const selectedChoiceId = answers[question.id];
                return (
                  <div key={question.id} id={`question-${question.id}`} style={{ scrollMarginTop: "120px" }}>
                  <Card className="risk-question-card">
                    <div className="risk-question-card__meta">
                      <span>
                        {language === "en" ? `QUESTION ${qIdx + 1} · ${getDimensionLabel(question.dimension, language)}` : `CÂU HỎI ${qIdx + 1} · ${getDimensionLabel(question.dimension, language)}`}
                      </span>
                    </div>

                    <h3 className="risk-question-card__prompt">
                      {question.prompt}
                    </h3>

                    <div role="radiogroup" aria-label={question.prompt} className="risk-choices">
                      {question.choices.map((choice) => {
                        const isSelected = selectedChoiceId === choice.id;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={`risk-choice${isSelected ? " is-selected" : ""}`}
                            onClick={() => handleSelectChoice(question.id, choice.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelectChoice(question.id, choice.id);
                              }
                            }}
                          >
                            <span className="risk-choice__dot" aria-hidden="true" />
                            <span className="risk-choice__label">{choice.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Assessment & Matched Template Result */}
          {calculationError ? (
            <Alert tone="danger" title={language === "en" ? "Assessment Error" : "Lỗi đánh giá"}>
              {calculationError}
            </Alert>
          ) : isCalculating ? (
            <Card className="risk-result-empty">
              <p role="status">{language === "en" ? "Finding the portfolio that fits your answers…" : "Đang tìm danh mục phù hợp với câu trả lời của bạn…"}</p>
            </Card>
          ) : previewResult ? (
            <section className="risk-result">
              <h2 className="risk-result__title">
                {language === "en" ? "Your result and suggested portfolio" : "Kết quả và danh mục đề xuất cho bạn"}
              </h2>
              {previewResult.issues?.some(issue => issue.code === "RETIREMENT_MONTH_REQUIRED") && (
                <Alert tone="warning" title={language === "en" ? "Retirement month required" : "Cần bổ sung tháng nghỉ hưu"}>
                  {translateIssueCode("RETIREMENT_MONTH_REQUIRED", language)}{" "}
                  <Link to="/user/goal">{language === "en" ? "Review retirement goal" : "Kiểm tra mục tiêu nghỉ hưu"}</Link>
                </Alert>
              )}

              {/* Summary hero (demo .summary-hero): group + portfolio first, score second */}
              <div className="risk-result-hero">
                <div className="risk-result-hero__main">
                  <span className="risk-result-hero__badge">{language === "en" ? "Based on your answers" : "Theo các câu trả lời của bạn"}</span>
                  <p className="risk-result-hero__lead">{language === "en" ? "Your risk group" : "Nhóm rủi ro của bạn"}</p>
                  <strong className="risk-result-hero__group">
                    {matchedBand ? matchedBand.label : (language === "en" ? "Unclassified" : "Chưa xếp nhóm")}
                  </strong>
                  <p className="risk-result-hero__desc">
                    {language === "en" ? "Suggested portfolio: " : "Danh mục đề xuất: "}
                    <strong>{selectedTemplate ? selectedTemplate.label : (language === "en" ? "No portfolio selected" : "Chưa chọn danh mục")}</strong>
                  </p>

                  {previewResult.assessment.eligibleTemplateIds.length > 1 && (
                    <div className="risk-result-hero__options">
                      <span>{language === "en" ? "Several portfolios fit. Choose one:" : "Có nhiều danh mục phù hợp. Hãy chọn một phương án:"}</span>
                      <div role="group" aria-label={language === "en" ? "Matching portfolios" : "Danh mục phù hợp"}>
                        {previewResult.assessment.eligibleTemplateIds.map((tmplId) => {
                          const tmpl = policyDetail.data.templates.find((t) => t.id === tmplId);
                          const isActive = tmplId === (selectedTemplateId || previewResult.assessment.selectedTemplateId);
                          return (
                            <button
                              key={tmplId}
                              type="button"
                              aria-pressed={isActive}
                              className={`risk-template-option${isActive ? " is-active" : ""}`}
                              onClick={() => handleTemplateChange(tmplId)}
                            >
                              {tmpl?.label || tmplId}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="risk-result-hero__side">
                  <div>
                    <span>{language === "en" ? "Risk score" : "Điểm khẩu vị rủi ro"}</span>
                    <strong>{previewResult.assessment.totalScore} {language === "en" ? "pts" : "điểm"}</strong>
                    <small>{language === "en" ? "From 6 areas: goal, horizon, liquidity, loss tolerance, experience, capacity." : "Từ 6 khía cạnh: mục tiêu, thời gian, thanh khoản, khả năng chịu lỗ, kinh nghiệm, năng lực tài chính."}</small>
                  </div>
                  <div>
                    <span>{language === "en" ? "Rebalancing" : "Điều chỉnh tỷ lệ"}</span>
                    <strong>
                      {selectedTemplate?.rebalance && selectedTemplate.rebalance.everyMonths !== undefined
                        ? (language === "en" ? `Every ${selectedTemplate.rebalance.everyMonths} months` : `Mỗi ${selectedTemplate.rebalance.everyMonths} tháng`)
                        : (language === "en" ? "Not available" : "Chưa có")}
                    </strong>
                    {selectedTemplate?.rebalance?.turnoverCostPercent !== undefined && (
                      <small>{language === "en" ? `Turnover fee ${selectedTemplate.rebalance.turnoverCostPercent}%` : `Phí điều chỉnh ${selectedTemplate.rebalance.turnoverCostPercent}%`}</small>
                    )}
                  </div>
                </div>
              </div>

              {selectedTemplate && ("glidePath" in selectedTemplate ? (
                <PortfolioGlidePath points={selectedTemplate.glidePath.points} month={valuationMonth} retirementMonth={retirementMonth} language={language} assetLabels={assetLabels} />
              ) : selectedTemplate.schedule.length > 0 && (
                <Card className="risk-weights-card">
                  <h3>
                    {language === "en" ? `Share of money in each asset group (${selectedTemplate.label})` : `Tỷ lệ tiền dành cho từng nhóm tài sản (${selectedTemplate.label})`}
                  </h3>
                  <div className="risk-weights">
                    {selectedTemplate.schedule[0].allocations.map((alloc) => (
                      <div key={alloc.assetClass} className="risk-weight">
                        <span>{portfolioAssetLabel(alloc.assetClass, language, assetLabels)}</span>
                        <strong>{alloc.weightPercent}%</strong>
                        <i aria-hidden="true"><b style={{ width: `${Math.min(100, Math.max(0, Number(alloc.weightPercent) || 0))}%` }} /></i>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              {/* Asset Allocations Breakdown */}
              {selectedTemplate && <AssetRoles codes={("glidePath" in selectedTemplate ? selectedTemplate.glidePath.points : selectedTemplate.schedule).flatMap(point => point.allocations.map(allocation => allocation.assetClass))} language={language} labels={assetLabels} />}

              {/* Periodic Rebalancing Proposal CTA matching demo */}
              {selectedTemplate && (
                <div className="alloc-rebalance-cta">
                  <div>
                    <strong style={{ fontSize: "15px", color: "#052659", display: "block" }}>
                      {language === "en" ? "Periodic Portfolio Rebalancing" : "Đề xuất tái cân bằng tỷ trọng đầu tư"}
                    </strong>
                    <p>
                      {language === "en"
                        ? "Proactively check target allocation drift across market fluctuations."
                        : "Kiểm tra độ lệch tỷ trọng so với danh mục mục tiêu và nhận đề xuất điều chỉnh định kỳ."}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setShowRebalanceModal(true)}
                  >
                    {language === "en" ? "Rebalance Proposal" : "Đề xuất tái cân bằng"}
                  </Button>
                </div>
              )}

              {/* Scenarios Comparison */}
              {previewResult.scenarios.length > 0 && <PortfolioScenarios scenarios={previewResult.scenarios} language={language} />}
            </section>
          ) : !allAnswered ? (
            <Card className="risk-result-empty">
              <Icon name="shield" />
              <div>
                <h3>{language === "en" ? "Finish the questions to see your portfolio" : "Trả lời hết câu hỏi để xem danh mục"}</h3>
                <p>
                  {language === "en"
                    ? `${Object.keys(answers).length}/${questions.length} answered. Your risk group and suggested portfolio appear here.`
                    : `Đã trả lời ${Object.keys(answers).length}/${questions.length} câu. Nhóm rủi ro và danh mục đề xuất sẽ hiện ở đây.`}
                </p>
              </div>
            </Card>
          ) : null}
            </>
          )}
        </div>
      )}

      {/* Rebalance Modal */}
      <Modal
        open={showRebalanceModal}
        title={language === "en" ? "Portfolio Rebalance Proposal" : "Đề xuất tái cân bằng danh mục"}
        onClose={() => setShowRebalanceModal(false)}
      >
        <RebalanceProposal
          templates={policyDetail?.data.templates}
          basis={selectedTemplateId && policyDetail && retirementMonth && valuationMonth ? {
            policyVersionId: policyDetail.id,
            templateId: selectedTemplateId,
            month: valuationMonth,
            retirementMonth: retirementMonth,
          } : null}
        />
      </Modal>
    </div>
  );
}
