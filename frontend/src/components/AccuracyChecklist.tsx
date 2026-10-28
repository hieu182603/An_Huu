import { useState } from "react";
import { Link } from "react-router";
import { Card, Icon, type IconName } from "./ui";
import { useAuth } from "../context/AuthContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import "./accuracy-checklist.css";

interface ChecklistItemConfig {
  id: number;
  titleVi: string;
  titleEn: string;
  benefitVi?: string;
  benefitEn?: string;
  icon?: IconName;
  link?: string;
  done: boolean;
}

export function AccuracyChecklist({ id }: { id?: string } = {}) {
  const { user } = useAuth();
  const { v2Profile } = useFinancialProfile();
  const { language } = useI18n();
  const isEn = language === "en";

  const storageKey = user?.id ? `anhuu_checklist_hidden_${user.id}` : "anhuu_checklist_hidden";
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return localStorage.getItem(storageKey) === "true";
  });
  const [showReview, setShowReview] = useState(false);

  const toggleHidden = () => {
    setHidden((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(storageKey, String(next));
      }
      return next;
    });
  };

  // 7 checklist items according to T5 + redesign:
  // 1. Mong muốn và thời gian (always done)
  // 2. Bản kế hoạch đầu tiên (always done)
  // 3. Lương hưu BHXH
  // 4. Tài sản khác và phân bổ
  // 5. Chi tiết khoản vay
  // 6. Ràng buộc và mục tiêu khác
  // 7. Thông tin gia đình: Done when dependents.status === "KNOWN" (including 0) OR city is non-empty.
  const item1Done = true;
  const item2Done = true;
  const item3Done = Boolean(v2Profile?.pension && v2Profile.pension.status !== "UNKNOWN");
  const item4Done = Boolean(
    v2Profile?.assets &&
      v2Profile.assets.status === "KNOWN" &&
      v2Profile.assets.entries?.some((e) => e.id !== "ast_quick")
  );
  const noDebt = Boolean(
    v2Profile?.debts &&
      (v2Profile.debts.status === "NOT_APPLICABLE" ||
        (v2Profile.debts.status === "KNOWN" && (v2Profile.debts.entries?.length ?? 0) === 0))
  );
  const hasLoansWithoutContract = Boolean(
    v2Profile?.debts &&
      v2Profile.debts.status === "KNOWN" &&
      v2Profile.debts.entries?.some(
        (e) => !e.contract || e.contract.status !== "KNOWN"
      )
  );
  const item5Done = Boolean(
    noDebt ||
      (v2Profile?.debts &&
        v2Profile.debts.status === "KNOWN" &&
        v2Profile.debts.entries?.some(
          (e) =>
            (e.contract && e.contract.status === "KNOWN") ||
            (e.responsibility && e.responsibility.status === "KNOWN")
        ))
  );
  const item6Done = Boolean(
    (v2Profile?.lossTolerance?.amountVnd && v2Profile.lossTolerance.amountVnd.status === "KNOWN") ||
      (v2Profile?.lossTolerance?.percent && v2Profile.lossTolerance.percent.status === "KNOWN") ||
      (v2Profile?.goals?.status === "KNOWN" && (v2Profile.goals.entries?.length ?? 0) > 0) ||
      (v2Profile?.liquidityNeeds &&
        (v2Profile.liquidityNeeds.y1?.status === "KNOWN" ||
          v2Profile.liquidityNeeds.y3?.status === "KNOWN" ||
          v2Profile.liquidityNeeds.y5?.status === "KNOWN"))
  );
  const item7Done = Boolean(
    v2Profile?.personal &&
      (v2Profile.personal.dependents?.status === "KNOWN" ||
        (typeof v2Profile.personal.city === "string" && v2Profile.personal.city.trim().length > 0))
  );

  const items: ChecklistItemConfig[] = [
    {
      id: 1,
      titleVi: "Mong muốn và thời gian",
      titleEn: "Desire and timeline",
      done: item1Done,
    },
    {
      id: 2,
      titleVi: "Bản kế hoạch đầu tiên",
      titleEn: "First retirement plan",
      done: item2Done,
    },
    {
      id: 3,
      titleVi: "Lương hưu BHXH",
      titleEn: "Social insurance (BHXH) pension",
      benefitVi: "Kế hoạch đang chưa tính lương hưu. Thêm vào thường làm số tiền cần góp giảm đáng kể.",
      benefitEn: "The plan does not include pension yet. Adding it usually reduces required contributions significantly.",
      icon: "shield",
      link: "/user/account?tab=profile",
      done: item3Done,
    },
    {
      id: 4,
      titleVi: "Tài sản khác và phân bổ",
      titleEn: "Other assets & allocation",
      benefitVi: "Thêm vàng, cổ phiếu, bất động sản và cho biết phần nào dành cho hưu trí.",
      benefitEn: "Add gold, stocks, real estate and allocate portions for retirement.",
      icon: "wallet",
      link: "/user/account?tab=profile",
      done: item4Done,
    },
    {
      id: 5,
      titleVi: "Chi tiết khoản vay",
      titleEn: "Detailed loan contracts",
      benefitVi: hasLoansWithoutContract
        ? "Khoản vay đang được ước tính theo số trả hằng tháng. Thêm hợp đồng để tính lãi đúng."
        : "Khai báo thông tin các khoản vay để kế hoạch chính xác hơn.",
      benefitEn: hasLoansWithoutContract
        ? "Loans are estimated by monthly payments. Add contracts to calculate interest accurately."
        : "Declare loan details to make your plan more accurate.",
      icon: "file-text",
      link: "/user/debts",
      done: item5Done,
    },
    {
      id: 6,
      titleVi: "Ràng buộc và mục tiêu khác",
      titleEn: "Constraints and other goals",
      benefitVi: "Mức lỗ chịu được và các khoản cần tiền trước khi nghỉ hưu.",
      benefitEn: "Loss tolerance and liquidity needs before retirement.",
      icon: "target",
      link: "/user/account?tab=profile",
      done: item6Done,
    },
    {
      id: 7,
      titleVi: "Thông tin gia đình",
      titleEn: "Family information",
      benefitVi: "Người phụ thuộc và nơi sống, không bắt buộc.",
      benefitEn: "Dependents and city of residence, optional.",
      icon: "users",
      link: "/user/account?tab=profile",
      done: item7Done,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const remainingCount = 7 - completedCount;

  // Pending items in order 3 -> 4 -> 5 -> 6 -> 7
  const pendingItems = items.filter((i) => !i.done && i.id >= 3);
  const recommendedItem = pendingItems[0] ?? null;

  // Completed items: 1 and 2 always, plus any 3-7 that are done
  const completedItems = items.filter((i) => i.done);

  // When all 7 items are done, collapse into a single success row with a "Xem lại" button
  if (completedCount === 7 && !showReview) {
    return (
      <div id={id} className="accuracy-checklist-container">
        <Card className="accuracy-checklist-card accuracy-checklist accuracy-checklist--all-done">
          <div className="checklist-all-done-row">
            <div className="checklist-all-done-info">
              <span className="checklist-all-done-icon" aria-hidden="true">✓</span>
              <span className="checklist-all-done-text">
                {isEn ? "The plan uses all essential information" : "Kế hoạch đã dùng đủ thông tin quan trọng"}
              </span>
            </div>
            <button
              type="button"
              className="btn-review-checklist"
              onClick={() => setShowReview(true)}
              aria-label={isEn ? "Review completed checklist" : "Xem lại checklist"}
            >
              {isEn ? "Review" : "Xem lại"}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div id={id} className="accuracy-checklist-container">
      <Card className="accuracy-checklist-card accuracy-checklist">
        <div className="accuracy-checklist-header">
          <div className="checklist-header-main">
            <div className="checklist-header-title-row">
              <h3 className="checklist-title">
                {isEn ? "Make your plan more accurate" : "Làm kế hoạch chính xác hơn"}
              </h3>
              <span className="checklist-progress-badge">
                {isEn ? `Plan accuracy: ${completedCount}/7 items` : `Độ chính xác kế hoạch: ${completedCount}/7 mục`}
              </span>
            </div>

            <div
              className="checklist-progress-bar-container"
              role="progressbar"
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={7}
              aria-label={isEn ? `Plan accuracy: ${completedCount}/7 items` : `Độ chính xác kế hoạch: ${completedCount}/7 mục`}
            >
              <div className="checklist-progress-track">
                <div className={`checklist-progress-fill is-progress-${completedCount}`} />
              </div>
              <span className="checklist-progress-ratio">{completedCount}/7</span>
            </div>

            <p className="checklist-status-hint">
              {completedCount === 7
                ? (isEn ? "The plan uses all essential information" : "Kế hoạch đã dùng đủ thông tin quan trọng")
                : (isEn
                    ? `${remainingCount} remaining. Recommended next: ${recommendedItem ? (isEn ? recommendedItem.titleEn : recommendedItem.titleVi) : ""}`
                    : `Còn ${remainingCount} mục. Nên làm tiếp: ${recommendedItem ? recommendedItem.titleVi : ""}`)}
            </p>
          </div>

          <div className="checklist-header-actions">
            {completedCount === 7 && showReview && (
              <button
                type="button"
                className="btn-toggle-checklist"
                onClick={() => setShowReview(false)}
                aria-label={isEn ? "Hide review" : "Đóng xem lại"}
              >
                {isEn ? "Done reviewing" : "Đóng"}
              </button>
            )}
            <button
              type="button"
              className="btn-toggle-checklist"
              onClick={toggleHidden}
              aria-expanded={!hidden}
              aria-label={hidden ? (isEn ? "Expand checklist" : "Mở rộng checklist") : (isEn ? "Collapse checklist" : "Thu gọn checklist")}
            >
              {hidden ? (isEn ? "Expand checklist" : "Mở rộng checklist") : (isEn ? "Collapse checklist" : "Thu gọn checklist")}
            </button>
          </div>
        </div>

        <div className="accuracy-checklist-body" hidden={hidden}>
          {/* Pending items displayed first */}
          {pendingItems.length > 0 && (
            <div className="checklist-pending-list" role="list" aria-label={isEn ? "Pending checklist items" : "Mục chưa làm"}>
              {pendingItems.map((item) => {
                const isRecommended = item.id === recommendedItem?.id;
                const title = isEn ? item.titleEn : item.titleVi;
                const benefit = isEn ? item.benefitEn : item.benefitVi;

                return (
                  <div
                    key={item.id}
                    className={`checklist-action-row ${isRecommended ? "is-recommended" : ""}`}
                    role="listitem"
                  >
                    <div className="checklist-action-icon" aria-hidden="true">
                      {item.icon && <Icon name={item.icon} size="small" />}
                    </div>
                    <div className="checklist-action-content">
                      <span className="checklist-action-title">{title}</span>
                      {benefit && <p className="checklist-action-benefit">{benefit}</p>}
                    </div>
                    <div className="checklist-action-cta">
                      <Link
                        to={item.link ?? "#"}
                        className={`checklist-action-btn ${isRecommended ? "btn-primary" : "btn-secondary"}`}
                        aria-label={isEn ? `Add ${title}` : `Bổ sung ${title}`}
                      >
                        <span>{isEn ? "Add" : "Bổ sung"}</span>
                        <span className="checklist-arrow" aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed items grouped into a compact collapsible section (default closed) */}
          {completedItems.length > 0 && (
            <details className="checklist-completed-details" open={false}>
              <summary className="checklist-completed-summary">
                <span className="checklist-completed-summary-text">
                  ✓ {isEn ? `Completed (${completedCount})` : `Đã xong (${completedCount})`}
                </span>
                <Icon name="chevron-down" size="small" className="checklist-completed-chevron" />
              </summary>
              <ul className="checklist-completed-list">
                {completedItems.map((item) => {
                  const title = isEn ? item.titleEn : item.titleVi;
                  return (
                    <li key={item.id} className="checklist-completed-item">
                      <span className="checklist-completed-check" aria-hidden="true">✓</span>
                      <span className="checklist-completed-title">{title}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      </Card>
    </div>
  );
}

export default AccuracyChecklist;
