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
import { Link, useNavigate, useSearchParams } from "react-router";
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

function getTemplateWeights(template: PortfolioPolicyDetail["data"]["templates"][number]): number[] {
  const allocs = "glidePath" in template ? template.glidePath.points[0]?.allocations : template.schedule[0]?.allocations;
  if (!allocs || allocs.length === 0) return [0.15, 0.35, 0.35, 0.10, 0.05, 0];
  const list = allocs.map(a => Number(a.weightPercent) / 100);
  while (list.length < 6) list.push(0);
  return list.slice(0, 6);
}

function WeightDonutChart({ weights }: { weights: number[] }) {
  let offset = 0;
  const colors = ['#4d8a9b', '#7476b5', '#245dab', '#c29a39', '#8c9bab', '#a56c51'];
  return (
    <svg viewBox="0 0 200 200" className="lab-ring" role="img" aria-label="Cơ cấu phần vốn dài hạn, tổng 100 phần trăm" style={{ width: "180px", height: "180px", margin: "0 auto", display: "block" }}>
      <circle cx="100" cy="100" r="78" fill="none" stroke="#e9eff5" strokeWidth="20" />
      {weights.map((v, i) => {
        const start = offset;
        offset += v * 100;
        return v > 0 ? (
          <circle
            key={i}
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={colors[i] || "#245dab"}
            strokeWidth="20"
            pathLength="100"
            strokeDasharray={`${v * 100} ${100 - v * 100}`}
            strokeDashoffset={-start}
            transform="rotate(-90 100 100)"
          />
        ) : null;
      })}
      <text x="100" y="99" textAnchor="middle" className="lab-ring-total" style={{ fontSize: "20px", fontWeight: 700, fill: "#052659" }}>100%</text>
      <text x="100" y="122" textAnchor="middle" className="lab-ring-label" style={{ fontSize: "12px", fill: "#64748B" }}>Vốn dài hạn</text>
    </svg>
  );
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const isRiskSubView = searchParams.get("section") === "risk";
  const [reactionChoice, setReactionChoice] = useState<"sell" | "hold" | "buy">("hold");
  const [lossMode, setLossMode] = useState<"percent" | "amount">("percent");
  const selection = { ...(currentVersion?.preview?.selection ?? (currentVersion?.preview as any)?.input), ...draftSelection };
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
  const [liquidityNeedMonths, setLiquidityNeedMonths] = useState<number>(3);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [allocStep, setAllocStep] = useState<number>(0);
  const [showRebalanceModal, setShowRebalanceModal] = useState<boolean>(false);

  const totalInvestable = (profile.assets.cashSavings || 0) + (profile.assets.stockFundValue || 0) + (profile.assets.liquidAssets || 0) || 460000000;
  const monthlyEssential = profile.expenses.essentialExpense || Math.round((profile.expenses.essentialExpense + profile.expenses.lifestyleExpense) * 0.6) || 20000000;
  const emergencyCapital = liquidityNeedMonths * monthlyEssential;
  const goalCapital = v2Profile?.goals?.status === "KNOWN"
    ? v2Profile.goals.entries.reduce((sum, g) => sum + (g.amountToday?.status === "KNOWN" ? Number(g.amountToday.value) : 0), 0)
    : 0;
  const growthCapital = Math.max(0, totalInvestable - emergencyCapital - goalCapital);
  const shortageCapital = Math.max(0, (emergencyCapital + goalCapital) - totalInvestable);

  const [lossPercent, setLossPercent] = useState<number>(10);
  const [lossAmount, setLossAmount] = useState<number>(() => Math.round(growthCapital * 0.1));

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
            if (user) setAnswers(selection.answers?.length ? Object.fromEntries(selection.answers.map((a: any) => [a.questionId, a.choiceId])) : readRiskDraft(user.id, detail.id, detail.data?.questions || []));
            setLiquidityNeedMonths(selection.liquidityNeedMonths ?? 3);
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

  if (isRiskSubView) {
    const equivLoss = Math.round((growthCapital * lossPercent) / 100);
    return (
      <div className="phase-page risk-portfolio-page content">
        <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            style={{ border: "1px solid #cddfee", borderRadius: "8px", padding: "6px 12px", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
          >
            ← {language === "en" ? "Asset allocation" : "Phân bổ tài sản"}
          </button>
          <span className="sep" style={{ color: "#64748b" }}>/</span>
          <span aria-current="page" style={{ fontSize: "13px", color: "#052659", fontWeight: 600 }}>
            {language === "en" ? "Risk tolerance" : "Khả năng chịu rủi ro"}
          </span>
        </nav>

        <div className="page-head" style={{ marginBottom: "18px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>
            {language === "en" ? "Risk tolerance" : "Khả năng chịu rủi ro"}
          </h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            {language === "en" ? "Update how you feel and your limits before trying a portfolio." : "Cập nhật cảm nhận và giới hạn trước khi thử danh mục."}
          </p>
        </div>

        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bce3d0",
            borderRadius: "12px",
            padding: "12px 16px",
            fontSize: "13px",
            color: "#14532d",
            marginBottom: "18px",
          }}
        >
          ✓ {language === "en"
            ? "You completed this survey during setup. Your choices are saved in your profile; you can review or update them below."
            : "Bạn đã hoàn thành khảo sát này ở bước thiết lập. Các lựa chọn đã được lưu vào hồ sơ; bạn có thể xem lại hoặc cập nhật bên dưới."}
        </div>

        <section className="card" style={{ padding: "24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>
            {language === "en" ? "Understand what you can accept" : "Hiểu điều bạn có thể chấp nhận"}
          </h2>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13.5px", fontWeight: 600, color: "#052659", marginBottom: "10px" }}>
              {language === "en"
                ? "When your investment drops about 15% over a few months, what do you usually do?"
                : "Khi khoản đầu tư giảm khoảng 15% trong vài tháng, bạn thường làm gì?"}
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
              {[
                { id: "sell" as const, title: "Bán bớt để giữ phần còn lại", desc: "Ưu tiên an toàn trước biến động" },
                { id: "hold" as const, title: "Giữ nguyên và theo dõi thêm", desc: "Chấp nhận dao động vừa phải" },
                { id: "buy" as const, title: "Chấp nhận biến động để chờ phục hồi", desc: "Đầu tư cho mục tiêu dài hạn" },
              ].map(opt => {
                const active = reactionChoice === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReactionChoice(opt.id)}
                    style={{
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: active ? "1.5px solid #225eaa" : "1px solid #cddfee",
                      background: active ? "#f0f7ff" : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                    }}
                  >
                    <input type="radio" checked={active} readOnly style={{ marginTop: "3px", accentColor: "#225eaa" }} />
                    <div>
                      <strong style={{ display: "block", fontSize: "13.5px", color: "#052659", marginBottom: "2px" }}>{opt.title}</strong>
                      <span style={{ fontSize: "12px", color: "#536779" }}>{opt.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", marginBottom: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                Nếu thị trường giảm ngắn hạn, bạn chấp nhận giảm tối đa bao nhiêu ở phần vốn dài hạn?
              </label>
              <select
                value={lossMode}
                onChange={e => setLossMode(e.target.value as "percent" | "amount")}
                style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659", background: "#fff" }}
              >
                <option value="percent">Chọn theo tỷ lệ %</option>
                <option value="amount">Chọn theo số tiền ₫</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                Mức giảm tối đa có thể chấp nhận (%)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={lossPercent}
                  onChange={e => setLossPercent(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
                  style={{ width: "100%", height: "42px", padding: "0 36px 0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659" }}
                />
                <span style={{ position: "absolute", right: "12px", top: "11px", fontSize: "13px", color: "#64748b" }}>%</span>
              </div>
              <small style={{ display: "block", fontSize: "12px", color: "#536779", marginTop: "6px" }}>
                Tương đương trên phần vốn dài hạn đang xét: {formatVNDCurrency(equivLoss)}.
              </small>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSearchParams({})}
              style={{ background: "transparent", border: 0, color: "#052659", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => {
                notify.success("Đã cập nhật khẩu vị rủi ro", "Danh mục đầu tư đã được tính lại theo giới hạn của bạn.");
                setSearchParams({});
              }}
              style={{ padding: "10px 18px", borderRadius: "10px", border: 0, background: "#052659", color: "#fff", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Cập nhật và tính lại
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setSearchParams({})}
          style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          ← Quay lại Phân bổ tài sản
        </button>
      </div>
    );
  }

  return (
    <div className="phase-page risk-portfolio-page">
      {/* Page head (demo: plain title + short lead) */}
      <div className="retirement-page-header risk-page-head">
        <div className="retirement-header-main">
          <span className="risk-page-head__eyebrow">{language === "en" ? "YOUR INVESTMENT PLAN" : "KẾ HOẠCH ĐẦU TƯ CỦA BẠN"}</span>
          <h1>{language === "en" ? "Asset allocation" : "Phân bổ tài sản"}</h1>
          <p>
            {language === "en"
              ? "Know where your money goes. Understand why the choice fits you."
              : "Biết tiền đi đâu. Hiểu vì sao lựa chọn đó phù hợp."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSearchParams({ section: "risk" })}
          className="button button-secondary risk-page-head__jump"
        >
          {language === "en" ? "Risk tolerance →" : "Khả năng chịu rủi ro →"}
        </button>
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
                      {language === "en" ? "Emergency Reserve Months (3-12 months)" : "Bạn muốn dự phòng mấy tháng chi tiêu thiết yếu? (3 đến 12)"}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <input
                        type="number"
                        min={3}
                        max={12}
                        value={liquidityNeedMonths}
                        onChange={(e) => setLiquidityNeedMonths(Math.max(3, Math.min(12, Number(e.target.value))))}
                        style={{ width: "80px", height: "38px", padding: "0 10px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "15px", fontWeight: 600, color: "#052659" }}
                      />
                      <input
                        type="range"
                        min={3}
                        max={12}
                        value={liquidityNeedMonths}
                        onChange={(e) => setLiquidityNeedMonths(Number(e.target.value))}
                        style={{ flex: 1, height: "38px", accentColor: "#225eaa" }}
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
                          variant={lossPercent === pct ? "primary" : "secondary"}
                          size="small"
                          onClick={() => {
                            setLossPercent(pct);
                            setLossAmount(Math.round((growthCapital * pct) / 100));
                          }}
                        >
                          {pct}% {language === "en" ? "long-term capital" : "vốn dài hạn"}
                        </Button>
                      ))}
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "flex-end" }}>
                      <div>
                        <label style={{ fontSize: "12px", color: "#456B91", display: "block", marginBottom: "4px" }}>
                          {language === "en" ? "Loss percentage (%):" : "Tỷ lệ chịu lỗ (%):"}
                        </label>
                        <div style={{ position: "relative" }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={lossPercent}
                            onChange={e => {
                              const p = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                              setLossPercent(p);
                              setLossAmount(Math.round((growthCapital * p) / 100));
                            }}
                            style={{ width: "100%", height: "40px", padding: "0 32px 0 12px", border: "1px solid #D0E4FE", borderRadius: "8px", fontSize: "14px" }}
                          />
                          <span style={{ position: "absolute", right: "10px", top: "10px", color: "#64748B", fontSize: "13px" }}>%</span>
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: "12px", color: "#456B91", display: "block", marginBottom: "4px" }}>
                          {language === "en" ? "Equivalent loss amount:" : "Số tiền chịu lỗ tương đương:"}
                        </label>
                        <input
                          type="text"
                          value={new Intl.NumberFormat("vi-VN").format(lossAmount) + " đ"}
                          onChange={e => {
                            const raw = Number(e.target.value.replace(/\D/g, "")) || 0;
                            setLossAmount(raw);
                            if (growthCapital > 0) {
                              setLossPercent(Math.min(100, Math.round((raw / growthCapital) * 100)));
                            }
                          }}
                          style={{ width: "100%", height: "40px", padding: "0 12px", border: "1px solid #D0E4FE", borderRadius: "8px", fontSize: "14px" }}
                        />
                      </div>
                    </div>

                    <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#64748B" }}>
                      {language === "en"
                        ? "Limits are checked against stress test models before proposing an asset allocation."
                        : "Giới hạn này dùng để kiểm tra rủi ro qua mô phỏng trước khi đề xuất danh mục phù hợp."}
                    </p>

                    <div className="form-actions allocation-wizard-actions" style={{ display: "flex", justifyContent: "space-between", marginTop: "16px" }}>
                      <Button variant="secondary" onClick={() => setAllocStep(0)}>
                        {language === "en" ? "← Back" : "← Quay lại"}
                      </Button>
                      <Button variant="primary" onClick={() => setAllocStep(2)}>
                        {language === "en" ? "Continue →" : "Tiếp tục →"}
                      </Button>
                    </div>
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

          {/* 3 Capital Pillars matching demo */}
          <div className="allocation-compact-pillars capital-pillars">
            <div className="alloc-pillar">
              <span>{language === "en" ? `1. Emergency Reserve (${liquidityNeedMonths} mo)` : `1. Dự phòng (${liquidityNeedMonths} tháng)`}</span>
              <strong>{formatVNDCurrency(emergencyCapital)}</strong>
              <small>{language === "en" ? "Cash / flexible deposits, kept outside market volatility." : "Tiền gửi / tiền mặt linh hoạt, không đưa vào thị trường biến động."}</small>
            </div>
            <div className="alloc-pillar">
              <span>{language === "en" ? "2. Near-Term Goals (<= 5 yrs)" : "2. Vốn mục tiêu gần hạn (≤ 5 năm)"}</span>
              <strong>{formatVNDCurrency(goalCapital)}</strong>
              <small>{language === "en" ? "No near-term goals separated." : "Chưa tách khoản mục tiêu gần hạn."}</small>
            </div>
            <div className="alloc-pillar highlight">
              <span>{language === "en" ? "3. Long-Term Investment Capital" : "3. Vốn đầu tư dài hạn"}</span>
              <strong>{formatVNDCurrency(growthCapital)}</strong>
              <small>{language === "en" ? "Allocated across the portfolio below." : "Phần vốn được phân bổ theo danh mục bên dưới."}</small>
            </div>
          </div>

          {/* Allocation Lab Card matching demo */}
          <section className="card allocation-lab" style={{ padding: "24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
              <div>
                <span className="eyebrow" style={{ fontSize: "11px", fontWeight: 700, color: "#536779", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  PHƯƠNG ÁN PHÂN BỔ CHO BẠN
                </span>
                <h2 style={{ margin: "4px 0 4px", fontSize: "20px", fontWeight: 700, color: "#052659" }}>
                  {selectedTemplate?.label || "Cân bằng"}
                </h2>
                <p style={{ margin: 0, fontSize: "13px", color: "#536779" }}>
                  Kỳ vọng minh họa 7,5%/năm · Giảm ngắn hạn tối đa khoảng -12% ({formatVNDCurrency(Math.round(growthCapital * 0.12))}) · Trong giới hạn chịu lỗ {lossPercent}% của bạn.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {["Thận trọng · 6%/năm", "Cân bằng · 7,5%/năm", "Tăng trưởng · 9%/năm"].map((lbl, idx) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => {
                      const t = policyDetail?.data.templates[idx];
                      if (t) handleTemplateChange(t.id);
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "99px",
                      border: idx === 1 ? "1.5px solid #052659" : "1px solid #cddfee",
                      background: idx === 1 ? "#052659" : "#fff",
                      color: idx === 1 ? "#fff" : "#052659",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "28px", alignItems: "center", marginBottom: "20px" }}>
              <WeightDonutChart weights={[0.15, 0.35, 0.35, 0.10, 0.05, 0]} />
              <div style={{ display: "grid", gap: "12px" }}>
                {[
                  { name: "Tiền mặt & tiền gửi", desc: "Thanh khoản nhanh, biến động rất thấp.", pct: 15, color: "#4d8a9b" },
                  { name: "Trái phiếu & thu nhập cố định", desc: "Tạo dòng thu đều, giảm chấn khi cổ phiếu giảm.", pct: 35, color: "#7476b5" },
                  { name: "Cổ phiếu / quỹ cổ phiếu đa dạng", desc: "Động lực tăng trưởng vượt lạm phát trong dài hạn.", pct: 35, color: "#245dab" },
                  { name: "Vàng", desc: "Phòng hộ lạm phát và cú sốc tiền tệ; giữ tỷ trọng vừa phải.", pct: 10, color: "#c29a39" },
                  { name: "Bất động sản / quỹ tín thác", desc: "Tài sản hữu hình dài hạn, thanh khoản thấp.", pct: 5, color: "#8c9bab" },
                  { name: "Tài sản thay thế", desc: "Biến động mạnh; chỉ dành cho phần vốn chấp nhận rủi ro cao.", pct: 0, color: "#a56c51" },
                ].map(item => (
                  <div key={item.name} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr auto", gap: "14px", alignItems: "center" }}>
                    <div>
                      <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#052659" }}>
                        <i style={{ width: "8px", height: "8px", borderRadius: "50%", background: item.color, display: "inline-block" }} />
                        {item.name}
                      </strong>
                      <span style={{ fontSize: "11.5px", color: "#64748b" }}>{item.desc}</span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "99px", background: "#edf2f8", overflow: "hidden" }}>
                      <div style={{ width: `${item.pct}%`, height: "100%", background: item.color }} />
                    </div>
                    <div style={{ textAlign: "right", minWidth: "110px" }}>
                      <strong style={{ display: "block", fontSize: "13px", color: "#052659" }}>{item.pct}%</strong>
                      <span style={{ fontSize: "11.5px", color: "#64748b" }}>{formatVNDCurrency(Math.round((growthCapital * item.pct) / 100))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "16px", borderTop: "1px solid #edf2f8", flexWrap: "wrap", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "#052659" }}>
                Tổng tỷ trọng: <strong>100%</strong> · Vốn phân bổ: <strong>{formatVNDCurrency(growthCapital)}</strong> · Lợi suất kỳ vọng: <strong>7,5%/năm</strong>
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => notify.info("Đã đặt lại", "Đã khôi phục tỷ trọng mẫu Cân bằng.")}
                  style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Đặt lại theo mẫu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    notify.success("Đã áp dụng vào bản xem trước", "Danh mục Cân bằng đã được cập nhật vào kế hoạch.");
                    navigate("/user/plan");
                  }}
                  style={{ padding: "8px 16px", borderRadius: "10px", border: 0, background: "#052659", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Áp dụng vào bản xem trước
                </button>
              </div>
            </div>
          </section>

          {/* Gợi ý theo thời điểm cuộc đời */}
          <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#052659" }}>Gợi ý theo thời điểm cuộc đời</h2>
              <span style={{ padding: "3px 10px", borderRadius: "99px", background: "#e8f2fe", color: "#052659", fontSize: "11.5px", fontWeight: 600 }}>
                Còn 25 năm tới nghỉ hưu
              </span>
            </header>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#536779" }}>
              Khi còn xa tuổi nghỉ hưu, danh mục có thể giữ tỷ trọng tăng trưởng cao hơn. Khi tiến gần mốc nghỉ hưu, phần tiền gửi và trái phiếu nên tăng dần để bảo vệ số tiền sắp dùng.
            </p>
            <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#f2f7fd", border: "1px solid #d5e4f5", fontSize: "13px", color: "#1e3a5f" }}>
              Bạn còn thời gian tích lũy dài nên có thể ưu tiên tăng trưởng trong phạm vi chịu lỗ đã chọn.
            </div>
          </section>

          {/* Ba cách phân bổ để so sánh */}
          <section>
            <div style={{ marginBottom: "14px" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 700, color: "#052659" }}>Ba cách phân bổ để so sánh</h2>
              <p style={{ margin: 0, fontSize: "13px", color: "#536779" }}>Cùng số vốn dài hạn {formatVNDCurrency(growthCapital)} · Khác nhau ở mức dao động ngắn hạn và tốc độ tăng trưởng kỳ vọng.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
              {[
                { name: "Thận trọng", badge: "Trong giới hạn rủi ro", badgeTone: "green", rate: "6%/năm", desc: "Ưu tiên giữ giá trị vốn, phù hợp khi sắp cần dùng tiền hoặc không muốn tài khoản giảm sâu.", drop: `-6% (${formatVNDCurrency(Math.round(growthCapital * 0.06))})`, active: false },
                { name: "Cân bằng", badge: "Gợi ý cho bạn", badgeTone: "blue", rate: "7,5%/năm", desc: "Kết hợp thu nhập cố định và tăng trưởng dài hạn; phù hợp đa số kế hoạch nghỉ hưu 7–20 năm.", drop: `-12% (${formatVNDCurrency(Math.round(growthCapital * 0.12))})`, active: true },
                { name: "Tăng trưởng", badge: "Biến động cao hơn giới hạn", badgeTone: "amber", rate: "9%/năm", desc: "Tập trung tích lũy dài hạn trên 10 năm; chấp nhận biến động ngắn hạn rõ rệt.", drop: `-20% (${formatVNDCurrency(Math.round(growthCapital * 0.20))})`, active: false },
              ].map(card => (
                <article
                  key={card.name}
                  className="card"
                  style={{
                    padding: "20px 22px",
                    borderRadius: "16px",
                    background: "#fff",
                    border: card.active ? "2px solid #225eaa" : "1px solid #d5e3f0",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#052659" }}>{card.name}</h3>
                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: "99px",
                          background: card.badgeTone === "green" ? "#e6f8f0" : card.badgeTone === "blue" ? "#e8f2fe" : "#fff4e5",
                          color: card.badgeTone === "green" ? "#1e7e55" : card.badgeTone === "blue" ? "#225eaa" : "#b45309",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        {card.badge}
                      </span>
                    </div>
                    <strong style={{ display: "block", fontSize: "24px", fontWeight: 700, color: "#052659" }}>{card.rate}</strong>
                    <span style={{ display: "block", fontSize: "11.5px", color: "#64748b", marginBottom: "10px" }}>Lợi suất danh nghĩa minh họa</span>
                    <p style={{ fontSize: "12.5px", color: "#536779", margin: "0 0 12px", lineHeight: 1.5 }}>{card.desc}</p>
                    <p style={{ fontSize: "12px", color: "#052659", margin: "0 0 16px" }}>
                      Biến động ngắn hạn ước tính: <strong>{card.drop}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => notify.success("Đã chọn phương án", `Đang thử phương án ${card.name}.`)}
                    style={{
                      width: "100%",
                      padding: "9px 14px",
                      borderRadius: "10px",
                      border: card.active ? 0 : "1px solid #cddfee",
                      background: card.active ? "#052659" : "#fff",
                      color: card.active ? "#fff" : "#052659",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {card.active ? "Đang chọn phương án này" : "Thử phương án này"}
                  </button>
                </article>
              ))}
            </div>
          </section>

          {(allocStep === 2) && (
            <>

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

              {selectedTemplate && (
                <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center" }}>
                  <WeightDonutChart weights={getTemplateWeights(selectedTemplate)} />
                </div>
              )}

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
