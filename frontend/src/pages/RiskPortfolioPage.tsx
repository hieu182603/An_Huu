import { useState, useEffect, useMemo, useRef } from "react";
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
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { readRiskDraft, writeRiskDraft } from "../services/riskDraft";
import { useI18n } from "../i18n";

const getDimensionLabel = (dimension: string, language: "vi" | "en") => {
  const viMap: Record<string, string> = {
    OBJECTIVE: "Mục tiêu đầu tư",
    HORIZON: "Thời gian nắm giữ",
    LIQUIDITY: "Nhu cầu thanh khoản",
    LOSS_TOLERANCE: "Khả năng chịu lỗ",
    EXPERIENCE: "Kinh nghiệm đầu tư",
    FINANCIAL_CAPACITY: "Năng lực tài chính",
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
  const { v2Profile } = useFinancialProfile();
  const { notify } = useNotification();

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyStatus, setPolicyStatus] = useState<"UNCONFIGURED" | "AVAILABLE">("UNCONFIGURED");

  // User input answers: map of questionId -> choiceId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [horizonMonths, setHorizonMonths] = useState<number>(120);
  const [liquidityNeedMonths, setLiquidityNeedMonths] = useState<number>(6);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [previewResult, setPreviewResult] = useState<PortfolioPreviewResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Load published policy
  useEffect(() => {
    let active = true;
    setLoadingPolicy(true);
    fetchUserPortfolioPolicies(1, 1)
      .then(async (res) => {
        if (!active) return;
        setPolicyStatus(res.status);
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(res.items[0].id);
          if (active) {
            setPolicyDetail(detail);
            if (user) setAnswers(readRiskDraft(user.id, detail.id, detail.data.questions));
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
  }, []);

  const valuationMonth = useMemo(() => {
    return v2Profile?.valuationDate ? v2Profile.valuationDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  }, [v2Profile]);

  const questions = policyDetail?.data.questions || [];
  const allAnswered = questions.length > 0 && questions.every((q) => q.choices.some(c => c.id === answers[q.id]));

  const runPreview = async (overrideTemplateId?: string) => {
    if (!policyDetail || !allAnswered) return;

    const seq = ++requestSeq.current;
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
      setCalculationError(e instanceof Error ? e.message : (language === "en" ? "Could not analyze portfolio." : "Chưa thể phân tích danh mục."));
    } finally {
      if (seq === requestSeq.current) setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (policyDetail && allAnswered) {
      runPreview();
    }
  }, [policyDetail, answers, horizonMonths, liquidityNeedMonths]);

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
      {allAnswered && <p className="flow-note">{language === "en" ? "Answers are saved on this browser for your account. Continue to preview a retirement plan." : "Câu trả lời được giữ trên trình duyệt này theo tài khoản. Tiếp tục để xem trước kế hoạch hưu trí."} <Link className="button button-primary" to="/user/plan">{language === "en" ? "Preview plan" : "Xem trước kế hoạch"}</Link></p>}
      {/* Header */}
      <header style={{ marginBottom: "var(--space-6)" }}>
        <span className="section-eyebrow" style={{ color: "var(--color-primary)", fontWeight: 600, fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
          {language === "en" ? "INVESTMENT STRATEGY & RISK MANAGEMENT" : "CHIẾN LƯỢC ĐẦU TƯ & QUẢN TRỊ RỦI RO"}
        </span>
        <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 700, margin: "var(--space-1) 0 var(--space-2)" }}>
          {language === "en" ? "Risk Profile Assessment & Standard Portfolio Selection" : "Khảo sát khẩu vị rủi ro & Lựa chọn danh mục chuẩn"}
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-base)", maxWidth: "800px", margin: 0 }}>
          {language === "en"
            ? "A 6-dimensional risk assessment based on global standards combined with portfolio policies approved by the Risk Management Committee, recommending the optimal asset allocation for your retirement stage."
            : "Hệ thống khảo sát rủi ro 6 chiều theo chuẩn mực quốc tế kết hợp cùng chính sách danh mục được phê duyệt bởi Hội đồng Quản trị rủi ro, giúp đề xuất cấu trúc phân bổ tài sản phù hợp nhất với giai đoạn tích lũy của bạn."}
        </p>
      </header>

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
              ? "The Risk Management Committee has not yet published the standard portfolio policy version on the server (T04). Please return once published."
              : "Hội đồng quản trị rủi ro chưa công bố phiên bản chính sách danh mục chuẩn trên hệ thống máy chủ (T04). Vui lòng quay lại sau khi chính sách được công bố."}
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
                <Select
                  label={language === "en" ? "Expected Holding Duration" : "Thời gian dự kiến nắm giữ"}
                  options={language === "en"
                    ? ["36 months (3 years)", "60 months (5 years)", "120 months (10 years)", "180 months (15 years)", "240 months (20 years)"]
                    : ["36 tháng (3 năm)", "60 tháng (5 năm)", "120 tháng (10 năm)", "180 tháng (15 năm)", "240 tháng (20 năm)"]}
                  value={`${horizonMonths} ${language === "en" ? "months" : "tháng"} (${horizonMonths / 12} ${language === "en" ? "years" : "năm"})`}
                  onChange={(val) => {
                    const m = parseInt(val, 10);
                    if (Number.isFinite(m)) setHorizonMonths(m);
                  }}
                />
              </div>
              <div>
                <Input
                  type="number"
                  label={language === "en" ? "Contingency Liquidity Need (Months of expenses)" : "Nhu cầu thanh khoản dự phòng (Số tháng sinh hoạt)"}
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

                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {question.choices.map((choice) => {
                        const isSelected = selectedChoiceId === choice.id;
                        return (
                          <div
                            key={choice.id}
                            onClick={() => handleSelectChoice(question.id, choice.id)}
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
                            }}
                          >
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: isSelected ? 600 : 400 }}>
                              {choice.label}
                            </span>
                            <Badge tone={isSelected ? "success" : "neutral"}>
                              {choice.score} {language === "en" ? "pts" : "điểm"}
                            </Badge>
                          </div>
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
                    {language === "en"
                      ? `Rebalancing frequency: every ${selectedTemplate?.rebalance.everyMonths} months (Turnover fee: ${selectedTemplate?.rebalance.turnoverCostPercent}%).`
                      : `Tần suất tái cân bằng: mỗi ${selectedTemplate?.rebalance.everyMonths} tháng một lần (Phí tái cân bằng: ${selectedTemplate?.rebalance.turnoverCostPercent}%).`}
                  </p>
                </Card>
              </div>

              {/* Asset Allocations Breakdown */}
              {selectedTemplate && selectedTemplate.schedule.length > 0 && (
                <Card style={{ padding: "var(--space-4)", border: "1px solid var(--color-border)", marginBottom: "var(--space-6)" }}>
                  <h3 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>
                    {language === "en" ? `Asset Allocation Weights (${selectedTemplate.label})` : `Cơ cấu tỷ trọng phân bổ tài sản (${selectedTemplate.label})`}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
                    {selectedTemplate.schedule[0].allocations.map((alloc) => (
                      <div key={alloc.assetClass} style={{ padding: "var(--space-3)", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                          {language === "en" ? `Asset Class: ${alloc.assetClass}` : `Lớp tài sản: ${alloc.assetClass}`}
                        </span>
                        <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--space-1) 0" }}>
                          {alloc.weightPercent}%
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

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
                      return (
                        <Card key={sc.kind} style={{ padding: "var(--space-4)", border: isBase ? "2px solid var(--color-primary)" : "1px solid var(--color-border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                            <h4 style={{ margin: 0, fontSize: "var(--text-base)" }}>{sc.label}</h4>
                            <Badge tone={isBase ? "info" : isAdverse ? "danger" : "success"}>
                              {sc.kind}
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
