import PlanSyncStatus from "../components/PlanSyncStatus";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Checkbox, Icon, Input, Modal, useNotification } from "../components/ui";
import { MonthlyRetirementChart } from "../components/charts";
import { MonthlyCashflowTable } from "../components/retirement/MonthlyCashflowTable";
import { PlanVersionDrawer } from "../components/retirement/PlanVersionDrawer";
import { SocialInsuranceModal } from "../components/SocialInsuranceModal";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import type { SavedPlanVersionResult } from "../context/RetirementPlanContext";
import {
  formatVNDCurrency,
  translateIssueCode,
  translateWarningCode,
  type RetirementPreviewInput,
} from "../services/retirement";
import {
  fetchUserPortfolioPolicies,
  fetchUserPortfolioPolicyDetail,
  type PortfolioPolicyDetail,
} from "../services/portfolios";
import { useAuth } from "../context/AuthContext";
import { reviseSelection } from "../services/planSelection";
import { readRiskDraft } from "../services/riskDraft";
import { useI18n } from "../i18n";
import { formatMonthVN } from "../utils/date";

export default function RetirementPlanPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
  const {
    activePlan, synchronization,
    draftSelection, updateDraft, clearDraft,
    planVersions,
    currentVersion,
    previewData: manualPreviewData,
    previewStatus: manualPreviewStatus,
    previewIssues: manualPreviewIssues,
    previewError: manualPreviewError,
    lastInputHash: manualInputHash,
    lastPreviewInput: manualPreviewInput,
    loadingPlans,
    plansError,
    refreshPlans,
    runPreview,
    savePlanVersion,
    applyVersion,
    replayVersion,
  } = useRetirementPlan();

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState("");
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [savedPreview, setSavedPreview] = useState<{ key: string; version: SavedPlanVersionResult } | null>(null);
  const operation = useRef(false);
  const baseline = currentVersion?.preview.selection;
  const previewData = baseline ? synchronization.preview : manualPreviewData;
  const previewStatus = baseline ? synchronization.status : manualPreviewStatus;
  const previewIssues = baseline ? synchronization.preview?.issues ?? [] : manualPreviewIssues;
  const previewError = baseline ? synchronization.error : manualPreviewError;
  const lastInputHash = baseline ? synchronization.preview?.inputHash ?? null : manualInputHash;
  const lastPreviewInput = baseline ? synchronization.input : manualPreviewInput;
  const scenario = draftSelection?.scenario ?? baseline?.scenario ?? "BASE";
  const contributionTiming = draftSelection?.contributionTiming ?? baseline?.contributionTiming ?? "END_OF_MONTH";
  const funding = draftSelection?.startOfMonthFunding ?? baseline?.startOfMonthFunding;
  const startOfMonthAvailable = funding?.monthlyAvailable ?? "";
  const startOfMonthConfirmed = funding?.confirmed ?? false;
  const setContributionTiming = (value: "END_OF_MONTH" | "START_OF_MONTH") => updateDraft({ contributionTiming: value });
  const setStartOfMonthAvailable = (value: string) => updateDraft({ startOfMonthFunding: { ...funding, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: value, confirmed: startOfMonthConfirmed } });
  const setStartOfMonthConfirmed = (value: boolean) => updateDraft({ startOfMonthFunding: { ...funding, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: startOfMonthAvailable, confirmed: value } });
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => setSurveyAnswers(user && policyDetail ? readRiskDraft(user.id, policyDetail.id, policyDetail.data.questions) : {});
    read();
    window.addEventListener("anhuu_risk_survey_updated", read);
    return () => window.removeEventListener("anhuu_risk_survey_updated", read);
  }, [user?.id, policyDetail]);

  // Load published policy (optimized with caching and no redundant cancellation)
  useEffect(() => {
    let active = true;
    setPolicyError("");
    const policyId = draftSelection?.policyVersionId ?? baseline?.policyVersionId;
    if (policyId && policyDetail?.id === policyId) {
      setLoadingPolicy(false);
      return;
    }
    if (!policyId && loadingPlans) {
      return;
    }
    setLoadingPolicy(true);
    (policyId ? fetchUserPortfolioPolicyDetail(policyId) : fetchUserPortfolioPolicies(1, 1).then(async res =>
      res.status === "AVAILABLE" && res.items.length ? fetchUserPortfolioPolicyDetail(res.items[0].id) : null
    )).then(detail => {
      if (active && detail) setPolicyDetail(detail);
    })
      .catch(error => { if (active) setPolicyError(error instanceof Error ? error.message : String(error)); })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, [policyAttempt, draftSelection?.policyVersionId, baseline?.policyVersionId, loadingPlans, policyDetail?.id]);

  // Keep the user's full requested period. The server reports missing policy coverage;
  // silently shortening it would make the goal and plan describe different retirements.
  const defaultEndMonth = useMemo(() => {
    const birth = v2Profile?.personal.birthMonth;
    return birth?.status === "KNOWN"
      ? `${Number(birth.value.slice(0, 4)) + profile.goal.lifeExpectancy}-${birth.value.slice(5, 7)}`
      : null;
  }, [v2Profile?.personal.birthMonth, profile.goal.lifeExpectancy]);

  const effectiveAnswers = draftSelection?.answers ?? baseline?.answers ??
    (policyDetail?.data.questions ?? []).flatMap(q => surveyAnswers[q.id] ? [{ questionId: q.id, choiceId: surveyAnswers[q.id] }] : []);
  const hasCompleteSurvey = Boolean(policyDetail && policyDetail.data.questions.every(q =>
    effectiveAnswers.some(a => a.questionId === q.id && q.choices.some(c => c.id === a.choiceId))
  ));
  const usesActualBalance = Boolean(currentVersion?.preview.reforecast);
  const viewingCurrent = Boolean(currentVersion && ((!draftSelection && !synchronization.changed) || usesActualBalance));

  const previewPayload = useMemo<RetirementPreviewInput | null>(() => {
    if (baseline) return usesActualBalance ? baseline : synchronization.input;
    if (!policyDetail || !defaultEndMonth || !v2Profile) return null;
    const initial: RetirementPreviewInput = baseline ?? {
      expectedProfileRevision: profileRevision,
      policyVersionId: policyDetail.id,
      answers: effectiveAnswers,
      liquidityNeedMonths: 6,
      endMonth: defaultEndMonth,
      monthlyExpenseToday: String(profile.goal.monthlyExpenseInRetirement || profile.expenses.essentialExpense + profile.expenses.lifestyleExpense),
      monthlyContribution: "0",
      monthlyReserve: "0",
      terminalBalance: "0",
      retirementIncomeIds: v2Profile.income.status === "KNOWN" ? v2Profile.income.entries.filter(i => i.source === "PENSION").map(i => i.id) : [],
      retirementAdditionalExpenseIds: [],
      debtStress: [],
      housing: v2Profile.assets.status === "KNOWN" ? v2Profile.assets.entries.filter(a => a.housingPlan?.status === "CONFIRMED").map(a => ({
        assetId: a.id,
        amountScope: a.ownershipShare.status === "KNOWN" && a.ownershipShare.value === "1" ? "WHOLE_ASSET" as const : "OWNERS_SHARE" as const,
      })) : [],
      scenario: "BASE",
      contributionTiming: "END_OF_MONTH",
      surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
      
    };
    return reviseSelection(initial, draftSelection ?? {}, profileRevision);
  }, [baseline, JSON.stringify(synchronization.input), draftSelection, usesActualBalance, policyDetail, defaultEndMonth, v2Profile, profileRevision, profile, surveyAnswers]);

  useEffect(() => {
    if (!baseline && previewPayload && !viewingCurrent && !loadingPlans && !plansError) void runPreview(previewPayload);
  }, [previewPayload, viewingCurrent, loadingPlans, plansError]);

  const inputMatches = Boolean(previewPayload && lastPreviewInput && JSON.stringify(previewPayload) === JSON.stringify(lastPreviewInput));
  const canUsePreview = !viewingCurrent && inputMatches && previewStatus === "ready" && hasCompleteSurvey && !loadingPlans && !plansError;
  const previewKey = JSON.stringify([previewPayload, lastInputHash]);
  const savedForPreview = savedPreview?.key === previewKey ? savedPreview.version : null;

  useEffect(() => { if (!canUsePreview && !operation.current) setShowApplyConfirm(false); }, [canUsePreview]);

  const handleSaveVersion = async () => {
    if (operation.current || savedForPreview || !canUsePreview || !summary || !previewData || !lastInputHash || !previewPayload) {
      notify.error(
        language === "en" ? "Cannot Save" : "Chưa thể lưu",
        language === "en" ? "Need to complete forecast preview before saving version." : "Cần hoàn tất xem trước trước khi lưu phiên bản."
      );
      return;
    }
    operation.current = true; setIsSaving(true);
    try {
      const saved = await savePlanVersion(previewPayload, lastInputHash);
      if (saved) {
        setSavedPreview({ key: previewKey, version: saved });
        notify.success(
          language === "en" ? "New Version Saved" : "Đã lưu phiên bản mới",
          language === "en" ? `Version v${saved.version} was saved successfully to history.` : `Phiên bản v${saved.version} đã được lưu thành công vào lịch sử.`
        );
      }
    } catch (e) {
      notify.error(
        language === "en" ? "Save Version Error" : "Lỗi lưu phiên bản",
        e instanceof Error ? e.message : (language === "en" ? "Could not save version." : "Không thể lưu phiên bản.")
      );
    } finally {
      operation.current = false;
      setIsSaving(false);
    }
  };

  const handleApplyCurrent = async () => {
    if (operation.current || !canUsePreview || !summary || !previewPayload || !lastInputHash) return;
    operation.current = true; setIsApplying(true);
    try {
      // Apply exactly the preview shown in the confirmation, never the previous current version.
      const saved = savedForPreview ?? await savePlanVersion(previewPayload, lastInputHash);
      if (!saved) throw new Error(language === "en" ? "Could not save this preview." : "Chưa lưu được bản xem trước này.");
      setSavedPreview({ key: previewKey, version: saved });
      const applied = await applyVersion(saved.id, profileRevision, saved.planId, saved.planRevision);
      if (!applied) throw new Error(language === "en" ? "Version saved but not applied. Retry from version history." : "Đã lưu phiên bản nhưng chưa áp dụng được. Thử lại từ lịch sử phiên bản.");
      notify.success(language === "en" ? "Plan applied" : "Đã áp dụng kế hoạch", language === "en" ? `Version v${saved.version} is now official.` : `Phiên bản v${saved.version} đã trở thành kế hoạch chính thức.`);
      setShowApplyConfirm(false);
    } catch (e) {
      notify.error(language === "en" ? "Unable to apply" : "Chưa thể áp dụng", e instanceof Error ? e.message : String(e));
    } finally { operation.current = false; setIsApplying(false); }
  };

  const uniqueIssues = useMemo(() => {
    const seen = new Set<string>();
    return previewIssues.filter((iss) => {
      if (seen.has(iss.code)) return false;
      seen.add(iss.code);
      return true;
    });
  }, [previewIssues]);

  const hasRiskIssues = useMemo(
    () => uniqueIssues.some((i) => i.code === "ANSWER_REQUIRED" || i.code === "POLICY_NOT_COVERED" || i.code.includes("PORTFOLIO")),
    [uniqueIssues]
  );

  const hasProfileIssues = useMemo(
    () => uniqueIssues.some((i) => i.code !== "ANSWER_REQUIRED" && i.code !== "POLICY_NOT_COVERED" && !i.code.includes("PORTFOLIO")),
    [uniqueIssues]
  );

  const displayedPreview = viewingCurrent ? synchronization.preview : (canUsePreview ? previewData : null);
  const calculation = displayedPreview?.calculation;
  const summary = calculation?.summary;

  // The dial always measures progress to the required fund (100%). Only the
  // drawing is clamped; keep the API's actual coverage, including negative values.
  const coverageValue = summary?.atRetirement?.coveragePercent;
  const parsedCoverage = coverageValue == null || String(coverageValue).trim() === "" ? NaN : Number(coverageValue);
  const coveragePercentRaw = Number.isFinite(parsedCoverage) ? parsedCoverage : null;
  const locale = language === "en" ? "en-US" : "vi-VN";
  const unknown = language === "en" ? "Undetermined" : "Chưa xác định";
  const coverageFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const coverageText = coveragePercentRaw === null ? unknown
    : coveragePercentRaw > 99.99 && coveragePercentRaw < 100 ? "< 100"
    : coveragePercentRaw > 100 && coveragePercentRaw < 100.01 ? "> 100"
    : coveragePercentRaw > 0 && coveragePercentRaw < 0.01 ? `< ${coverageFormatter.format(0.01)}`
    : coveragePercentRaw < 0 && coveragePercentRaw > -0.01 ? `> ${coverageFormatter.format(-0.01)}`
    : coverageFormatter.format(coveragePercentRaw);
  const hasFundingShortfall = Boolean(summary && Number(summary.retirementFundingShortfall) > 0);
  const progressRatio = Math.min(1, Math.max(0, (coveragePercentRaw ?? 0) / 100));
  const arcOffset = 100 * (1 - progressRatio);

  const tipAngleDeg = 160 + 220 * progressRatio;
  const tipAngleRad = (tipAngleDeg * Math.PI) / 180;
  const tipX = 150 + 105 * Math.cos(tipAngleRad);
  const tipY = 130 + 105 * Math.sin(tipAngleRad);

  const isAppliedPlan = viewingCurrent;

  return (
    <>
      <div className="retirement-page-header">
        <div className="retirement-header-main">
          <div className="header-status-badge is-synced">
            <Icon name="chart" size="small" />
            <span>
              {isAppliedPlan && currentVersion
                ? (language === "en" ? `Official Plan v${currentVersion.version} (Active)` : `Kế hoạch chính thức v${currentVersion.version} (Đang áp dụng)`)
                : (language === "en" ? "Forecast Preview (Unapplied)" : "Bản dự phóng xem trước (Chưa áp dụng chính thức)")}
            </span>
          </div>
          <h1>{t("plan.page_title")}</h1>
          <p>{t("plan.page_subtitle")}</p>
        </div>

        <div className="header-quick-stats">
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Retirement Date" : "Thời điểm nghỉ hưu"}</span>
            <span className="stat-value">
              {formatMonthVN(
                summary?.retirementMonth ||
                  (v2Profile?.personal.desiredRetirementMonth?.status === "KNOWN"
                    ? v2Profile.personal.desiredRetirementMonth.value
                    : null)
              ) || (language === "en" ? "Undetermined" : "Chưa xác định")}
            </span>
          </div>
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Funding Status" : "Tình trạng quỹ"}</span>
            <span className={`stat-value ${summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "is-warning" : "is-safe"}`}>
              {!summary ? (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ") : parseFloat(summary.retirementFundingShortfall) > 0
                ? (language === "en" ? "Additional Capital Needed" : "Cần bổ sung vốn")
                : (language === "en" ? "No projected shortfall" : "Chưa ghi nhận thiếu hụt trong dự phóng")}
            </span>
          </div>
        </div>
      </div>

      {loadingPolicy && <p role="status">{language === "en" ? "Loading projection inputs…" : "Đang tải đầu vào dự phóng…"}</p>}
      {loadingPlans && <p role="status">{language === "en" ? "Loading saved plans…" : "Đang tải kế hoạch đã lưu…"}</p>}
      {plansError && <Alert tone="warning" title={language === "en" ? "Could not load saved plans" : "Chưa tải được kế hoạch đã lưu"} action={<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button>}>{plansError}</Alert>}
      {policyError && <Alert tone="warning" title={language === "en" ? "Could not load portfolio policy" : "Chưa tải được chính sách danh mục"} action={<Button onClick={() => setPolicyAttempt(value => value + 1)}>{language === "en" ? "Retry policy" : "Tải lại chính sách"}</Button>}>{policyError}</Alert>}
      {!viewingCurrent && !hasCompleteSurvey && !loadingPolicy && <Alert tone="warning" title={language === "en" ? "Choose your investment preferences" : "Cần hoàn tất lựa chọn đầu tư"}>
        {language === "en" ? "Answer the questions before saving a personal plan." : "Trả lời khảo sát để kế hoạch dùng đúng lựa chọn của bạn."} <Link to="/user/risk-portfolio">{language === "en" ? "Complete survey" : "Làm khảo sát đầu tư"}</Link>
      </Alert>}
      {!baseline && previewStatus === "loading" && <p role="status">{language === "en" ? "Calculating…" : "Đang tính kết quả…"}</p>}
      {!baseline && previewStatus === "error" && <Alert tone="danger" title={language === "en" ? "Could not calculate" : "Chưa tính được kết quả"} action={<Button onClick={() => previewPayload && runPreview(previewPayload)}>{language === "en" ? "Retry" : "Thử lại"}</Button>}>{previewError}</Alert>}
      {/* Warnings & Issues notification banners */}
      {!viewingCurrent && previewStatus === "incomplete" && uniqueIssues.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="warning"
            title={language === "en" ? "Incomplete Financial Data" : "Dữ liệu chưa hoàn tất"}
            action={
              <>
                {hasRiskIssues && (
                  <Link to="/user/risk-portfolio">
                    <Icon name="sparkles" size="small" />
                    {language === "en" ? "Complete Risk Assessment" : "Làm khảo sát rủi ro"}
                  </Link>
                )}
                {hasProfileIssues && (
                  <Link to="/user/account">
                    {language === "en" ? "Complete Financial Profile" : "Bổ sung hồ sơ tài chính"} <Icon name="arrow-right" size="small" />
                  </Link>
                )}
              </>
            }
          >
            <ul style={{ margin: "6px 0 0", paddingLeft: "20px", fontSize: "13px" }}>
              {uniqueIssues.map((iss, idx) => (
                <li key={idx}>{translateIssueCode(iss.code, language)}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      <PlanSyncStatus />
      {Boolean(displayedPreview?.warnings.length) && <details className="plan-explanation-details"><summary>{language === "en" ? "How these results are calculated" : "Cách tính và thông tin được dùng"}</summary><ul>{displayedPreview?.warnings.map((warn, idx) => <li key={idx}>{translateWarningCode(warn.code, language)}</li>)}</ul></details>}

      {Boolean(activePlan?.actualSourceChanged) && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="danger"
            title={language === "en" ? "Actual Source Changed" : "Số liệu thực tế đã thay đổi"}
          >
            {language === "en"
              ? "Actual transactions linked to this plan version have been modified. Please reconcile actuals and run a reforecast."
              : "Bạn đã sửa các khoản tiền vào hoặc ra dùng trong kế hoạch này. Hãy kiểm tra lại số dư tháng, rồi tính lại kế hoạch."}
          </Alert>
        </div>
      )}

      {usesActualBalance && <Alert tone="info" title={language === "en" ? "Keep your recorded balances" : "Giữ đúng số dư thực tế đã ghi"}>
        <p>{language === "en" ? "This plan already includes actual transactions. Use actual tracking to change contributions, income or expenses while keeping the recorded balance. Draft changes from other pages have not been applied." : "Kế hoạch này đã tính các giao dịch thực tế. Hãy sửa tiền góp, thu nhập hoặc chi tiêu tại Theo dõi thực tế để giữ đúng số dư đã ghi. Thay đổi nháp từ các trang khác chưa được áp dụng."}</p>
        <Link to="/user/simulation?tab=actuals">{language === "en" ? "Update from actual records" : "Mở Theo dõi thực tế để cập nhật"}</Link>
      </Alert>}
      {/* One settings card for everything that defines the monthly contribution (amount, reserve, timing),
          placed directly above the result so each edit is followed by its effect. */}
      <Card className="plan-settings">
        <div className="plan-settings__head">
          <div>
            <span className="plan-settings__eyebrow">{language === "en" ? "MONTHLY CONTRIBUTION" : "TIỀN GÓP HÀNG THÁNG"}</span>
            <h2>{language === "en" ? "Contribution settings" : "Thiết lập tiền góp"}</h2>
          </div>
          <div className="plan-settings__state">
            <Badge tone={viewingCurrent ? "success" : "honey"}>{viewingCurrent ? (language === "en" ? "Plan in use" : "Kế hoạch đang dùng") : (language === "en" ? "Draft" : "Bản nháp")}</Badge>
            {draftSelection && currentVersion && <Button variant="ghost" size="small" onClick={clearDraft}>{language === "en" ? "Discard draft and view current plan" : "Bỏ bản nháp, xem kế hoạch đang dùng"}</Button>}
          </div>
        </div>
        <p className="plan-settings__note">{viewingCurrent
          ? (language === "en" ? "You are viewing the saved plan in use. Editing a field creates a draft." : "Bạn đang xem kế hoạch đã lưu và đang sử dụng. Sửa một thông số sẽ tạo bản nháp.")
          : (language === "en" ? "These changes are a draft for this session. Save the option to keep it; using it replaces your current plan." : "Các thay đổi đang là bản nháp trong phiên này. Lưu phương án để giữ lại; chọn dùng phương án mới sẽ thay kế hoạch hiện tại.")}</p>

        <div className="plan-settings__grid">
          <Input type="number" min={0} label={language === "en" ? "Monthly retirement contribution (VND)" : "Tiền bạn chọn góp hưu trí mỗi tháng (đồng)"}
            helper={language === "en" ? "Money left after expenses and debt payments is not contributed automatically." : "Tiền còn lại sau chi tiêu và trả nợ không tự động được góp vào quỹ."}
            value={previewPayload?.monthlyContribution ?? "0"} disabled={loadingPlans || isSaving || isApplying || usesActualBalance} onChange={value => updateDraft({ monthlyContribution: value, contributionSchedule: [] })} />
          <Input type="number" min={0} label={language === "en" ? "Money reserved each month (VND)" : "Tiền giữ lại mỗi tháng ngoài quỹ hưu trí (đồng)"}
            helper={language === "en" ? "Kept for emergencies or other goals; not invested for retirement." : "Để dành cho dự phòng hoặc mục tiêu khác, không đưa vào quỹ hưu trí."}
            value={previewPayload?.monthlyReserve ?? "0"} disabled={loadingPlans || isSaving || isApplying || usesActualBalance} onChange={value => updateDraft({ monthlyReserve: value })} />
          <fieldset className="plan-timing" disabled={loadingPlans || isSaving || isApplying || usesActualBalance}>
            <legend>{language === "en" ? "When you contribute" : "Thời điểm góp vào quỹ"}</legend>
            <div className="plan-timing__options">
              <Button
                variant={contributionTiming === "END_OF_MONTH" ? "primary" : "secondary"}
                size="small"
                className="plan-timing__option"
                onClick={() => setContributionTiming("END_OF_MONTH")}
                disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                aria-pressed={contributionTiming === "END_OF_MONTH"}
              >
                {language === "en" ? "End of month" : "Cuối mỗi tháng"}
              </Button>
              <Button
                variant={contributionTiming === "START_OF_MONTH" ? "primary" : "secondary"}
                size="small"
                className="plan-timing__option"
                onClick={() => setContributionTiming("START_OF_MONTH")}
                disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                aria-pressed={contributionTiming === "START_OF_MONTH"}
              >
                {language === "en" ? "Start of Month" : "Đầu mỗi tháng"}
              </Button>
            </div>
            <p className="plan-timing__hint" aria-live="polite">{contributionTiming === "START_OF_MONTH"
              ? (language === "en" ? "Contributed on the 1st and invested for the whole month; needs cash already available." : "Góp ngay đầu tháng nên tiền được đầu tư trọn tháng; cần có sẵn tiền từ đầu tháng.")
              : (language === "en" ? "Default. Contributed after the month's income arrives; safest when you are unsure." : "Mặc định. Góp sau khi nhận thu nhập trong tháng; an toàn nhất nếu bạn chưa chắc.")}</p>
          </fieldset>
        </div>

        {contributionTiming === "START_OF_MONTH" && (
          <div className="plan-settings__start">
            <Input type="number" min={0}
              label={language === "en" ? "Available Disposable Cash at Start (VND) *" : "Tiền sẵn có để góp vào đầu tháng (đồng) *"}
              helper={language === "en" ? "Money already in hand on the 1st, not taken from the retirement fund." : "Tiền đã có trong tay ngày đầu tháng, không trích từ quỹ hưu trí."}
              placeholder="VD: 5000000"
              disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
              value={startOfMonthAvailable}
              onChange={setStartOfMonthAvailable} />
            <div className="plan-settings__confirm">
              <Checkbox
                checked={startOfMonthConfirmed}
                disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                onChange={setStartOfMonthConfirmed}
                label={language === "en"
                  ? "I confirm this disposable cash is available at the start of each month (not drawn from fund balance)."
                  : "Tôi xác nhận nguồn tiền này đã sẵn có vào đầu mỗi tháng để đóng góp (không trích từ số dư quỹ hưu trí)."} />
              {!startOfMonthConfirmed && (
                <p className="plan-settings__warning" role="status">
                  <Icon name="alert" size="small" />
                  {language === "en"
                    ? "Start-of-month timing requires explicit user confirmation of disposable funds available at month start."
                    : "Đóng góp đầu tháng yêu cầu xác nhận rõ ràng nguồn tiền khả dụng đã sẵn có đầu tháng."}
                </p>
              )}
            </div>
          </div>
        )}

        {displayedPreview?.replayInput?.contributionStartMonth && (
          <p className="plan-settings__meta">
            <Icon name="compass" size="small" />
            {language === "en"
              ? `Contribution calculation begins from: ${displayedPreview.replayInput.contributionStartMonth}`
              : `Kỳ bắt đầu tính toán đóng góp: Tháng ${displayedPreview.replayInput.contributionStartMonth}`}
          </p>
        )}

        {summary?.savingsStatus === "EARLY_FUNDING_REQUIRED" && (
          <Alert tone="warning" title={language === "en" ? "Early Funding Required" : "Yêu cầu nguồn vốn đầu kỳ"}>
            {language === "en"
              ? "Additional disposable funds are required before the eligible contribution window opens."
              : "Cần bổ sung nguồn vốn khả dụng trước khi kỳ đóng góp đủ điều kiện bắt đầu."}
          </Alert>
        )}

        {summary?.savingsStatus === "NO_ELIGIBLE_CONTRIBUTION_PERIOD" && (
          <Alert tone="warning" title={language === "en" ? "No Eligible Contribution Period" : "Không có kỳ đóng góp đủ điều kiện"}>
            {language === "en"
              ? "An accumulation phase exists, but no eligible contribution months were found within the planning horizon."
              : "Tồn tại giai đoạn tích lũy nhưng không tìm thấy kỳ đóng góp đủ điều kiện nào trong chân trời kế hoạch."}
          </Alert>
        )}

        <nav className="plan-settings__links" aria-label={language === "en" ? "Related settings" : "Thiết lập liên quan"}>
          <span>{language === "en" ? "Also adjust:" : "Điều chỉnh thêm:"}</span>
          <Link to="/user/goal">{language === "en" ? "Edit goal" : "Sửa mục tiêu"}</Link>
          <Link to="/user/risk-portfolio">{language === "en" ? "Choose investments" : "Chọn cách đầu tư"}</Link>
          <Link to="/user/debts">{language === "en" ? "Review debt budget" : "Kiểm tra ngân sách trả nợ"}</Link>
          {currentVersion && <Link to="/user/simulation">{language === "en" ? "Try changes" : "Thử thay đổi kế hoạch"}</Link>}
        </nav>
      </Card>

      {/* Primary Result Hero */}
      <motion.div
        className="plan-result-hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="plan-result-copy">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            <Badge tone="soft">{language === "en" ? "MONTHLY PROJECTION" : "DỰ PHÓNG THEO THÁNG"}</Badge>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {language === "en"
                ? `Scenario: ${scenario === "BASE" ? "Baseline" : scenario === "ADVERSE" ? "Adverse" : "Favorable"}`
                : `Kịch bản: ${scenario === "BASE" ? "Cơ sở" : scenario === "ADVERSE" ? "Bất lợi" : "Thuận lợi"}`}
            </span>
          </div>

          <span className="result-kicker">
            {language === "en"
              ? `TOTAL RETIREMENT FUND NEEDED AT RETIREMENT MONTH (${summary?.retirementMonth ? formatMonthVN(summary.retirementMonth) : "..."})`
              : `TỔNG QUỸ HƯU TRÍ CẦN CÓ TẠI THÁNG NGHỈ HƯU (${summary?.retirementMonth ? formatMonthVN(summary.retirementMonth) : "..."})`}
          </span>
          <strong className="result-total">
            {summary?.atRetirement?.requiredFund
              ? formatVNDCurrency(summary.atRetirement.requiredFund)
              : previewStatus === "loading"
              ? (language === "en" ? "Calculating..." : "Đang tính toán...")
              : previewStatus === "incomplete"
              ? (language === "en" ? "Awaiting Valid Inputs" : "Chờ dữ liệu hợp lệ")
              : (language === "en" ? "No Projection" : "Chưa có dự phóng")}
          </strong>

          <p>
            {language === "en" ? (
              <>
                Projects living cash flow of <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "..."} / month</strong> (inflation adjusted) across {summary?.retirementMonths ?? "..."} retirement months until end of {summary?.endMonth ? formatMonthVN(summary.endMonth) : "..."}.
              </>
            ) : (
              <>
                Dự kiến dòng tiền sinh hoạt <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "..."} / tháng</strong> (đã điều chỉnh trượt giá lạm phát) suốt {summary?.retirementMonths ?? "..."} tháng hưu trí đến hết tháng {summary?.endMonth ? formatMonthVN(summary.endMonth) : "..."}.
              </>
            )}
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Initial fund capital (liquid):" : "Tiền có thể đưa vào quỹ lúc bắt đầu:"}</span>
              <strong>{summary ? formatVNDCurrency(summary.initialRetirementCapital) : unknown}</strong>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Overall net worth:" : "Tổng tài sản trừ tổng nợ:"}</span>
              <strong>{calculation?.netWorth != null ? formatVNDCurrency(calculation.netWorth) : unknown}</strong>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Projected accumulated fund (A):" : "Số tiền dự kiến có khi nghỉ hưu:"}</span>
              <strong style={{ color: "var(--color-mist-300)" }}>{summary ? formatVNDCurrency(summary.atRetirement.projectedFund) : unknown}</strong>
            </div>
          </div>

          {savedForPreview && <p role="status">{language === "en" ? `This preview is saved as v${savedForPreview.version}.` : `Bản xem trước này đã lưu thành phiên bản v${savedForPreview.version}.`}</p>}
          {/* Two decisions first (apply / save), then compact tools; labels never wrap mid-button. */}
          <div className="plan-hero-actions">
            <div className="plan-hero-actions__main">
              <Button
                variant="primary"
                size="medium"
                className={`plan-hero-action plan-hero-action--apply${isAppliedPlan ? " is-done" : ""}`}
                disabled={isApplying || isSaving || !summary || !canUsePreview || isAppliedPlan}
                icon={isAppliedPlan ? "circle-check" : "target"}
                onClick={() => setShowApplyConfirm(true)}
              >
                {isAppliedPlan ? (language === "en" ? "Current plan" : "Đang là kế hoạch hiện tại") : (language === "en" ? "Apply to official plan" : "Dùng làm kế hoạch hiện tại")}
              </Button>
              <Button
                variant="secondary"
                size="medium"
                className={`plan-hero-action plan-hero-action--save${savedForPreview ? " is-done" : ""}`}
                disabled={isSaving || isApplying || !summary || !canUsePreview || Boolean(savedForPreview)}
                icon={savedForPreview ? "circle-check" : "check"}
                onClick={handleSaveVersion}
              >
                {isSaving ? (language === "en" ? "Saving..." : "Đang lưu…") : savedForPreview ? (language === "en" ? `Saved as v${savedForPreview.version}` : `Đã lưu bản v${savedForPreview.version}`) : (language === "en" ? "Save this version" : "Lưu phương án này")}
              </Button>
            </div>
            <div className="plan-hero-actions__tools" role="group" aria-label={language === "en" ? "More plan tools" : "Công cụ khác của kế hoạch"}>
              <Button
                variant="ghost"
                size="small"
                className="plan-hero-tool"
                aria-label={language === "en" ? `View history (${planVersions.length} versions)` : `Xem lịch sử (${planVersions.length} bản)`}
                icon="file-text"
                onClick={() => setIsVersionDrawerOpen(true)}
                disabled={isApplying || isSaving || loadingPlans || Boolean(plansError)}
              >
                {language === "en" ? "History" : "Lịch sử"}
                <span className="plan-hero-tool__count" aria-hidden="true">{planVersions.length}</span>
              </Button>
              <Button
                variant="ghost"
                size="small"
                className="plan-hero-tool"
                aria-label={language === "en" ? "Social Insurance (BHXH)" : "Thẩm định & Ước tính BHXH"}
                icon="sparkles"
                onClick={() => setShowInsuranceModal(true)}
                disabled={isApplying || isSaving}
                title={language === "en" ? "Assess and estimate social insurance (BHXH) pension" : "Thẩm định và ước tính lương hưu BHXH"}
              >
                {language === "en" ? "BHXH estimate" : "Ước tính BHXH"}
              </Button>
              <Button
                variant="ghost"
                size="small"
                className="plan-hero-tool"
                icon="download"
                onClick={() => window.print()}
                disabled={isApplying || isSaving || !summary}
                title={language === "en" ? "Print or save this retirement plan as PDF" : "In hoặc lưu kế hoạch hưu trí này dưới dạng PDF"}
              >
                {language === "en" ? "Print / PDF" : "In / PDF"}
              </Button>
            </div>
          </div>
        </div>

        <div className={`plan-progress-panel ${coveragePercentRaw === null ? "is-unknown" : hasFundingShortfall ? "is-warning" : "is-safe"}`}>
          <div className="ring-ambient-glow" />

          {/* An open path prevents the dash from wrapping into the dial's gap. */}
          <div className="plan-progress-ring">
            <svg viewBox="0 0 300 230" className="progress-ring-svg" role="img" aria-label={language === "en" ? `Fund coverage: ${coverageText}${coveragePercentRaw === null ? "" : "%"}. Target: 100%.` : `Mức bao phủ quỹ: ${coverageText}${coveragePercentRaw === null ? "" : "%"}. Mục tiêu: 100%.`}>
              <defs>
                <linearGradient id="gaugeSafeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7096d1" />
                  <stop offset="100%" stopColor="#c1e8ff" />
                </linearGradient>
                <linearGradient id="gaugeWarnGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#e3b04f" />
                  <stop offset="100%" stopColor="#f6dca4" />
                </linearGradient>
                <filter id="gaugeGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)"} />
                </filter>
              </defs>

              {/* Background Arch Track */}
              <path
                d="M 51.33 165.91 A 105 105 0 1 1 248.67 165.91"
                className="ring-base-track"
              />

              {/* Active Gradient Arc */}
              <path
                d="M 51.33 165.91 A 105 105 0 1 1 248.67 165.91"
                pathLength="100"
                className="ring-main-arc"
                stroke={progressRatio === 0 ? "transparent" : hasFundingShortfall ? "url(#gaugeWarnGradient)" : "url(#gaugeSafeGradient)"}
                strokeDasharray="100 100"
                style={{
                  strokeDashoffset: `${arcOffset}`,
                }}
                filter="url(#gaugeGlowFilter)"
              />

              {/* Glowing Tip Marker at Current Progress */}
              {progressRatio > 0 && (
                <g className="gauge-tip-marker">
                  <circle cx={tipX} cy={tipY} r="5.5" fill="#ffffff" filter="url(#gaugeGlowFilter)" />
                  <circle cx={tipX} cy={tipY} r="3" fill={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "#f2c46d" : "#c1e8ff"} />
                </g>
              )}

              {/* Milestone labels at ends of arch */}
              <text x="51" y="193" className="gauge-milestone-text">0%</text>
              <text x="249" y="193" className="gauge-milestone-text">100%</text>
            </svg>

            <div className="ring-center-content">
              <div className="ring-number-row">
                <span className="ring-number" style={coveragePercentRaw === null || coverageText.length > 10 ? { fontSize: "min(20px, 7cqw)" } : coverageText.length > 6 ? { fontSize: "min(30px, 10cqw)" } : undefined}>
                  {coverageText}
                </span>
                {coveragePercentRaw !== null && <span className="ring-unit">%</span>}
              </div>
              <div className="ring-status-pill">
                <span>{language === "en" ? "FUND COVERAGE" : "MỨC BAO PHỦ QUỸ"}</span>
              </div>
            </div>
          </div>
          <p className="gauge-explanation">
            {language === "en" ? "100% = the required fund at retirement." : "100% = đủ quỹ cần tại thời điểm nghỉ hưu."}
            {coveragePercentRaw !== null && coveragePercentRaw > 100 && (
              <span className="gauge-multiplier-tag">{language === "en"
                ? `About ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(coveragePercentRaw / 100)} times the required fund.`
                : `Gấp khoảng ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(coveragePercentRaw / 100)} lần quỹ cần.`}</span>
            )}
          </p>

          <div className="plan-status-card">
            <div className="status-card-header">
              <span className="status-badge-indicator">
                <span className="status-pulse-dot" />
                {!summary ? unknown : parseFloat(summary.retirementFundingShortfall) > 0
                  ? (language === "en" ? "Funding Shortfall" : "Còn thiếu hụt")
                  : (language === "en" ? "No projected shortfall" : "Không thiếu hụt trong dự phóng")}
              </span>
              <strong className="status-card-amount">
                {!summary ? "—" : parseFloat(summary.retirementFundingShortfall) > 0
                  ? `-${formatVNDCurrency(summary.retirementFundingShortfall)}`
                  : `${Number(summary.excessAtRetirement) > 0 ? "+" : ""}${formatVNDCurrency(summary.excessAtRetirement)}`}
              </strong>
            </div>
            <p className="status-card-desc">
              {!summary ? (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ") : parseFloat(summary.retirementFundingShortfall) > 0
                ? summary.firstShortfallMonth
                  ? (language === "en" ? `First cash shortfall month: ${summary.firstShortfallMonth}. Additional contribution required.` : `Tháng đầu tiên thiếu hụt dòng tiền: ${summary.firstShortfallMonth}. Cần bổ sung đóng góp.`)
                  : (language === "en" ? "Increase contributions or adjust retirement spending." : "Cần tăng cường đóng góp hoặc điều chỉnh mức chi tiêu.")
                : (language === "en" ? "Result depends on the selected assumptions and projection period." : "Kết quả phụ thuộc giả định và khoảng thời gian dự phóng đã chọn.")}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 4 Plan Key Metrics */}
      <motion.div
        className="plan-metrics"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
      >
        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Projected Accumulated Fund" : "Quỹ dự kiến tích lũy"}</span>
            <Icon name="wallet" />
          </div>
          <strong>{summary ? formatVNDCurrency(summary.atRetirement.projectedFund) : unknown}</strong>
          <small>{language === "en" ? "Includes initial liquid capital and invested future contributions" : "Gồm tiền ban đầu, tiền góp thêm và lãi hoặc lỗ đầu tư dự kiến"}</small>
        </Card>

        <Card className="plan-metric-card tone-warning">
          <div>
            <span>{language === "en" ? "Capital Funding Gap" : "Số tiền còn thiếu so với mục tiêu"}</span>
            <Icon name="alert" />
          </div>
          <strong style={{ color: summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
            {!summary ? unknown : parseFloat(summary.retirementFundingShortfall) > 0
              ? formatVNDCurrency(summary.retirementFundingShortfall)
              : (language === "en" ? "Fully Met" : "Đã đạt trọn vẹn")}
          </strong>
          <small>
            {summary?.additionalMonthlyContribution != null
              ? (language === "en" ? `Additional contribution: ${formatVNDCurrency(summary.additionalMonthlyContribution)} per month` : `Đóng góp bổ sung: ${formatVNDCurrency(summary.additionalMonthlyContribution)} mỗi tháng`)
              : (language === "en" ? "Additional contribution is not determined." : "Chưa xác định được mức đóng góp bổ sung.")}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Required Contribution / Month" : "Mức góp cần thiết / tháng"}</span>
            <Icon name="target" />
          </div>
          <strong>
            {summary?.requiredConstantMonthlyContribution != null
              ? formatVNDCurrency(summary.requiredConstantMonthlyContribution)
              : unknown}
          </strong>
          <small>
            {language === "en"
              ? "Steady contribution estimated under the selected assumptions and projection period."
              : "Mức đóng góp đều đặn ước tính theo giả định và khoảng thời gian dự phóng đã chọn."}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Accumulation Duration" : "Thời gian tích lũy"}</span>
            <Icon name="compass" />
          </div>
          <strong>{summary ? `${summary.accumulationMonths} ${language === "en" ? "months" : "tháng"}` : unknown}</strong>
          <small>{language === "en" ? "Until retirement start month:" : "Đến tháng bắt đầu nghỉ hưu:"} {summary?.retirementMonth ? formatMonthVN(summary.retirementMonth) : "..."}</small>
        </Card>
      </motion.div>

      {/* Monthly Retirement Cashflow Chart */}
      {calculation && summary && (
        <Card style={{ marginTop: "24px", padding: "24px", borderRadius: "12px" }}>
          <MonthlyRetirementChart rows={calculation.rows} summary={summary} />
        </Card>
      )}

      {/* Monthly Cashflow Table & CSV Export */}
      {calculation && summary && (
        <Card style={{ marginTop: "24px", padding: "24px", borderRadius: "12px" }}>
          <MonthlyCashflowTable
            key={displayedPreview?.inputHash}
            rows={calculation.rows}
            summary={summary}
            previewData={displayedPreview ?? null}
            isApplied={isAppliedPlan}
            planId={isAppliedPlan ? activePlan?.id : undefined}
            versionId={isAppliedPlan ? activePlan?.currentVersionId ?? undefined : undefined}
          />
        </Card>
      )}

      {/* Plan Version Drawer */}
      <PlanVersionDrawer
        isOpen={isVersionDrawerOpen}
        onClose={() => { if (!isApplying) setIsVersionDrawerOpen(false); }}
        plan={activePlan}
        versions={planVersions}
        onApplyVersion={async (vId) => {
          if (operation.current || loadingPlans || plansError) return;
          operation.current = true;
          setIsApplying(true);
          try {
            const revision = profileRevision > 0 ? profileRevision : 1;
            const applied = await applyVersion(vId, revision, activePlan?.id, activePlan?.revision);
            if (applied === false) {
              notify.error(
                language === "en" ? "Apply Error" : "Lỗi áp dụng phiên bản",
                language === "en" ? "Server rejected plan application." : "Máy chủ từ chối áp dụng phiên bản này."
              );
              return;
            }
            notify.success(
              language === "en" ? "Version Applied" : "Áp dụng phiên bản thành công",
              language === "en" ? "Version has become your official plan." : "Phiên bản đã được chuyển thành kế hoạch chính thức."
            );
            setIsVersionDrawerOpen(false);
          } catch (e) {
            notify.error(
              language === "en" ? "Apply Error" : "Lỗi áp dụng phiên bản",
              e instanceof Error ? e.message : (language === "en" ? "Could not apply version." : "Không thể áp dụng.")
            );
          } finally {
            operation.current = false;
            setIsApplying(false);
          }
        }}
        onReplayVersion={(vId) => replayVersion(vId)}
        isApplying={isApplying}
      />

      {/* Apply Confirmation Modal */}
      <Modal open={showApplyConfirm} title={language === "en" ? "Confirm Retirement Plan Application" : "Xác nhận đổi kế hoạch đang dùng"} onClose={() => { if (!isApplying) setShowApplyConfirm(false); }}>
            {savedForPreview && <p role="status">{language === "en" ? `Preview saved as v${savedForPreview.version}. Confirming applies this saved version.` : `Bản xem trước đã lưu thành v${savedForPreview.version}. Xác nhận sẽ áp dụng chính phiên bản này.`}</p>}
            <p style={{ margin: "0 0 16px", fontSize: "14px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
              {language === "en"
                ? "This version will become your account's official plan. All tracking and dashboard metrics will benchmark against this plan."
                : "Phương án này sẽ thay kế hoạch đang dùng. Trang Tổng quan, Theo dõi thực tế và trợ lý AI sẽ dùng số liệu của phương án này. Các phương án cũ vẫn được giữ trong lịch sử."}
            </p>

            <div style={{ background: "var(--color-surface-subtle)", padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Retirement Month:" : "Tháng nghỉ hưu:"}</span>
                <strong>{summary?.retirementMonth ? formatMonthVN(summary.retirementMonth) : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Required Fund at Retirement (K):" : "Quỹ cần tại tuổi hưu (K):"}</span>
                <strong>{summary?.atRetirement?.requiredFund ? formatVNDCurrency(summary.atRetirement.requiredFund) : "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Goal Coverage Rate:" : "Độ bao phủ mục tiêu:"}</span>
                <strong style={{ color: coveragePercentRaw === null ? "var(--color-text-muted)" : hasFundingShortfall ? "var(--color-warning)" : "var(--color-success)" }}>{coveragePercentRaw === null ? unknown : `${coverageText}%`}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Button
                variant="ghost"
                onClick={() => setShowApplyConfirm(false)}
                disabled={isApplying}
              >
                {language === "en" ? "Cancel" : "Hủy bỏ"}
              </Button>
              <Button
                variant="primary"
                onClick={handleApplyCurrent}
                loading={isApplying}
                disabled={isApplying || isSaving || !canUsePreview || !summary}
              >
                {language === "en" ? "Confirm Apply" : "Dùng làm kế hoạch hiện tại"}
              </Button>
            </div>
      </Modal>

      <SocialInsuranceModal
        open={showInsuranceModal}
        onClose={() => setShowInsuranceModal(false)}
        language={language === "en" ? "en" : "vi"}
        initialBenefitDate={
          v2Profile?.personal?.pensionStartMonth?.status === "KNOWN" && v2Profile.personal.pensionStartMonth.value
            ? `${v2Profile.personal.pensionStartMonth.value}-01`
            : undefined
        }
      />
    </>
  );
}
