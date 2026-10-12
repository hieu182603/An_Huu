import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { Alert, Button, Card, Icon, Modal } from "./ui";
import { useI18n } from "../i18n";

function getRouteContext(pathname: string, isEn: boolean) {
  if (pathname.includes("/user/goal")) {
    return {
      badge: isEn ? "PROFILE REQUIRED · ~5 MINS" : "CẦN HỒ SƠ TÀI CHÍNH · ~5 PHÚT",
      title: isEn ? "Set Accurate Retirement Goals" : "Thiết lập mục tiêu hưu trí chính xác",
      desc: isEn
        ? "To project the exact nest egg needed for a worry-free retirement, An Huu needs your basic income and spending baseline."
        : "Để dự phóng chính xác số tiền cần tích lũy cho tuổi già viên mãn, An Hưu cần thông tin thu nhập và chi tiêu cơ bản từ khảo sát của bạn.",
    };
  }
  if (pathname.includes("/user/plan")) {
    return {
      badge: isEn ? "DATA REQUIRED · ~5 MINS" : "CẦN DỮ LIỆU THỰC · ~5 PHÚT",
      title: isEn ? "Personalize Your Retirement Plan" : "Cá nhân hóa kế hoạch hưu trí",
      desc: isEn
        ? "The plan is currently showing illustrative sample figures. Complete the 5-minute survey to get your real cashflow and asset allocation roadmap."
        : "Kế hoạch hưu trí hiện đang hiển thị số liệu mẫu minh họa. Hãy làm khảo sát khoảng 5 phút để nhận bảng dòng tiền và chiến lược tích lũy thực tế.",
    };
  }
  if (pathname.includes("/user/simulation")) {
    return {
      badge: isEn ? "ACCURACY BOOST · ~5 MINS" : "MÔ PHỎNG CHÍNH XÁC · ~5 PHÚT",
      title: isEn ? "Real-Life Monte Carlo Simulation" : "Mô phỏng tài chính theo dữ liệu thực",
      desc: isEn
        ? "Monte Carlo simulations reflect your true retirement readiness when backed by your actual income, expenses, and asset portfolio."
        : "Biểu đồ mô phỏng Monte Carlo phản ánh chuẩn xác nhất khi có số liệu thu nhập, chi tiêu và danh mục tài sản thực của bạn.",
    };
  }
  if (pathname.includes("/user/debts")) {
    return {
      badge: isEn ? "DEBT ANALYSIS · ~5 MINS" : "QUẢN LÝ DÒNG TIỀN · ~5 PHÚT",
      title: isEn ? "Debt Optimization & Cashflow" : "Phân tích và tối ưu hóa nợ",
      desc: isEn
        ? "Provide your current debt details to calculate debt-to-income ratios and generate an optimal payoff schedule for your cashflow."
        : "Khảo sát hồ sơ sẽ giúp phân loại nợ mua nhà, nợ tiêu dùng và lập lịch trả nợ an toàn cho dòng tiền của bạn.",
    };
  }
  if (pathname.includes("/user/risk-portfolio")) {
    return {
      badge: isEn ? "PORTFOLIO FIT · ~5 MINS" : "DANH MỤC CÂN BẰNG · ~5 PHÚT",
      title: isEn ? "Asset Allocation & Risk Profile" : "Khẩu vị rủi ro & Danh mục tài sản",
      desc: isEn
        ? "Complete the baseline survey to receive personalized investment portfolio allocations suited to your retirement horizon."
        : "Hoàn tất khảo sát hồ sơ ban đầu để hệ thống gợi ý danh mục đầu tư cân bằng và phòng vệ rủi ro tối ưu.",
    };
  }
  if (pathname.includes("/user/assistant")) {
    return {
      badge: isEn ? "SMART ADVISOR · ~5 MINS" : "TƯ VẤN THÔNG MINH · ~5 PHÚT",
      title: isEn ? "Empower Your AI Retirement Advisor" : "Trợ lý AI cần hồ sơ để tư vấn chuyên sâu",
      desc: isEn
        ? "Your AI retirement advisor gives the most actionable advice when it knows your age, current savings, and pension contributions."
        : "Trợ lý AI An Hưu sẽ đưa ra các khuyến nghị hưu trí sát thực tế nhất khi nắm rõ độ tuổi, thu nhập và thời gian đóng BHXH của bạn.",
    };
  }
  if (pathname.includes("/user/dashboard")) {
    return {
      badge: isEn ? "REAL DATA NEEDED · ~5 MINS" : "CẦN DỮ LIỆU THỰC · ~5 PHÚT",
      title: isEn ? "Personalize Your Financial Dashboard" : "Cá nhân hóa bảng điều khiển tài chính",
      desc: isEn
        ? "Your dashboard is currently showing illustrative sample figures. Complete the 5-minute survey to get your real net worth, cashflow, and retirement progress."
        : "Bảng điều khiển hiện đang hiển thị số liệu mẫu minh họa. Hãy làm khảo sát khoảng 5 phút để hệ thống cập nhật tài sản ròng, dòng tiền và lộ trình hưu trí thực tế của bạn.",
    };
  }
  if (pathname.includes("/user/explore")) {
    return {
      badge: isEn ? "BENCHMARK DATA · ~5 MINS" : "ĐỐI SÁNH HỒ SƠ · ~5 PHÚT",
      title: isEn ? "Compare With Your Financial Profile" : "Đối sánh với hồ sơ tài chính của bạn",
      desc: isEn
        ? "Complete your profile survey to compare your assets, income, and pension projection against peers in your age bracket."
        : "Hoàn tất khảo sát hồ sơ để đối sánh tài sản, thu nhập và dự phóng hưu trí của bạn với nhóm đồng trang lứa chính xác nhất.",
    };
  }
  return {
    badge: isEn ? "DATA REQUIRED · ~5 MINS" : "CẦN DỮ LIỆU THỰC · ~5 PHÚT",
    title: isEn ? "Personalize Your Retirement Plan" : "Cá nhân hóa kế hoạch hưu trí",
    desc: isEn
      ? "You haven't completed your baseline financial survey yet. Spend ~5 minutes so An Huu can accurately calculate your net worth, pension, and AI recommendations."
      : "Kế hoạch hưu trí hiện đang hiển thị số liệu mẫu minh họa. Hãy làm khảo sát khoảng 5 phút để nhận bảng dòng tiền và chiến lược tích lũy thực tế.",
  };
}

export default function FinancialProfileGate({
  children,
  onboarding = false,
  inline = false,
}: {
  children: ReactNode;
  onboarding?: boolean;
  inline?: boolean;
}) {
  const location = useLocation();
  const { loading, loadError, hasProfile, reloadProfile } = useFinancialProfile();
  const { language } = useI18n();
  const isEn = language === "en";

  const [allDismissed, setAllDismissed] = useState(() => {
    return sessionStorage.getItem("anhuu_onboarding_all_dismissed") === "true";
  });

  const [dismissedForPath, setDismissedForPath] = useState<string | null>(null);

  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Pop up chỉ tạm đóng trên trang hiện tại khi người dùng bấm "Để sau" hoặc "X",
  // khi chuyển sang trang khác trong /user thì pop up sẽ tiếp tục nhắc nhở nếu chưa làm khảo sát.
  const isPageDismissed = allDismissed || (dismissedForPath === location.pathname);

  const handleDismissThisPage = () => {
    setDismissedForPath(location.pathname);
  };

  const handleDismissAll = () => {
    setAllDismissed(true);
    try {
      sessionStorage.setItem("anhuu_onboarding_all_dismissed", "true");
    } catch {}
  };

  // Pure inline guard without popups or reminder strips (e.g. AccountPage tab)
  if (inline) {
    if (loading) {
      return (
        <Card>
          <p role="status">{isEn ? "Loading your financial profile..." : "Đang tải hồ sơ của bạn..."}</p>
        </Card>
      );
    }
    if (loadError) {
      return (
        <Alert
          tone="danger"
          title={isEn ? "Failed to load financial profile" : "Chưa tải được hồ sơ"}
          action={<Button onClick={reloadProfile}>{isEn ? "Retry" : "Thử lại"}</Button>}
        >
          {loadError}
        </Alert>
      );
    }
    return <>{children}</>;
  }

  const routeContext = getRouteContext(location.pathname, isEn);
  const isUserRoute = location.pathname.startsWith("/user");
  const showOnboardingPrompt = !loading && !hasProfile && !onboarding && isUserRoute;

  return (
    <>
      {loadError && (
        <div style={{ marginBottom: "16px" }}>
          <Alert
            tone="danger"
            title={isEn ? "Failed to load financial profile" : "Chưa tải được hồ sơ"}
            action={<Button onClick={reloadProfile}>{isEn ? "Retry" : "Thử lại"}</Button>}
          >
            {loadError}
          </Alert>
        </div>
      )}

      {/* Pop up thông báo nhắc nhở làm khảo sát khi người dùng vào các trang mà chưa có hồ sơ */}
      {showOnboardingPrompt && !isPageDismissed && (
        <Modal
          open={!isPageDismissed}
          title={isEn ? "Complete Your Financial Profile" : "Khởi tạo hồ sơ tài chính"}
          onClose={handleDismissThisPage}
        >
          <div className="onboarding-popup-body">
            <div className="onboarding-popup-badge">
              <span className="gate-badge-dot" aria-hidden="true" />
              <span>{routeContext.badge}</span>
            </div>

            <h3 className="onboarding-popup-title">
              {routeContext.title}
            </h3>

            <p className="onboarding-popup-desc">
              {routeContext.desc}
            </p>

            <div className="onboarding-popup-highlights">
              <div className="popup-highlight-item">
                <Icon name="chart" size="small" />
                <span>{isEn ? "Net Worth & Cashflow Breakdown" : "Bức tranh tài sản ròng & Dòng tiền thực tế"}</span>
              </div>
              <div className="popup-highlight-item">
                <Icon name="target" size="small" />
                <span>{isEn ? "Accurate Pension & Savings Target" : "Dự phóng lương hưu BHXH & Mục tiêu tích lũy"}</span>
              </div>
              <div className="popup-highlight-item">
                <Icon name="sparkles" size="small" />
                <span>{isEn ? "AI-Powered Financial Advisory" : "Tư vấn kế hoạch hưu trí từ Trợ lý AI"}</span>
              </div>
            </div>

            <div className="onboarding-popup-actions">
              <Link
                to="/onboarding"
                state={{ from: location.pathname + location.search + location.hash }}
                className="button button-primary onboarding-popup-cta"
                onClick={handleDismissThisPage}
              >
                <span>{isEn ? "Start the survey" : "Bắt đầu khảo sát"}</span>
                <Icon name="arrow-right" size="small" />
              </Link>
              <Button variant="secondary" className="onboarding-popup-later" onClick={handleDismissThisPage}>
                {isEn ? "Later" : "Để sau"}
              </Button>
            </div>

            <div className="onboarding-popup-footer">
              <span>{isEn ? "You can keep exploring with sample figures." : "Bạn vẫn xem được trang với số liệu minh họa."}</span>
              <button
                type="button"
                className="popup-silence-btn"
                onClick={handleDismissAll}
                title={isEn ? "Don't show on other pages during this session" : "Không hiển thị lại trên các trang khác trong phiên này"}
              >
                {isEn ? "Don't remind me this session" : "Không nhắc lại trong phiên này"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Thanh nhắc nhở mỏng gọn khi đã đóng popup để người dùng làm khi sẵn sàng */}
      {showOnboardingPrompt && !bannerDismissed && (
        <div className="onboarding-reminder-strip" role="status">
          <div className="onboarding-reminder-left">
            <span className="reminder-pill">{isEn ? "SAMPLE DATA" : "DỮ LIỆU MINH HỌA"}</span>
            <span className="reminder-text">
              {isEn
                ? "You are viewing sample figures. Complete your 5-minute survey to calculate your real plan."
                : "Bạn đang xem số liệu minh họa. Hãy làm khảo sát hồ sơ (khoảng 5 phút) để hệ thống tính toán kế hoạch thực của bạn."}
            </span>
          </div>
          <div className="onboarding-reminder-right">
            <Link
              to="/onboarding"
              state={{ from: location.pathname + location.search + location.hash }}
              className="reminder-cta-link"
            >
              <span>{isEn ? "Complete Survey" : "Làm khảo sát ngay"}</span>
              <Icon name="arrow-right" size="small" />
            </Link>
            <button
              type="button"
              className="reminder-close-btn"
              onClick={() => setBannerDismissed(true)}
              aria-label={isEn ? "Close notice" : "Đóng thông báo"}
            >
              <Icon name="x" size="small" />
            </button>
          </div>
        </div>
      )}

      {/* Trang web vẫn luôn hiển thị đầy đủ bên dưới để người dùng tự do khám phá */}
      {children}
    </>
  );
}
