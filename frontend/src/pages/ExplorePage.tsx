import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, Icon } from "../components/ui";

export default function ExplorePage() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = [
    { id: "all", label: "Tất cả chủ đề", icon: "compass" as const },
    { id: "bhxh", label: "Bảo hiểm Xã hội (BHXH)", icon: "file-text" as const },
    { id: "invest", label: "Chiến lược đầu tư & Quỹ", icon: "chart" as const },
    { id: "health", label: "Bảo hiểm y tế & Sức khỏe", icon: "life-buoy" as const },
    { id: "lifestyle", label: "Lối sống hưu trí viên mãn", icon: "sparkles" as const },
  ];

  return (
    <div className="phase-eight-page">
      {/* Header */}
      <div className="phase-page-header phase-eight-header">
        <div>
          <span className="section-eyebrow">HỆ SINH THÁI TRI THỨC & GIẢI PHÁP (U09)</span>
          <h1>Khám phá kiến thức & giải pháp hưu trí</h1>
          <p>
            Trang bị kiến thức tài chính chuẩn xác từ chuyên gia độc lập và tiếp cận các giải pháp tích lũy an toàn tại Việt Nam.
          </p>
        </div>

        <div className="phase-eight-switcher">
          <button type="button" className="is-active">Khám phá</button>
          <Link to="/user/account"><button type="button">Tài khoản</button></Link>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="explore-category-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={selectedCategory === c.id ? "is-active" : ""}
            onClick={() => setSelectedCategory(c.id)}
          >
            <Icon name={c.icon} size="small" />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Featured Editorial Article */}
      <Card className="featured-article">
        <div className="featured-photo">
          <img
            src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80"
            alt="Cặp vợ chồng đi dạo bên bờ biển hoàng hôn thanh bình"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = "/images/peaceful-retirement.jpg";
            }}
          />
          <span className="featured-photo-credit">Ảnh tư liệu độc quyền An Hưu</span>
        </div>

        <div className="featured-copy">
          <div className="article-meta">
            <Badge tone="soft">TIÊU ĐIỂM THÁNG 9</Badge>
            <span>8 phút đọc · Chuyên gia CFP kiểm định</span>
          </div>

          <h2>Quy tắc 4% và Chiến lược rút tiền an toàn cho người về hưu tại Việt Nam</h2>
          <p>
            Làm sao để rút tiền sinh hoạt hàng tháng mà không sợ cạn kiệt tài sản trước khi qua đời? Tìm hiểu công thức điều chỉnh quy tắc 4% phù hợp với tỷ lệ lạm phát 4% và lãi suất thực tế trong nước.
          </p>

          <div className="featured-details">
            <span><Icon name="circle-check" size="small" /> Công thức cân bằng giữa rút tiền và tái đầu tư sinh lời</span>
            <span><Icon name="circle-check" size="small" /> Phân bổ 3 rổ tiền: Ngắn hạn, Trung hạn và Bảo toàn</span>
          </div>

          <Button
            variant="primary"
            onClick={() => alert("Đang mở nội dung bài viết chi tiết...")}
          >
            Đọc toàn bộ bài viết <Icon name="arrow-right" />
          </Button>
        </div>
      </Card>

      {/* Knowledge Articles Grid */}
      <section className="explore-section">
        <header>
          <div>
            <Badge tone="soft">BÀI VIẾT CHUYÊN ĐỀ</Badge>
            <h2>Kiến thức hưu trí thiết yếu</h2>
            <p>Được biên soạn dễ hiểu, phi thuật ngữ cho người chuẩn bị nghỉ hưu.</p>
          </div>
          <Link to="/user/assistant" className="auth-text-action">Hỏi AI về các bài viết</Link>
        </header>

        <div className="article-grid">
          <Card className="article-card">
            <div className="article-visual">
              <span><Icon name="file-text" size="large" /></span>
            </div>
            <div className="article-card-copy">
              <Badge tone="soft">BHXH VIỆT NAM</Badge>
              <h3>Hướng dẫn tính mức hưởng lương hưu theo Luật BHXH mới</h3>
              <p>Chi tiết cách tính tỷ lệ lương hưu tối đa 75%, điều kiện số năm đóng tối thiểu và hệ số trượt giá hàng năm.</p>
              <Button variant="ghost" size="small" onClick={() => alert("Đang mở bài viết...")}>
                Đọc bài viết <Icon name="arrow-right" size="small" />
              </Button>
            </div>
          </Card>

          <Card className="article-card">
            <div className="article-visual" style={{ background: "rgba(var(--color-secondary-rgb), .12)" }}>
              <span style={{ color: "var(--color-white)", background: "var(--color-primary-700)" }}>
                <Icon name="chart" size="large" />
              </span>
            </div>
            <div className="article-card-copy">
              <Badge tone="honey">ĐẦU TƯ TÍCH LŨY</Badge>
              <h3>Đầu tư định kỳ DCA vào quỹ chỉ số: Chiến lược nhàn hạ hiệu quả</h3>
              <p>Tại sao phương pháp trích lập tự động mỗi tháng vào quỹ chỉ số giúp nhà đầu tư cá nhân vượt trội trong 20 năm dài hạn.</p>
              <Button variant="ghost" size="small" onClick={() => alert("Đang mở bài viết...")}>
                Đọc bài viết <Icon name="arrow-right" size="small" />
              </Button>
            </div>
          </Card>

          <Card className="article-card">
            <div className="article-visual" style={{ background: "rgba(var(--color-info-rgb), .12)" }}>
              <span style={{ color: "var(--color-white)", background: "var(--color-info)" }}>
                <Icon name="life-buoy" size="large" />
              </span>
            </div>
            <div className="article-card-copy">
              <Badge tone="info">SỨC KHỎE & BẢO HIỂM</Badge>
              <h3>Xây dựng lá chắn y tế tuổi già: Khi nào nên mua bảo hiểm sức khỏe?</h3>
              <p>Phân biệt bảo hiểm y tế nhà nước và các gói thẻ nội trú tư nhân để tối ưu chi phí mà vẫn được chăm sóc y tế chuẩn mực.</p>
              <Button variant="ghost" size="small" onClick={() => alert("Đang mở bài viết...")}>
                Đọc bài viết <Icon name="arrow-right" size="small" />
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Financial Solutions Section */}
      <section className="explore-section">
        <header>
          <div>
            <Badge tone="soft">GIẢI PHÁP ĐỐI TÁC CHỌN LỌC</Badge>
            <h2>Giải pháp tích lũy & bảo hiểm minh bạch</h2>
            <p>Các sản phẩm tài chính uy tín được sàng lọc độc lập theo tiêu chuẩn an toàn vốn dài hạn.</p>
          </div>
        </header>

        <div className="solutions-grid">
          {/* Solution 1 */}
          <Card className="solution-card">
            <header>
              <span className="solution-icon"><Icon name="chart" /></span>
              <div>
                <strong>Quỹ Đầu tư Cổ tức Bền vững</strong>
                <small>Đơn vị quản lý: Dragon Capital</small>
              </div>
              <Badge tone="success">Tích lũy</Badge>
            </header>

            <h3>Quỹ mở cổ tức & tăng trưởng DCBC</h3>
            <p>Danh mục tập trung vào các doanh nghiệp đầu ngành tại Việt Nam có dòng tiền ổn định và lịch sử chi trả cổ tức tiền mặt đều đặn.</p>

            <div className="solution-details">
              <span>
                <small>Lợi suất 5 năm qua:</small>
                <strong>11.2% / năm</strong>
              </span>
              <span>
                <small>Mức đầu tư tối thiểu:</small>
                <strong>100.000 đ / tháng</strong>
              </span>
              <span>
                <small>Mức độ rủi ro:</small>
                <strong>Trung bình</strong>
              </span>
              <span>
                <small>Phí quản lý:</small>
                <strong>1.5% / năm</strong>
              </span>
            </div>

            <Button variant="secondary" size="small" onClick={() => alert("Đang kết nối cổng thông tin đối tác...")}>
              Xem chi tiết giải pháp <Icon name="arrow-right" size="small" />
            </Button>

            <div className="solution-disclosure">
              <Icon name="info" size="small" />
              <span>An Hưu không nhận hoa hồng phân phối. Mọi đề xuất xuất phát từ tính tương thích với kế hoạch hưu trí của bạn.</span>
            </div>
          </Card>

          {/* Solution 2 */}
          <Card className="solution-card">
            <header>
              <span className="solution-icon"><Icon name="wallet" /></span>
              <div>
                <strong>Tiết kiệm Trực tuyến Định kỳ</strong>
                <small>Đơn vị: Ngân hàng TMCP Ngoại Thương (Vietcombank)</small>
              </div>
              <Badge tone="neutral">An toàn</Badge>
            </header>

            <h3>Tiền gửi Tích lũy Hưu trí Tương lai</h3>
            <p>Tự động trích tiền từ tài khoản lương hàng tháng sang tài khoản tiết kiệm có kỳ hạn, hưởng lãi suất bậc thang cao nhất.</p>

            <div className="solution-details">
              <span>
                <small>Lãi suất kỳ hạn 24T:</small>
                <strong>5.8% / năm</strong>
              </span>
              <span>
                <small>Kỳ trích nợ:</small>
                <strong>Ngày 05 hàng tháng</strong>
              </span>
              <span>
                <small>Mức độ rủi ro:</small>
                <strong>Rất thấp</strong>
              </span>
              <span>
                <small>Bảo hiểm tiền gửi:</small>
                <strong>Có bảo hiểm NHNN</strong>
              </span>
            </div>

            <Button variant="secondary" size="small" onClick={() => alert("Đang kết nối cổng thông tin đối tác...")}>
              Xem chi tiết giải pháp <Icon name="arrow-right" size="small" />
            </Button>

            <div className="solution-disclosure">
              <Icon name="info" size="small" />
              <span>Sản phẩm phù hợp làm Quỹ khẩn cấp và bảo toàn vốn giai đoạn 5 năm cận kề thời điểm nghỉ hưu.</span>
            </div>
          </Card>

          {/* Solution 3 */}
          <Card className="solution-card">
            <header>
              <span className="solution-icon"><Icon name="life-buoy" /></span>
              <div>
                <strong>Bảo hiểm Chăm sóc Sức khỏe Toàn cầu</strong>
                <small>Đơn vị: Bảo Việt Healthcare</small>
              </div>
              <Badge tone="info">Bảo vệ</Badge>
            </header>

            <h3>Thẻ Chăm sóc Sức khỏe Hưu trí An Gia</h3>
            <p>Bảo lãnh viện phí tại hơn 300 bệnh viện quốc tế hàng đầu tại Việt Nam, chi trả 100% viện phí phẫu thuật và điều trị nội trú.</p>

            <div className="solution-details">
              <span>
                <small>Hạn mức bảo hiểm:</small>
                <strong>1.000.000.000 đ/năm</strong>
              </span>
              <span>
                <small>Độ tuổi tái tục:</small>
                <strong>Đến 75 tuổi</strong>
              </span>
              <span>
                <small>Mức độ rủi ro:</small>
                <strong>Bảo vệ rủi ro</strong>
              </span>
              <span>
                <small>Bảo lãnh viện phí:</small>
                <strong>24/7 trực tiếp</strong>
              </span>
            </div>

            <Button variant="secondary" size="small" onClick={() => alert("Đang kết nối cổng thông tin đối tác...")}>
              Xem chi tiết giải pháp <Icon name="arrow-right" size="small" />
            </Button>

            <div className="solution-disclosure">
              <Icon name="info" size="small" />
              <span>Bảo vệ toàn vẹn quỹ tiết kiệm hưu trí không bị xói mòn khi gặp các sự cố y tế lớn sau tuổi 50.</span>
            </div>
          </Card>
        </div>
      </section>

      {/* Financial Glossary Strip */}
      <div className="glossary-strip">
        <span><Icon name="sparkles" size="large" /></span>
        <div>
          <small>TỪ ĐIỂN THUẬT NGỮ AN HƯU</small>
          <h2>Tra cứu nhanh hơn 150 thuật ngữ tài chính hưu trí</h2>
          <p>Hiểu cặn kẽ về Lãi suất kép, Tỷ lệ thay thế thu nhập, Quỹ mở, Trượt giá CPI, Bảng tử kỳ...</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate("/user/assistant")}
        >
          Mở từ điển tra cứu cùng AI <Icon name="arrow-right" />
        </Button>
      </div>
    </div>
  );
}
