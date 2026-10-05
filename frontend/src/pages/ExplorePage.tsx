import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, Icon } from "../components/ui";
import KnowledgeLibrary, { KnowledgeGlossary } from "../components/KnowledgeLibraryApi";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { listPublicProducts, type ProductItem } from "../services/catalog";

export default function ExplorePage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const isEn = language === "en";

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [serviceNotice, setServiceNotice] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);

  useEffect(() => {
    let active = true;
    listPublicProducts(1, 50)
      .then(res => {
        if (active && res.items?.length > 0) {
          setCatalogProducts(res.items);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const visibleProducts = (() => {
    if (catalogProducts.length > 0) {
      return catalogProducts
        .filter(p => p.isVisible)
        .map(p => ({
          id: p.id,
          name: p.name,
          partnerName: p.partner?.name || (isEn ? "Partner Network" : "Mạng lưới đối tác"),
          category: p.category,
          riskTier: p.riskLevel === "LOW" ? (isEn ? "Low Risk" : "Rủi ro thấp") : p.riskLevel === "HIGH" ? (isEn ? "High Risk" : "Rủi ro cao") : (isEn ? "Medium Risk" : "Rủi ro trung bình"),
          annualFee: p.annualFee || (isEn ? "Standard schedule" : "Theo biểu phí niêm yết"),
          conditions: p.conditions || p.description || "",
          disclosure: p.disclosure || (isEn ? "Full commission transparency" : "Minh bạch hoa hồng 100%"),
          isVisible: p.isVisible,
          status: "Đang phân phối",
        }));
    }
    try {
      return (JSON.parse(localStorage.getItem("anhuu_demo_financial_products") || "[]") as Array<{ id: string; name: string; partnerName: string; category: string; riskTier: string; annualFee: string; conditions: string; disclosure: string; isVisible: boolean; status: string }>).filter((item) => item.isVisible && item.status === "Đang phân phối");
    } catch {
      return [];
    }
  })();

  const categories = [
    { id: "all", label: isEn ? "All Topics" : "Tất cả chủ đề", icon: "compass" as const },
    { id: "bhxh", label: isEn ? "Social Insurance (BHXH)" : "Bảo hiểm Xã hội (BHXH)", icon: "file-text" as const },
    { id: "invest", label: isEn ? "Investment & Funds" : "Chiến lược đầu tư & Quỹ", icon: "chart" as const },
    { id: "health", label: isEn ? "Health & Medical Insurance" : "Bảo hiểm y tế & Sức khỏe", icon: "life-buoy" as const },
    { id: "lifestyle", label: isEn ? "Retirement Lifestyle" : "Lối sống hưu trí viên mãn", icon: "sparkles" as const },
  ];

  return (
    <div className="phase-eight-page">
      {/* Header */}
      <div className="phase-page-header phase-eight-header">
        <div>
          <span className="section-eyebrow">{isEn ? "PARTNER ECOSYSTEM & SOLUTIONS" : "HỆ SINH THÁI ĐỐI TÁC & GIẢI PHÁP"}</span>
          <h1>{isEn ? "Retirement Partners & Solutions" : "Đối tác & Giải pháp hưu trí"}</h1>
          <p>
            {isEn
              ? "Explore financial products from our partner network (investment funds, health insurance, banks) and retirement accumulation handbooks."
              : "Khám phá các sản phẩm tài chính từ mạng lưới đối tác liên kết (quỹ đầu tư, bảo hiểm y tế, ngân hàng) và cẩm nang tích lũy hưu trí."}
          </p>
        </div>

        <div className="phase-eight-switcher">
          <button type="button" className="is-active">{isEn ? "Explore" : "Khám phá"}</button>
          <Link to="/user/account"><button type="button">{isEn ? "Account" : "Tài khoản"}</button></Link>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="explore-category-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={selectedCategory === c.id ? "is-active" : ""}
            aria-pressed={selectedCategory === c.id}
            onClick={() => setSelectedCategory(c.id)}
          >
            <Icon name={c.icon} size="small" />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {serviceNotice && (
        <div role="status">
          <Card className="explore-empty">
            <Icon name="info" />
            <p>{serviceNotice}</p>
            <Button variant="ghost" onClick={() => setServiceNotice("")}>
              {isEn ? "Close" : "Đóng"}
            </Button>
          </Card>
        </div>
      )}

      <KnowledgeLibrary key={user?.id || "guest"} userId={user?.id || "guest"} category={selectedCategory} resetCategory={() => setSelectedCategory("all")} />

      {/* Financial Solutions Section */}
      {(selectedCategory === "all" || selectedCategory === "invest" || selectedCategory === "health") && (
        <section className="explore-section">
          <header>
            <div>
              <Badge tone="soft">{isEn ? "CURATED PARTNER SOLUTIONS" : "GIẢI PHÁP ĐỐI TÁC CHỌN LỌC"}</Badge>
              <h2>{isEn ? "Transparent Accumulation & Insurance Solutions" : "Giải pháp tích lũy & bảo hiểm minh bạch"}</h2>
              <p>{isEn ? "Reputable financial products independently vetted to long-term capital preservation standards." : "Các sản phẩm tài chính uy tín được sàng lọc độc lập theo tiêu chuẩn an toàn vốn dài hạn."}</p>
            </div>
          </header>

          <div className="solutions-grid">
            {visibleProducts.filter((item) => selectedCategory === "all" || (selectedCategory === "health" ? item.category.includes("Bảo hiểm") : !item.category.includes("Bảo hiểm"))).map((item) => (
              <Card className="solution-card" key={item.id}>
                <header>
                  <span className="solution-icon"><Icon name="wallet" /></span>
                  <div><strong>{item.name}</strong><small>{item.partnerName}</small></div>
                  <Badge tone="soft">{item.riskTier}</Badge>
                </header>
                <h3>{item.category}</h3>
                <p>{item.conditions}</p>
                <div className="solution-details">
                  <span><small>{isEn ? "Management fee" : "Phí quản lý"}</small><strong>{item.annualFee}</strong></span>
                  <span><small>{isEn ? "Transparency" : "Minh bạch"}</small><strong>{item.disclosure}</strong></span>
                </div>
                <Button variant="secondary" size="small" onClick={() => setServiceNotice(isEn ? "Partner portal integration is being finalized. Please check back later." : "Cổng thông tin đối tác đang được hoàn thiện liên kết. Vui lòng quay lại sau.")}>
                  {isEn ? "View Solution Details" : "Xem chi tiết giải pháp"} <Icon name="arrow-right" size="small" />
                </Button>
              </Card>
            ))}

            {/* Solution 1 */}
            {(selectedCategory === "all" || selectedCategory === "invest") && (
              <Card className="solution-card">
                <header>
                  <span className="solution-icon"><Icon name="chart" /></span>
                  <div>
                    <strong>{isEn ? "Sustainable Dividend Investment Fund" : "Quỹ Đầu tư Cổ tức Bền vững"}</strong>
                    <small>{isEn ? "Manager: Dragon Capital" : "Đơn vị quản lý: Dragon Capital"}</small>
                  </div>
                  <Badge tone="success">{isEn ? "Accumulation" : "Tích lũy"}</Badge>
                </header>

                <h3>{isEn ? "DCBC Dividend & Growth Open-Ended Fund" : "Quỹ mở cổ tức & tăng trưởng DCBC"}</h3>
                <p>
                  {isEn
                    ? "Portfolio focused on industry-leading Vietnamese enterprises with stable cashflows and regular cash dividend payouts."
                    : "Danh mục tập trung vào các doanh nghiệp đầu ngành tại Việt Nam có dòng tiền ổn định và lịch sử chi trả cổ tức tiền mặt đều đặn."}
                </p>

                <div className="solution-details">
                  <span>
                    <small>{isEn ? "5-Year Return:" : "Lợi suất 5 năm qua:"}</small>
                    <strong>11.2% / {isEn ? "yr" : "năm"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Minimum Investment:" : "Mức đầu tư tối thiểu:"}</small>
                    <strong>100.000 ₫ / {isEn ? "mo" : "tháng"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Risk Level:" : "Mức độ rủi ro:"}</small>
                    <strong>{isEn ? "Moderate" : "Trung bình"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Management Fee:" : "Phí quản lý:"}</small>
                    <strong>1.5% / {isEn ? "yr" : "năm"}</strong>
                  </span>
                </div>

                <Button variant="secondary" size="small" onClick={() => setServiceNotice(isEn ? "Investment partner portal is being finalized. Please check back later." : "Cổng thông tin đối tác đầu tư đang được hoàn thiện liên kết. Vui lòng quay lại sau.")}>
                  {isEn ? "View Solution Details" : "Xem chi tiết giải pháp"} <Icon name="arrow-right" size="small" />
                </Button>

                <div className="solution-disclosure">
                  <Icon name="info" size="small" />
                  <span>{isEn ? "An Huu receives no distribution commissions. All suggestions stem from alignment with your retirement plan." : "An Hưu không nhận hoa hồng phân phối. Mọi đề xuất xuất phát từ tính tương thích với kế hoạch hưu trí của bạn."}</span>
                </div>
              </Card>
            )}

            {/* Solution 2 */}
            {(selectedCategory === "all" || selectedCategory === "invest") && (
              <Card className="solution-card">
                <header>
                  <span className="solution-icon"><Icon name="wallet" /></span>
                  <div>
                    <strong>{isEn ? "Periodic Online Savings" : "Tiết kiệm Trực tuyến Định kỳ"}</strong>
                    <small>{isEn ? "Institution: Vietcombank" : "Đơn vị: Ngân hàng TMCP Ngoại Thương (Vietcombank)"}</small>
                  </div>
                  <Badge tone="neutral">{isEn ? "Safe" : "An toàn"}</Badge>
                </header>

                <h3>{isEn ? "Future Retirement Accumulation Deposit" : "Tiền gửi Tích lũy Hưu trí Tương lai"}</h3>
                <p>
                  {isEn
                    ? "Automatically transfer monthly funds from salary to term savings, earning the highest tiered interest rate."
                    : "Tự động trích tiền từ tài khoản lương hàng tháng sang tài khoản tiết kiệm có kỳ hạn, hưởng lãi suất bậc thang cao nhất."}
                </p>

                <div className="solution-details">
                  <span>
                    <small>{isEn ? "24-Month Interest Rate:" : "Lãi suất kỳ hạn 24T:"}</small>
                    <strong>5.8% / {isEn ? "yr" : "năm"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Deduction Date:" : "Kỳ trích nợ:"}</small>
                    <strong>{isEn ? "5th of each month" : "Ngày 05 hàng tháng"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Risk Level:" : "Mức độ rủi ro:"}</small>
                    <strong>{isEn ? "Very Low" : "Rất thấp"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Deposit Insurance:" : "Bảo hiểm tiền gửi:"}</small>
                    <strong>{isEn ? "SBV Insured" : "Có bảo hiểm NHNN"}</strong>
                  </span>
                </div>

                <Button variant="secondary" size="small" onClick={() => setServiceNotice(isEn ? "Bank partner portal is being finalized. Please check back later." : "Cổng thông tin đối tác ngân hàng đang được hoàn thiện liên kết. Vui lòng quay lại sau.")}>
                  {isEn ? "View Solution Details" : "Xem chi tiết giải pháp"} <Icon name="arrow-right" size="small" />
                </Button>

                <div className="solution-disclosure">
                  <Icon name="info" size="small" />
                  <span>{isEn ? "Product ideal for emergency reserves and capital preservation in the 5 years leading up to retirement." : "Sản phẩm phù hợp làm Quỹ khẩn cấp và bảo toàn vốn giai đoạn 5 năm cận kề thời điểm nghỉ hưu."}</span>
                </div>
              </Card>
            )}

            {/* Solution 3 */}
            {(selectedCategory === "all" || selectedCategory === "health") && (
              <Card className="solution-card">
                <header>
                  <span className="solution-icon"><Icon name="life-buoy" /></span>
                  <div>
                    <strong>{isEn ? "Global Healthcare Insurance" : "Bảo hiểm Chăm sóc Sức khỏe Toàn cầu"}</strong>
                    <small>{isEn ? "Provider: Bao Viet Healthcare" : "Đơn vị: Bảo Việt Healthcare"}</small>
                  </div>
                  <Badge tone="info">{isEn ? "Protection" : "Bảo vệ"}</Badge>
                </header>

                <h3>{isEn ? "An Gia Retirement Healthcare Card" : "Thẻ Chăm sóc Sức khỏe Hưu trí An Gia"}</h3>
                <p>
                  {isEn
                    ? "Direct billing at over 300 leading hospitals in Vietnam, covering 100% of surgery and inpatient hospital fees."
                    : "Bảo lãnh viện phí tại hơn 300 bệnh viện quốc tế hàng đầu tại Việt Nam, chi trả 100% viện phí phẫu thuật và điều trị nội trú."}
                </p>

                <div className="solution-details">
                  <span>
                    <small>{isEn ? "Coverage Limit:" : "Hạn mức bảo hiểm:"}</small>
                    <strong>1.000.000.000 ₫/{isEn ? "yr" : "năm"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Renewal Age:" : "Độ tuổi tái tục:"}</small>
                    <strong>{isEn ? "Up to age 75" : "Đến 75 tuổi"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Risk Level:" : "Mức độ rủi ro:"}</small>
                    <strong>{isEn ? "Risk Protection" : "Bảo vệ rủi ro"}</strong>
                  </span>
                  <span>
                    <small>{isEn ? "Direct Billing:" : "Bảo lãnh viện phí:"}</small>
                    <strong>{isEn ? "24/7 Direct" : "24/7 trực tiếp"}</strong>
                  </span>
                </div>

                <Button variant="secondary" size="small" onClick={() => setServiceNotice(isEn ? "Insurance partner portal is being finalized. Please check back later." : "Cổng thông tin bảo hiểm đang được hoàn thiện liên kết. Vui lòng quay lại sau.")}>
                  {isEn ? "View Solution Details" : "Xem chi tiết giải pháp"} <Icon name="arrow-right" size="small" />
                </Button>

                <div className="solution-disclosure">
                  <Icon name="info" size="small" />
                  <span>{isEn ? "Protects retirement savings from erosion caused by major medical events after age 50." : "Bảo vệ toàn vẹn quỹ tiết kiệm hưu trí không bị xói mòn khi gặp các sự cố y tế lớn sau tuổi 50."}</span>
                </div>
              </Card>
            )}
          </div>
        </section>
      )}

      <KnowledgeGlossary />
    </div>
  );
}
