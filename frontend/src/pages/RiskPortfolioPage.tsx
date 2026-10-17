import { useState, useEffect, useMemo, useRef } from "react";
import { AssetRoles } from "../components/AssetRoles";
import { Alert, Badge, Button, Card, Icon, Input, Select, useNotification } from "../components/ui";
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
import { translateIssueCode } from "../services/retirement";
import { ApiError } from "../services/api";
import { PortfolioGlidePath } from "../components/PortfolioGlidePath";

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

  // User input answers: map of questionId -> choiceId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [liquidityNeedMonths, setLiquidityNeedMonths] = useState<number>(6);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [previewResult, setPreviewResult] = useState<PortfolioPreviewResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Load published policy
  useEffect(() => {
    let active = true;
    setLoadingPolicy(true);
    if (loadingPlans) return;
    fetchUserPortfolioPolicies(1, 50)
      .then(async (res) => {
        if (!active) return;
        setPolicyStatus(res.status);
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(selection.policyVersionId ?? res.items[0].id);
          if (active) {
            setPolicyDetail(detail);
            if (user) setAnswers(selection.answers?.length ? Object.fromEntries(selection.answers.map(a => [a.questionId, a.choiceId])) : readRiskDraft(user.id, detail.id, detail.data.questions));
            setLiquidityNeedMonths(selection.liquidityNeedMonths ?? 6);
            setSelectedTemplateId(selection.templateId ?? "");
          }
        }
      })
      .catch(() => {
        if (active) setPolicyStatus("UNCONFIGURED");
      })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });

    return () => {
      requestSeq.current++;
      active = false;
    };
  }, [loadingPlans, currentVersion?.id]);

  useEffect(() => {
    let active = true;
    setAssetLabels({});
    if (policyDetail?.data.schemaVersion === 2 && policyDetail.data.assumptionVersionId) {
      fetchUserAssumptionDetail(policyDetail.data.assumptionVersionId).then(detail => {
        if (active) setAssetLabels(Object.fromEntries(detail.data.assetClasses.map(a => [a.code, a.label])));
      }).catch(() => { /* Localized known groups and raw codes remain available. */ });
    }
    return () => { active = false; };
  }, [policyDetail]);

  const valuationMonth = useMemo(() => {
    return v2Profile?.valuationDate ? v2Profile.valuationDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  }, [v2Profile]);

  const questions = policyDetail?.data.questions || [];
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
      {/* 1. Standardized Hero Header matching Design System */}
      <div className="retirement-page-header">
        <div className="retirement-header-main">
          <div className="header-status-badge is-goal">
            <Icon name="shield" size="small" />
            <span>
              {language === "en" ? "INVESTMENT STRATEGY & RISK MANAGEMENT" : "CHIẾN LƯỢC ĐẦU TƯ & QUẢN TRỊ RỦI RO"}
            </span>
          </div>
          <h1>
            {language === "en" ? "Risk Assessment & Benchmark Portfolio Selection" : "Khảo sát mức rủi ro bạn có thể chấp nhận & Phương án đầu tư mẫu"}
          </h1>
          <p>
            {language === "en"
              ? "A 6-dimensional risk assessment based on global standards combined with portfolio policies approved by the Risk Management Committee, recommending the optimal asset allocation for your retirement stage."
              : <>Hệ thống khảo sát rủi ro 6 chiều theo chuẩn mực quốc tế kết hợp cùng chính sách danh mục được phê duyệt bởi Hội đồng Quản trị rủi ro, giúp đề xuất cấu trúc phân bổ tài sản và <Explain term="glidePath">lộ trình giảm dần rủi ro</Explain> phù hợp với bạn.</>}
          </p>
        </div>

        <div className="header-quick-stats">
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Survey Progress" : "Tiến độ khảo sát"}</span>
            <span className="stat-value">
              {questions.length > 0 ? `${Object.keys(answers).length}/${questions.length} ${language === "en" ? "answered" : "câu"}` : "—"}
            </span>
          </div>
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Investment Horizon" : "Thời gian đầu tư"}</span>
            <span className="stat-value is-safe">
              {horizonMonths > 0 ? `${horizonMonths} ${language === "en" ? "months" : "tháng"}` : (language === "en" ? "Undetermined" : "Chưa đặt")}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Cohesive Draft Mode & Action Banner */}
      <div className="risk-portfolio-draft-banner">
        <div className="draft-banner-content">
          <div className="draft-banner-icon">
            <Icon name="sparkles" size="small" />
          </div>
          <p className="flow-note">
            {language === "en"
              ? "Your choices will be used in a draft. Your current plan changes only after you choose to use the new option."
              : "Các lựa chọn sẽ chuyển sang bản nháp. Kế hoạch đang dùng chỉ thay đổi khi bạn chọn dùng phương án mới."}
          </p>
        </div>

        {allAnswered && (
          <Button
            variant="primary"
            disabled={isCalculating || !previewResult || Boolean(calculationError)}
            onClick={() => {
              if (!policyDetail || !previewResult) return;
              updateDraft({
                policyVersionId: policyDetail.id,
                answers: Object.entries(answers).map(([questionId, choiceId]) => ({ questionId, choiceId })),
                templateId: selectedTemplateId || previewResult.assessment.selectedTemplateId || undefined,
                liquidityNeedMonths,
                endMonth,
              });
              navigate("/user/plan");
            }}
          >
            {language === "en" ? "Use these choices in plan preview" : "Xem kế hoạch với các lựa chọn này"}
          </Button>
        )}
      </div>

      {/* Mandatory Standard Portfolio Disclaimer */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <Alert tone="info" title={language === "en" ? "Note on Standard Portfolio" : "Lưu ý về danh mục chuẩn"}>
          {language === "en" ? (
            <>
              Simulations and return trajectories below reflect a <strong>standard benchmark portfolio</strong> (calculated per 1 standard asset unit), not your personal actual retirement fund balance. Actual accumulation depends on periodic contribution flows and deposit timings.
            </>
          ) : (
            <>
              Diễn biến mô phỏng và tỷ suất sinh lời dưới đây là kết quả của <strong>danh mục chuẩn</strong> (tính trên 1 đơn vị tài sản chuẩn), chưa phải số tiền quỹ hưu trí cá nhân thực tế. Số tiền tích lũy thực tế sẽ phụ thuộc vào dòng tiền đóng góp định kỳ và thời điểm nộp quỹ của bạn.
            </>
          )}
        </Alert>
      </div>

      {loadingPolicy ? (
        <Card style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <p>{language === "en" ? "Loading official risk survey questions..." : "Đang tải bộ câu hỏi khảo sát rủi ro chính thức..."}</p>
        </Card>
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
          {/* Horizon & Liquidity Parameters */}
          <Card style={{ padding: "var(--space-4)", border: "1px solid var(--color-border)" }}>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>
              {language === "en" ? "Investment Objective & Time Horizon" : "Mục tiêu & Khung thời gian đầu tư"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "var(--space-4)" }}>
              <div>
                <p>{language === "en" ? "Investment period follows your retirement goal:" : "Thời gian đầu tư theo mục tiêu hưu trí:"} <strong>{horizonMonths > 0 ? `${horizonMonths} ${language === "en" ? "months" : "tháng"}` : (language === "en" ? "Set a goal first" : "Cần đặt mục tiêu trước")}</strong></p>
                <Link to="/user/goal">{language === "en" ? "Change goal dates" : "Sửa thời gian trong Mục tiêu"}</Link>

              </div>
              <div>
                <Input
                  type="number"
                  min={0}
                  label={language === "en" ? "Emergency Fund (Months of expenses)" : "Quỹ dự phòng (đủ chi tiêu bao nhiêu tháng)"}
                  value={String(liquidityNeedMonths)}
                  onChange={(val) => setLiquidityNeedMonths(Math.max(0, parseInt(val || "0", 10)))}
                />
              </div>
            </div>
          </Card>

          {/* Questionnaire */}
          <section>
            <h2 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-4)" }}>
              {language === "en" ? `Risk Assessment Questionnaire (${questions.length} questions)` : `Bộ câu hỏi khảo sát rủi ro (${questions.length} câu)`}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {questions.map((question, qIdx) => {
                const selectedChoiceId = answers[question.id];
                return (
                  <Card key={question.id} style={{ padding: "var(--space-4)", border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)", fontWeight: 600 }}>
                        {language === "en" ? `QUESTION ${qIdx + 1} · ${getDimensionLabel(question.dimension, language)}` : `CÂU HỎI ${qIdx + 1} · ${getDimensionLabel(question.dimension, language)}`}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "var(--text-base)", margin: "0 0 var(--space-3)" }}>
                      {question.prompt}
                    </h3>

                    <div role="radiogroup" aria-label={question.prompt} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {question.choices.map((choice) => {
                        const isSelected = selectedChoiceId === choice.id;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => handleSelectChoice(question.id, choice.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelectChoice(question.id, choice.id);
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "var(--space-3) var(--space-4)",
                              borderRadius: "var(--radius-md)",
                              border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                              background: isSelected ? "var(--color-surface-subtle)" : "var(--color-surface)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              width: "100%",
                              textAlign: "left",
                              font: "inherit",
                              color: "inherit",
                            }}
                          >
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: isSelected ? 600 : 400 }}>
                              {choice.label}
                            </span>
                            <Badge tone={isSelected ? "success" : "neutral"}>
                              {choice.score} {language === "en" ? "pts" : "điểm"}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
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
            <Card style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <p>{language === "en" ? "Matching investment portfolio classification rules..." : "Đang đối chiếu quy tắc phân loại danh mục đầu tư..."}</p>
            </Card>
          ) : previewResult ? (
            <section style={{ marginTop: "var(--space-4)" }}>
              <h2 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-4)" }}>
                {language === "en" ? "Survey Results & Recommended Investment Portfolio" : "Kết quả khảo sát & Đề xuất danh mục đầu tư"}
              </h2>
              {previewResult.issues?.some(issue => issue.code === "RETIREMENT_MONTH_REQUIRED") && (
                <Alert tone="warning" title={language === "en" ? "Retirement month required" : "Cần bổ sung tháng nghỉ hưu"}>
                  {translateIssueCode("RETIREMENT_MONTH_REQUIRED", language)}{" "}
                  <Link to="/user/goal">{language === "en" ? "Review retirement goal" : "Kiểm tra mục tiêu nghỉ hưu"}</Link>
                </Alert>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
                {/* Score Card */}
                <Card style={{ padding: "var(--space-4)", border: "1px solid var(--color-border)" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    {language === "en" ? "Risk Tolerance Score" : "Điểm số khẩu vị rủi ro"}
                  </span>
                  <div style={{ fontSize: "var(--text-3xl)", fontWeight: 700, margin: "var(--space-1) 0" }}>
                    {previewResult.assessment.totalScore} {language === "en" ? "pts" : "điểm"}
                  </div>
                  <div>
                    {matchedBand ? (
                      <Badge tone="success">{matchedBand.label}</Badge>
                    ) : (
                      <Badge tone="neutral">{language === "en" ? "Unclassified" : "Chưa xếp nhóm"}</Badge>
                    )}
                  </div>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-2)", margin: 0 }}>
                    {language === "en"
                      ? "Composite score evaluated across 6 dimensions: Objective, Horizon, Liquidity, Risk Tolerance, Experience, and Financial Capacity."
                      : "Điểm tổng hợp từ 6 khía cạnh: Mục tiêu, Thời gian, Thanh khoản, Khả năng chịu lỗ, Kinh nghiệm và Năng lực tài chính."}
                  </p>
                </Card>

                {/* Candidate Selection Card */}
                <Card style={{ padding: "var(--space-4)", border: "1px solid var(--color-border)" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    {language === "en" ? "Selected Portfolio" : "Danh mục được chọn"}
                  </span>
                  <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--space-1) 0" }}>
                    {selectedTemplate ? selectedTemplate.label : (language === "en" ? "No portfolio selected" : "Chưa chọn danh mục")}
                  </div>

                  {previewResult.assessment.eligibleTemplateIds.length > 1 && (
                    <div style={{ marginTop: "var(--space-2)" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                        {language === "en" ? "Multiple matching portfolios found. Select your preferred option:" : "Có nhiều danh mục phù hợp. Hãy chọn phương án ưu tiên:"}
                      </span>
                      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
                        {previewResult.assessment.eligibleTemplateIds.map((tmplId) => {
                          const tmpl = policyDetail.data.templates.find((t) => t.id === tmplId);
                          const isActive = tmplId === (selectedTemplateId || previewResult.assessment.selectedTemplateId);
                          return (
                            <button
                              key={tmplId}
                              type="button"
                              className={`btn-filter ${isActive ? "is-active" : ""}`}
                              onClick={() => handleTemplateChange(tmplId)}
                            >
                              {tmpl?.label || tmplId}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-2)", margin: 0 }}>
                    {selectedTemplate?.rebalance && selectedTemplate.rebalance.everyMonths !== undefined && selectedTemplate.rebalance.turnoverCostPercent !== undefined
                      ? (language === "en"
                          ? `Rebalancing frequency: every ${selectedTemplate.rebalance.everyMonths} months (Turnover fee: ${selectedTemplate.rebalance.turnoverCostPercent}%).`
                          : `Tần suất điều chỉnh tỷ lệ đầu tư: mỗi ${selectedTemplate.rebalance.everyMonths} tháng một lần (Phí điều chỉnh: ${selectedTemplate.rebalance.turnoverCostPercent}%).`)
                      : (language === "en"
                          ? "No portfolio rebalancing information available."
                          : "Chưa có thông tin điều chỉnh danh mục.")}
                  </p>
                </Card>
              </div>

              {/* Asset Allocations Breakdown */}
              {selectedTemplate && <AssetRoles codes={("glidePath" in selectedTemplate ? selectedTemplate.glidePath.points : selectedTemplate.schedule).flatMap(point => point.allocations.map(allocation => allocation.assetClass))} language={language} labels={assetLabels} />}
              {selectedTemplate && ("glidePath" in selectedTemplate ? (
                <PortfolioGlidePath points={selectedTemplate.glidePath.points} month={valuationMonth} retirementMonth={retirementMonth} language={language} assetLabels={assetLabels} />
              ) : selectedTemplate.schedule.length > 0 && (
                <Card style={{ padding: "var(--space-4)", border: "1px solid var(--color-border)", marginBottom: "var(--space-6)" }}>
                  <h3 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>
                    {language === "en" ? `Asset Allocation Weights (${selectedTemplate.label})` : `Tỷ lệ tiền dành cho từng nhóm tài sản (${selectedTemplate.label})`}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
                    {selectedTemplate.schedule[0].allocations.map((alloc) => (
                      <div key={alloc.assetClass} style={{ padding: "var(--space-3)", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                          {language === "en" ? `Asset Group: ${alloc.assetClass}` : `Nhóm tài sản: ${alloc.assetClass}`}
                        </span>
                        <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--space-1) 0" }}>
                          {alloc.weightPercent}%
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              {/* Scenarios Comparison */}
              {previewResult.scenarios.length > 0 && (
                <section>
                  <h3 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>
                    {language === "en" ? "Benchmark Portfolio Simulation Across 3 Macro Scenarios" : "Diễn biến mô phỏng danh mục chuẩn qua 3 kịch bản vĩ mô"}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
                    {previewResult.scenarios.map((sc) => {
                      const isBase = sc.kind === "BASE";
                      const isAdverse = sc.kind === "ADVERSE";
                      const scenarioKindLabel =
                        sc.kind === "BASE"
                          ? (language === "en" ? "BASE" : "Cơ sở")
                          : sc.kind === "ADVERSE"
                          ? (language === "en" ? "ADVERSE" : "Thận trọng")
                          : (language === "en" ? "OPTIMISTIC" : "Lạc quan");
                      return (
                        <Card key={sc.kind} style={{ padding: "var(--space-4)", border: isBase ? "2px solid var(--color-primary)" : "1px solid var(--color-border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                            <h4 style={{ margin: 0, fontSize: "var(--text-base)" }}>{sc.label}</h4>
                            <Badge tone={isBase ? "info" : isAdverse ? "danger" : "success"}>
                              {scenarioKindLabel}
                            </Badge>
                          </div>

                          <div style={{ margin: "var(--space-3) 0", padding: "var(--space-3)", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
                              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                                {language === "en" ? "Annualized Return:" : "Tỷ suất sinh lời năm:"}
                              </span>
                              <span style={{ fontWeight: 700 }}>
                                {parseFloat(sc.annualizedReturnPercent).toFixed(2)}% {language === "en" ? "/ yr" : "/ năm"}
                              </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                                {language === "en" ? "Final Unit Value:" : "Giá trị 1 đơn vị cuối kỳ:"}
                              </span>
                              <span style={{ fontWeight: 700 }}>
                                {parseFloat(sc.finalUnitValue).toFixed(2)} {language === "en" ? "x" : "lần"}
                              </span>
                            </div>
                          </div>

                          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", margin: 0 }}>
                            {isBase
                              ? (language === "en" ? "Baseline expectation scenario approved by the Committee." : "Kịch bản kỳ vọng theo chuỗi giả định cơ sở được Hội đồng duyệt.")
                              : isAdverse
                              ? (language === "en" ? "High inflation combined with economic slowdown." : "Kịch bản lạm phát tăng cao kết hợp cùng suy giảm tăng trưởng kinh tế.")
                              : (language === "en" ? "Strong economic recovery with favorable asset yields." : "Kịch bản kinh tế phục hồi mạnh mẽ và lợi suất tài sản thuận lợi.")}
                          </p>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>
          ) : !allAnswered ? (
            <Card style={{ padding: "var(--space-6)", textAlign: "center", border: "1px dashed var(--color-border)" }}>
              <Icon name="shield" size="large" />
              <h3 style={{ marginTop: "var(--space-2)" }}>
                {language === "en" ? "Risk Assessment In Progress" : "Khảo sát rủi ro chưa hoàn tất"}
              </h3>
              <p style={{ color: "var(--color-text-muted)", margin: "var(--space-2) auto 0", maxWidth: "600px" }}>
                {language === "en"
                  ? `Please answer all ${questions.length} questions above to determine your verified risk tolerance score and recommended portfolio (${Object.keys(answers).length}/${questions.length} answered).`
                  : `Vui lòng hoàn tất đủ ${questions.length} câu hỏi khảo sát ở trên để xác định điểm số khẩu vị rủi ro và nhận đề xuất danh mục chuẩn phù hợp (${Object.keys(answers).length}/${questions.length} câu đã trả lời).`}
              </p>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
