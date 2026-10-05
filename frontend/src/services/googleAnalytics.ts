/**
 * Google Analytics 4 (GA4) Service for An Hưu Platform
 * 
 * Supports:
 * - Dynamic asynchronous loading of gtag.js
 * - SPA Route / Pageview tracking
 * - High-value financial conversion event tracking
 * - Safe SSR prerender compatibility (guards against non-browser environments)
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Lấy GA4 Measurement ID từ biến môi trường VITE_GA_MEASUREMENT_ID.
 * Ví dụ: G-XXXXXXXXXX
 */
export function getGaMeasurementId(): string {
  if (typeof import.meta === "undefined" || !import.meta.env) return "";
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
  return id.trim();
}

/**
 * Kiểm tra xem Google Analytics đã được cấu hình hợp lệ chưa.
 */
export function isGaConfigured(): boolean {
  const id = getGaMeasurementId();
  return Boolean(id && /^G-[A-Z0-9]+$/i.test(id) && !id.includes("XXXXXXXX"));
}

let isInitialized = false;

/**
 * Khởi tạo Google Analytics 4 với gtag.js
 */
export function initGoogleAnalytics(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  if (window.location.pathname === "/reset-password") return false;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return false;
  }

  const measurementId = getGaMeasurementId();
  if (!measurementId || !isGaConfigured()) {
    return false;
  }

  if (isInitialized) return true;

  try {
    // Khởi tạo dataLayer và hàm gtag
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      };
    }

    window.gtag("js", new Date());
    // Tắt automatic page_view vì ứng dụng SPA sẽ gửi thủ công theo route change của React Router
    window.gtag("config", measurementId, {
      send_page_view: false,
    });

    // Chèn script gtag.js nếu chưa có
    const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = scriptSrc;
      document.head.appendChild(script);
    }

    isInitialized = true;
    return true;
  } catch (err) {
    console.error("Lỗi khởi tạo Google Analytics:", err);
    return false;
  }
}

/**
 * Ghi nhận lượt xem trang (Pageview tracking) trong SPA React Router.
 */
export function trackPageView(path: string, title?: string): void {
  if (typeof window === "undefined" || !window.gtag) return;
  const measurementId = getGaMeasurementId();
  if (!measurementId || !isGaConfigured()) return;

  try {
    window.gtag("event", "page_view", {
      page_title: title || document.title,
      page_location: window.location.origin + window.location.pathname,
      page_path: path,
      send_to: measurementId,
    });
  } catch (err) {
    console.debug("Lỗi track pageview:", err);
  }
}

/**
 * Ghi nhận sự kiện tùy chỉnh (Custom Event Tracking).
 */
export function trackEvent(eventName: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || !window.gtag) return;
  if (!isGaConfigured()) return;

  try {
    window.gtag("event", eventName, params);
  } catch (err) {
    console.debug(`Lỗi track event [${eventName}]:`, err);
  }
}

// -------------------------------------------------------------
// CÁC SỰ KIỆN CHUYỂN ĐỔI QUAN TRỌNG TRONG HỆ THỐNG AN HƯU
// -------------------------------------------------------------

/**
 * Theo dõi hành vi đăng nhập (email hoặc google).
 */
export function trackLoginEvent(method: "email" | "google"): void {
  trackEvent("login", { method });
}

/**
 * Theo dõi hành vi đăng ký tài khoản mới.
 */
export function trackSignUpEvent(method: "email" | "google"): void {
  trackEvent("sign_up", { method });
}

/**
 * Theo dõi khi người dùng thực hiện tính toán kế hoạch hưu trí.
 */
export function trackCalculationEvent(details: {
  currentAge?: number;
  retireAge?: number;
  monthlyExpense?: number;
  readinessScore?: number;
}): void {
  trackEvent("calculate_retirement", {
    current_age: details.currentAge,
    retire_age: details.retireAge,
    monthly_expense: details.monthlyExpense,
    readiness_score: details.readinessScore,
  });
}

/**
 * Theo dõi khi người dùng gửi yêu cầu tư vấn chuyên gia hưu trí.
 */
export function trackConsultationEvent(topic?: string): void {
  trackEvent("generate_lead", {
    lead_type: "consultation",
    topic: topic || "Tư vấn tổng quan",
  });
}

/**
 * Theo dõi khi người dùng tải tài liệu / xuất báo cáo PDF/CSV.
 */
export function trackDownloadEvent(fileName: string, fileType: "pdf" | "csv" | "json"): void {
  trackEvent("file_download", {
    file_name: fileName,
    file_extension: fileType,
  });
}
