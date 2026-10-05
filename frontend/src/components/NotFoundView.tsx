import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon } from "./ui";
import notFoundArtwork from "../assets/404-artwork.png";
import { useI18n } from "../i18n";

/**
 * Trang 404 - "Trang bạn tìm kiếm không tồn tại" (An Hưu 2026 Official Edition)
 * Thiết kế tràn viền toàn màn hình (Edge-to-Edge Fullscreen Panoramic 3D Scene).
 * Tương thích chuẩn xác với mẫu thiết kế tham chiếu, hoàn toàn khớp kích thước viewport (100vw x 100dvh).
 */
export default function NotFoundView({ admin = false }: { admin?: boolean }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const isEn = language === "en";

  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);

  const home = admin ? "/admin/dashboard" : "/";
  const features = admin ? "/admin/financial-config" : "/cach-hoat-dong";
  const plan = admin ? "/admin/content" : "/onboarding";

  return (
    <div className={`ah-404-screen ${admin ? "is-admin-mode" : ""}`}>
      {/* Lớp nền phong cảnh toàn cảnh 3D tràn viền */}
      <div
        className="ah-404-panorama"
        style={{ backgroundImage: `url(${notFoundArtwork})` }}
        role="img"
        aria-label={
          isEn
            ? "3D 404 Scene: An Huu robot sitting by a milestone sign on a serene retirement journey"
            : "Khung cảnh 3D 404: Robot An Hưu ngồi bên cột mốc chỉ đường trên lộ trình nghỉ hưu thanh bình"
        }
      >
        {/* Điểm nóng tương tác trên 3 biển chỉ dẫn gỗ & Robot (Desktop Hotspots) */}
        <div className="ah-404-hotspots-layer" aria-hidden="true">
          {/* Biển 1: Về trang chủ */}
          <Link
            to={home}
            className={`ah-404-hotspot ah-hotspot-home ${hoveredHotspot === "home" ? "is-active" : ""}`}
            onMouseEnter={() => setHoveredHotspot("home")}
            onMouseLeave={() => setHoveredHotspot(null)}
            tabIndex={-1}
          >
            <span className="ah-hotspot-tooltip">
              <Icon name="home" size="small" /> {isEn ? (admin ? "Dashboard" : "Home") : "Đi tới Trang chủ"}
            </span>
          </Link>

          {/* Biển 2: Khám phá tính năng */}
          <Link
            to={features}
            className={`ah-404-hotspot ah-hotspot-features ${hoveredHotspot === "features" ? "is-active" : ""}`}
            onMouseEnter={() => setHoveredHotspot("features")}
            onMouseLeave={() => setHoveredHotspot(null)}
            tabIndex={-1}
          >
            <span className="ah-hotspot-tooltip">
              <Icon name="target" size="small" /> {isEn ? (admin ? "Financial Config" : "Explore Features") : "Khám phá tính năng"}
            </span>
          </Link>

          {/* Biển 3: Lập kế hoạch mới */}
          <Link
            to={plan}
            className={`ah-404-hotspot ah-hotspot-plan ${hoveredHotspot === "plan" ? "is-active" : ""}`}
            onMouseEnter={() => setHoveredHotspot("plan")}
            onMouseLeave={() => setHoveredHotspot(null)}
            tabIndex={-1}
          >
            <span className="ah-hotspot-tooltip">
              <Icon name="file-text" size="small" /> {isEn ? (admin ? "Content Management" : "Retirement Planning") : "Lập kế hoạch hưu trí"}
            </span>
          </Link>

          {/* Robot Mascot Interaction (Easter Egg) */}
          <div
            className={`ah-404-robot-zone ${hoveredHotspot === "robot" ? "is-active" : ""}`}
            onMouseEnter={() => setHoveredHotspot("robot")}
            onMouseLeave={() => setHoveredHotspot(null)}
          >
            <span className="ah-robot-bubble">
              {isEn ? "Hello! Let me guide you back to the right path ✨" : "Chào bạn! Để tôi dẫn bạn quay lại lộ trình nhé ✨"}
            </span>
          </div>
        </div>
      </div>

      {/* Nội dung thông điệp chính & Nút hành động */}
      <div className="ah-404-foreground">
        {/* Nhãn cảnh báo mềm mại */}
        <div className="ah-404-pill">
          <span className="ah-404-pill-dot" aria-hidden="true" />
          <span>{isEn ? "Error 404" : "Lỗi 404"}</span>
        </div>

        {/* Tiêu đề 2 dòng sắc nét */}
        <h1 id="ah-404-title" className="ah-404-headline">
          <span className="ah-404-headline-main">{isEn ? "The page you are looking for" : "Trang bạn tìm kiếm"}</span>
          <span className="ah-404-headline-accent">{isEn ? "does not exist" : "không tồn tại"}</span>
        </h1>

        {/* Mô tả giải pháp hướng dẫn người dùng */}
        <p className="ah-404-desc">
          {admin
            ? isEn
              ? "The administration URL might have changed or no longer exists. Return to the dashboard to continue managing An Huu."
              : "Đường dẫn quản trị có thể đã thay đổi hoặc không còn tồn tại. Hãy quay về bảng điều khiển để tiếp tục quản lý hệ thống An Hưu."
            : isEn
            ? "The link may have moved, been deleted, or does not exist. Return home to continue exploring helpful retirement planning tools."
            : "Đường dẫn có thể đã thay đổi, bị xóa hoặc không còn tồn tại. Hãy quay về trang chủ để tiếp tục khám phá những công cụ lập kế hoạch hữu ích cho bạn."}
        </p>

        {/* Cụm nút hành động chính */}
        <div className="ah-404-actions">
          <Link to={home} className="ah-404-btn ah-404-btn-primary">
            <span className="ah-404-btn-lead-icon">
              <Icon name="home" size="small" />
            </span>
            <span>{admin ? (isEn ? "Back to Dashboard" : "Về bảng điều khiển") : (isEn ? "Back to Home" : "Về trang chủ")}</span>
            <span className="ah-404-btn-trail-icon" aria-hidden="true">
              <Icon name="arrow-right" size="small" />
            </span>
          </Link>

          <button
            type="button"
            className="ah-404-btn ah-404-btn-ghost"
            onClick={() => navigate(-1)}
            aria-label={isEn ? "Go back to previous page" : "Quay lại trang trước đó"}
          >
            <span className="ah-404-btn-lead-icon" aria-hidden="true">
              <Icon name="arrow-left" size="small" />
            </span>
            <span>{isEn ? "Go Back" : "Quay lại trang trước"}</span>
          </button>
        </div>

        {/* Lối tắt phụ chỉ hiển thị trên di động khi tranh thu nhỏ */}
        <nav className="ah-404-mobile-chips" aria-label={isEn ? "Navigation shortcuts" : "Lối tắt điều hướng hữu ích"}>
          <span className="ah-404-mobile-chips-label">{isEn ? "Or continue with:" : "Hoặc tiếp tục với:"}</span>
          <div className="ah-404-mobile-chips-row">
            <Link to={features} className="ah-404-chip">
              <Icon name="target" size="small" />
              <span>{admin ? (isEn ? "Financial Config" : "Cấu hình tài chính") : (isEn ? "Explore Features" : "Khám phá tính năng")}</span>
            </Link>
            <Link to={plan} className="ah-404-chip">
              <Icon name="file-text" size="small" />
              <span>{admin ? (isEn ? "Content Management" : "Quản lý nội dung") : (isEn ? "New Plan" : "Lập kế hoạch mới")}</span>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
