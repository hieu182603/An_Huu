import { useState } from "react";
import { Link } from "react-router";
import { Badge, BrandLogo, Drawer, Icon } from "../components/ui";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simAge, setSimAge] = useState<55 | 60 | 65>(60);

  const simulationData = {
    55: {
      fund: "10.200.000.000",
      monthly: "21.500.000",
      yearsLeft: 23,
      workReduction: "Sớm hơn 5 năm",
      tone: "warning" as const,
      pathD: "M 0 220 C 160 200, 300 135, 480 35 L 700 75 L 700 240 L 0 240 Z",
      lineD: "M 0 220 C 160 200, 300 135, 480 35 L 700 75",
      goalY: 35,
    },
    60: {
      fund: "8.500.000.000",
      monthly: "14.200.000",
      yearsLeft: 28,
      workReduction: "Tiêu chuẩn tối ưu",
      tone: "success" as const,
      pathD: "M 0 220 C 190 208, 390 155, 560 55 L 700 90 L 700 240 L 0 240 Z",
      lineD: "M 0 220 C 190 208, 390 155, 560 55 L 700 90",
      goalY: 55,
    },
    65: {
      fund: "6.950.000.000",
      monthly: "9.800.000",
      yearsLeft: 33,
      workReduction: "Tích lũy nhẹ nhàng",
      tone: "info" as const,
      pathD: "M 0 220 C 220 214, 450 170, 630 80 L 700 105 L 700 240 L 0 240 Z",
      lineD: "M 0 220 C 220 214, 450 170, 630 80 L 700 105",
      goalY: 80,
    },
  };

  const activeSim = simulationData[simAge];

  return (
    <div className="marketing-site">
      {/* Site Header */}
      <header className="site-header">
        <div className="site-container header-inner">
          <Link to="/" className="site-brand" aria-label="Trang chủ An Hưu">
            <BrandLogo />
          </Link>

          <nav aria-label="Điều hướng trang chủ">
            <a href="#gia-tri" onClick={() => setMobileMenuOpen(false)}>Giá trị cốt lõi</a>
            <a href="#quy-trinh" onClick={() => setMobileMenuOpen(false)}>Cách hoạt động</a>
            <a href="#mo-phong" onClick={() => setMobileMenuOpen(false)}>Mô phỏng</a>
            <a href="#tro-ly-ai" onClick={() => setMobileMenuOpen(false)}>Trợ lý AI</a>
            <a href="#kien-thuc" onClick={() => setMobileMenuOpen(false)}>Kiến thức</a>
            <a href="#tin-cay" onClick={() => setMobileMenuOpen(false)}>Bảo mật</a>
          </nav>

          <div className="header-actions">
            <Link to="/login" className="button button-ghost button-medium">Đăng nhập</Link>
            <Link to="/register" className="button button-primary button-medium">Bắt đầu miễn phí</Link>
          </div>

          <button
            type="button"
            className="mobile-menu-button icon-button"
            aria-label="Mở menu"
            aria-expanded={mobileMenuOpen}
            aria-haspopup="dialog"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Icon name={mobileMenuOpen ? "x" : "grid"} />
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <Drawer open={mobileMenuOpen} title="An Hưu" onClose={() => setMobileMenuOpen(false)}>
        <nav className="mobile-navigation" aria-label="Điều hướng trang chủ trên di động">
          <a href="#gia-tri" onClick={() => setMobileMenuOpen(false)}>Giá trị cốt lõi</a>
          <a href="#quy-trinh" onClick={() => setMobileMenuOpen(false)}>Cách hoạt động</a>
          <a href="#mo-phong" onClick={() => setMobileMenuOpen(false)}>Mô phỏng</a>
          <a href="#tro-ly-ai" onClick={() => setMobileMenuOpen(false)}>Trợ lý AI</a>
          <a href="#kien-thuc" onClick={() => setMobileMenuOpen(false)}>Kiến thức tài chính</a>
          <a href="#tin-cay" onClick={() => setMobileMenuOpen(false)}>Bảo mật & Độc lập</a>
          <Link to="/login">Đăng nhập</Link>
          <Link to="/register">Bắt đầu miễn phí</Link>
        </nav>
      </Drawer>

      {/* Section 1: Hero Section */}
      <section className="landing-hero" id="main-content">
        <div className="site-container landing-hero-grid">
          <div className="hero-copy">
            <Badge tone="soft">NỀN TẢNG HƯU TRÍ ĐỘC LẬP CHO NGƯỜI VIỆT</Badge>
            <h1>
              An tâm hôm nay, <span>an yên</span> ngày mai.
            </h1>
            <p>
              Tính chính xác số tiền cần chuẩn bị và lộ trình tích lũy từng tháng để thảnh thơi tận hưởng cuộc sống tự do tài chính.
            </p>

            <div className="hero-actions">
              <Link to="/register" className="button button-primary button-large">
                Bắt đầu lập kế hoạch <Icon name="arrow-right" />
              </Link>
              <a href="#mo-phong" className="button button-secondary button-large">
                Xem kịch bản mẫu
              </a>
            </div>

            <div className="hero-assurance">
              <span><Icon name="circle-check" size="small" /> Không yêu cầu thẻ ngân hàng</span>
              <span><Icon name="circle-check" size="small" /> Chuẩn mã hóa ngân hàng AES-256</span>
              <span><Icon name="circle-check" size="small" /> Hoàn thành trong 3 phút</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-media-wrap">
              <img
                src="/images/hero-lifestyle.jpg"
                alt="Cặp vợ chồng hiện đại Việt Nam thư thái bên tách cà phê buổi sáng và theo dõi kế hoạch tài chính"
                className="hero-media-img"
                loading="eager"
              />
              <div className="hero-media-overlay" />
            </div>

            <div className="visual-topline hero-floating-card">
              <div>
                <span>Mục tiêu tích lũy ước tính (Tuổi 60)</span>
                <strong>8.500.000.000 đ</strong>
              </div>
              <Badge tone="success">Đúng tiến độ chuẩn</Badge>
            </div>

            <div className="floating-insight">
              <span>
                <Icon name="sparkles" />
              </span>
              <div>
                <small>TRỢ LÝ AN HƯU AI</small>
                <strong>Tăng 1.5 triệu/tháng rút ngắn 2 năm đi làm</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Institutional Authority & Trust Strip */}
      <section className="trust-strip" aria-label="Cam kết chất lượng và định chế hỗ trợ">
        <div className="site-container">
          <span>Cam kết khoa học và độc lập cho người Việt:</span>
          <div>
            <Icon name="circle-check" />
            <span>Chuẩn hóa theo Luật BHXH 2024 mới nhất</span>
          </div>
          <div>
            <Icon name="circle-check" />
            <span>Mô phỏng lạm phát dài hạn theo Tổng cục Thống kê</span>
          </div>
          <div>
            <Icon name="circle-check" />
            <span>Mã hóa bảo vệ dữ liệu cấp ngân hàng AES-256</span>
          </div>
          <div>
            <Icon name="circle-check" />
            <span>Tích hợp kết nối quỹ mở VCBF, Dragon Capital, SSIAM</span>
          </div>
        </div>
      </section>

      {/* Section 3: Value Proposition (Asymmetric Bento Grid) */}
      <section className="marketing-section section-soft" id="gia-tri">
        <div className="site-container">
          <div className="marketing-section-title align-center">
            <span>GIÁ TRỊ CỐT LÕI</span>
            <h2>Tại sao nên chuẩn bị hưu trí cùng An Hưu?</h2>
            <p>
              Không phải bảng tính phức tạp, không phải quảng cáo bán sản phẩm. An Hưu mang đến phương pháp khoa học, trung lập giúp bạn làm chủ hoàn toàn tương lai.
            </p>
          </div>

          <div className="bento-values-grid">
            {/* Bento Card 1: Precise Gap Calculation (Large Anchor) */}
            <div className="card bento-card bento-card-large">
              <div className="bento-card-head">
                <div className="feature-icon tone-primary">
                  <Icon name="target" />
                </div>
                <Badge tone="soft">TÍNH TOÁN KHOA HỌC</Badge>
              </div>
              <h3>Biết chính xác số tiền cần có</h3>
              <p>
                Công thức độc quyền tích hợp tuổi thọ bình quân, mức sống mong muốn và tỷ lệ trượt giá tại Việt Nam. Không phỏng đoán, không mơ hồ.
              </p>
              <div className="bento-visual-bar-wrap">
                <div className="bento-bar-labels">
                  <span>BHXH dự kiến bù đắp (39%)</span>
                  <span>Khoảng hụt tự tích lũy (61%)</span>
                </div>
                <div className="bento-split-bar">
                  <div className="bar-segment is-bhxh" style={{ width: "39%" }} title="BHXH chi trả 39%" />
                  <div className="bar-segment is-gap" style={{ width: "61%" }} title="Cần tự tích lũy 61%" />
                </div>
              </div>
              <div className="bento-mini-calc">
                <div className="bento-calc-row">
                  <span>Chi tiêu tháng khi về hưu (giá trị hiện tại):</span>
                  <strong>25.000.000 đ</strong>
                </div>
                <div className="bento-calc-row">
                  <span>Lương hưu BHXH dự kiến bù đắp:</span>
                  <strong className="text-secondary">- 9.800.000 đ</strong>
                </div>
                <div className="bento-calc-divider" />
                <div className="bento-calc-row is-total">
                  <span>Dòng tiền cần tự tích lũy:</span>
                  <strong className="text-primary">15.200.000 đ/tháng</strong>
                </div>
              </div>
            </div>

            {/* Bento Card 2: 3 Financial Pillars */}
            <div className="card bento-card">
              <div className="bento-card-head">
                <div className="feature-icon tone-secondary">
                  <Icon name="wallet" />
                </div>
                <Badge tone="honey">3 TRỤ CỘT</Badge>
              </div>
              <h3>Lộ trình tích lũy 3 trụ cột</h3>
              <p>
                Phân bổ cân bằng giữa BHXH Nhà nước, Bảo hiểm y tế bảo vệ và Đầu tư sinh lời kỷ luật để bảo vệ sức mua bền bỉ.
              </p>
              <div className="bento-pillar-list">
                <div className="pillar-item">
                  <span className="pillar-dot is-navy" />
                  <span>Trụ cột 1: Bảo hiểm xã hội Nhà nước</span>
                </div>
                <div className="pillar-item">
                  <span className="pillar-dot is-teal" />
                  <span>Trụ cột 2: Quỹ dự phòng y tế cao cấp</span>
                </div>
                <div className="pillar-item">
                  <span className="pillar-dot is-gold" />
                  <span>Trụ cột 3: Quỹ tích lũy đầu tư dài hạn</span>
                </div>
              </div>
            </div>

            {/* Bento Card 3: Multi-scenario Simulation */}
            <div className="card bento-card">
              <div className="bento-card-head">
                <div className="feature-icon tone-accent">
                  <Icon name="chart" />
                </div>
                <Badge tone="info">LINH HOẠT</Badge>
              </div>
              <h3>Mô phỏng đa kịch bản cuộc đời</h3>
              <p>
                Nếu muốn nghỉ hưu sớm hơn 5 năm? Nếu sinh thêm con hoặc hỗ trợ cha mẹ già? Mọi quyết định quan trọng đều được tính toán tác động ngay lập tức.
              </p>
              <div className="bento-scenario-tags">
                <span>Nghỉ hưu sớm 5 năm</span>
                <span>Lạm phát tăng 1.5%</span>
                <span>Đổi nhà sau tuổi 45</span>
                <span>Tăng thu nhập thụ động</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: 4-Step Process (Compact Horizontal Grid) */}
      <section className="marketing-section" id="quy-trinh">
        <div className="site-container">
          <div className="process-header">
            <div className="marketing-section-title">
              <span>QUY TRÌNH TINH GỌN</span>
              <h2>Bản đồ hưu trí cá nhân chỉ trong 4 bước</h2>
              <p>Chỉ mất chưa đầy 3 phút để xây dựng lộ trình tích lũy minh bạch, bảo vệ sức mua trọn đời.</p>
            </div>
            <Link to="/register" className="button button-primary button-medium">
              Bắt đầu tạo hồ sơ <Icon name="arrow-right" />
            </Link>
          </div>

          <div className="process-steps-grid">
            <div className="process-step-card">
              <span className="step-num">01</span>
              <h3>Khai báo tài chính</h3>
              <p>Thu nhập, chi tiêu thiết yếu, tài sản tích lũy và số năm tham gia BHXH.</p>
            </div>
            <div className="process-step-card">
              <span className="step-num">02</span>
              <h3>Thiết lập mục tiêu</h3>
              <p>Chọn độ tuổi nghỉ ngơi mong muốn (55, 60, 65) và phong cách sống.</p>
            </div>
            <div className="process-step-card">
              <span className="step-num">03</span>
              <h3>Nhận lộ trình hành động</h3>
              <p>Tính chính xác khoảng thiếu hụt và số tiền cần tích lũy mỗi tháng.</p>
            </div>
            <div className="process-step-card">
              <span className="step-num">04</span>
              <h3>Đồng hành cùng AI</h3>
              <p>Cập nhật số dư định kỳ và nhận khuyến nghị tối ưu khi có biến động.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Human Benefit & Editorial Photography */}
      <section className="marketing-section section-soft">
        <div className="site-container human-benefit">
          <div className="human-photo">
            <img
              src="/images/peaceful-retirement.jpg"
              alt="Cặp vợ chồng người Việt lớn tuổi nắm tay nhau thảnh thơi dạo bước giữa đồi chè Đà Lạt trong ánh nắng sớm"
              loading="lazy"
            />
            <div className="photo-caption">
              <strong>Tự do tài chính ở tuổi xế chiều</strong>
              <span>Không phụ thuộc con cái, an tâm tận hưởng từng khoảnh khắc bình yên bên người bạn đời</span>
            </div>
          </div>

          <div className="benefit-copy">
            <div className="marketing-section-title">
              <h2>Hưu trí không phải là ngừng làm việc, mà là có quyền lựa chọn</h2>
              <p>
                Chuẩn bị từ sớm giúp bạn chủ động thời điểm nghỉ hưu, duy trì chất lượng chăm sóc sức khỏe tốt nhất và thảnh thơi theo đuổi những sở thích thời trẻ chưa kịp thực hiện.
              </p>
            </div>

            <div className="check-list">
              <div>
                <span><Icon name="check" /></span>
                <p>Độc lập hoàn toàn về tài chính, không tạo gánh nặng kinh tế cho con cái</p>
              </div>
              <div>
                <span><Icon name="check" /></span>
                <p>Bảo vệ toàn diện trước rủi ro y tế và chi phí chăm sóc sức khỏe tuổi già</p>
              </div>
              <div>
                <span><Icon name="check" /></span>
                <p>Chống lại sự xói mòn sức mua do lạm phát thông qua danh mục tích lũy khoa học</p>
              </div>
              <div>
                <span><Icon name="check" /></span>
                <p>Dễ dàng điều chỉnh kế hoạch khi thị trường tài chính hoặc gia đình có biến động</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Interactive Financial Visualization */}
      <section className="marketing-section visualization-section" id="mo-phong">
        <div className="site-container">
          <div className="marketing-section-title align-center">
            <span>CÔNG CỤ TRỰC QUAN</span>
            <h2>Mô phỏng tài sản hưu trí theo độ tuổi</h2>
            <p>
              Chọn mốc tuổi dự kiến nghỉ ngơi để quan sát sự thay đổi trong tổng quỹ tài sản cần thiết và mức tích lũy hàng tháng.
            </p>
          </div>

          <div className="visualization-board">
            <div className="board-summary">
              <Badge tone={activeSim.tone}>Kịch bản nghỉ hưu tuổi {simAge}</Badge>
              <span>Tổng quỹ tài sản cần tích lũy</span>
              <strong>{activeSim.fund} đ</strong>
              <p>
                Mức cần tích lũy: <b>{activeSim.monthly} đ/tháng</b>
              </p>

              <div className="sim-control-group">
                <span className="sim-control-label">Chọn tuổi nghỉ hưu thử nghiệm:</span>
                <div className="sim-age-buttons">
                  {([55, 60, 65] as const).map((age) => (
                    <button
                      key={age}
                      type="button"
                      className={`button button-small ${simAge === age ? "button-primary" : "button-secondary"}`}
                      onClick={() => setSimAge(age)}
                    >
                      {age} tuổi {age === 55 ? "(Sớm)" : age === 60 ? "(Chuẩn)" : "(Thư thả)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sim-summary-note">
                <Icon name="info" size="small" />
                <span>Thời gian tích lũy còn lại: <strong>{activeSim.yearsLeft} năm</strong> ({activeSim.workReduction}).</span>
              </div>
            </div>

            <div className="retirement-chart" tabIndex={0} role="region" aria-label="Biểu đồ quỹ hưu trí">
              <div className="chart-axis">
                <span>12 tỷ</span>
                <span>9 tỷ</span>
                <span>6 tỷ</span>
                <span>3 tỷ</span>
                <span>0 đ</span>
              </div>
              <svg viewBox="0 0 700 260" preserveAspectRatio="none">
                <line x1="0" y1="50" x2="700" y2="50" className="chart-grid" />
                <line x1="0" y1="100" x2="700" y2="100" className="chart-grid" />
                <line x1="0" y1="150" x2="700" y2="150" className="chart-grid" />
                <line x1="0" y1="200" x2="700" y2="200" className="chart-grid" />

                <path d={activeSim.pathD} className="projection-area" />
                <path d={activeSim.lineD} className="projection-line" />
                <line x1="0" y1={activeSim.goalY} x2="700" y2={activeSim.goalY} className="goal-line" />
              </svg>
              <div className="chart-labels">
                <span>32 tuổi (Hiện tại)</span>
                <span>45 tuổi (Tăng tốc)</span>
                <span>{simAge} tuổi (Về hưu)</span>
                <span>75 tuổi (An dưỡng)</span>
              </div>
            </div>

            <div className="timeline-row">
              <div className="is-done">
                <span><Icon name="check" /></span>
                <small>GIAI ĐOẠN 1 (30 - 40T)</small>
                <strong>Tạo lập nền tảng</strong>
              </div>
              <div className="is-done">
                <span><Icon name="check" /></span>
                <small>GIAI ĐOẠN 2 (40 - 50T)</small>
                <strong>Tăng tốc tích lũy</strong>
              </div>
              <div>
                <span><Icon name="target" /></span>
                <small>GIAI ĐOẠN 3 (50 - {simAge}T)</small>
                <strong>Bảo toàn vốn lớn</strong>
              </div>
              <div>
                <span><Icon name="sparkles" /></span>
                <small>GIAI ĐOẠN 4 (SAU {simAge}T)</small>
                <strong>An hưởng hưu trí</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: AI Advisor & Expert Consultation */}
      <section className="marketing-section section-soft" id="tro-ly-ai">
        <div className="site-container">
          <div className="ai-section">
            <div className="ai-copy">
              <Badge tone="soft">TRỢ LÝ TÀI CHÍNH THÔNG MINH</Badge>
              <h2>Trợ lý cá nhân hóa, thấu hiểu bạn trong từng giai đoạn</h2>
              <p>
                Không cần phải tự mình xử lý các phép tính phức tạp hay suy đoán thuật ngữ. Trợ lý An Hưu AI giải thích rõ ràng, cung cấp gợi ý tối ưu dựa trên số liệu thực tế của riêng bạn.
              </p>
              <ul>
                <li><Icon name="circle-check" /> Giải thích chi tiết lương hưu BHXH và cách tối ưu số năm đóng</li>
                <li><Icon name="circle-check" /> Gợi ý điều chỉnh chi tiêu định kỳ để rút ngắn thời gian làm việc</li>
                <li><Icon name="circle-check" /> Cảnh báo kịp thời khi tiến độ tiết kiệm bị ảnh hưởng bởi biến động</li>
              </ul>
              <Link to="/register" className="button button-primary button-large">
                Trò chuyện cùng Trợ lý AI <Icon name="arrow-right" />
              </Link>
            </div>

            <div className="ai-media-panel">
              <div className="ai-conversation-card">
                <div className="ai-card-expert-badge">
                  <img
                    src="/images/advisor-planning.jpg"
                    alt="Chuyên gia tài chính An Hưu"
                    className="ai-expert-thumb"
                  />
                  <div>
                    <strong>Cố vấn chuyên môn & Trí tuệ AI</strong>
                    <span>Kiểm định bởi chuyên gia tài chính chứng chỉ CFP</span>
                  </div>
                </div>

                <div className="ai-message">
                  <span className="ai-avatar"><Icon name="sparkles" /></span>
                  <div>
                    <small>TRỢ LÝ TÀI CHÍNH AN HƯU</small>
                    <p>Chào bạn, tôi đã phân tích kế hoạch hưu trí của bạn. Bạn muốn tôi làm rõ điều gì hôm nay?</p>
                  </div>
                </div>

                <div className="user-question">
                  Nếu tôi tăng mức tiết kiệm thêm 2 triệu mỗi tháng thì tuổi nghỉ hưu có sớm hơn được không?
                </div>

                <div className="ai-message">
                  <span className="ai-avatar"><Icon name="sparkles" /></span>
                  <div>
                    <small>TRỢ LÝ TÀI CHÍNH AN HƯU</small>
                    <p>
                      Nếu tăng 2.000.000 đ/tháng từ tháng tới (lãi suất kỳ vọng 7.5%/năm), bạn sẽ tích lũy thêm khoảng 1.18 tỷ đồng khi tới tuổi 60. Điều này cho phép bạn nghỉ hưu ở tuổi <strong>58 tuổi 4 tháng</strong> mà vẫn giữ nguyên mức sống!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: Real Customer Stories (Social Proof) */}
      <section className="marketing-section" aria-label="Chia sẻ từ người dùng">
        <div className="site-container">
          <div className="marketing-section-title align-center">
            <h2>Hàng ngàn người đã có câu trả lời cho tuổi hưu</h2>
            <p>
              Lắng nghe câu chuyện thực tế từ những người đã chủ động làm chủ tương lai tài chính của chính mình.
            </p>
          </div>

          <div className="testimonials-grid">
            <div className="card testimonial-card">
              <div className="testimonial-rating">
                <span className="star-icon">★★★★★</span>
                <Badge tone="success">ĐÃ XÁC THỰC</Badge>
              </div>
              <blockquote>
                "Trước đây tôi nghĩ chỉ cần đóng BHXH là đủ. Nhờ An Hưu, tôi mới thấy khoảng thiếu hụt chi phí sau tuổi 60 và kịp thời xây dựng quỹ đầu tư bổ sung."
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">MN</div>
                <div>
                  <strong>Chị Minh Nguyệt, 42 tuổi</strong>
                  <small>Giám đốc Nhân sự · TP. Hồ Chí Minh</small>
                </div>
              </div>
            </div>

            <div className="card testimonial-card">
              <div className="testimonial-rating">
                <span className="star-icon">★★★★★</span>
                <Badge tone="success">ĐÃ XÁC THỰC</Badge>
              </div>
              <blockquote>
                "Trợ lý AI giúp tôi tính được con số nghỉ hưu sớm ở tuổi 52. Giao diện trực quan, rõ ràng và quan trọng nhất là hoàn toàn không chào mời bảo hiểm phiền toái."
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">HD</div>
                <div>
                  <strong>Anh Hoàng Dũng, 36 tuổi</strong>
                  <small>Kỹ sư giải pháp đám mây · Hà Nội</small>
                </div>
              </div>
            </div>

            <div className="card testimonial-card">
              <div className="testimonial-rating">
                <span className="star-icon">★★★★★</span>
                <Badge tone="success">ĐÃ XÁC THỰC</Badge>
              </div>
              <blockquote>
                "Mô hình 3 trụ cột rất thiết thực với người Việt. Tôi đã lập kế hoạch phân bổ an toàn để không phải phụ thuộc kinh tế vào con cái sau này."
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">VT</div>
                <div>
                  <strong>Chú Văn Thành, 56 tuổi</strong>
                  <small>Giảng viên Đại học · Đà Nẵng</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 9: Knowledge & Curated Guides + Security Guarantee */}
      <section className="marketing-section section-soft" id="kien-thuc">
        <div className="site-container">
          <div className="knowledge-heading">
            <div className="marketing-section-title">
              <span>HÀNH TRANG THÔNG TIN</span>
              <h2>Kiến thức chuyên sâu & Độc lập bảo mật</h2>
              <p>Các bài viết kiểm chứng bởi chuyên gia tài chính và cam kết an toàn dữ liệu chuẩn ngân hàng.</p>
            </div>
            <Link to="/register" className="button button-secondary button-medium">
              Xem tất cả bài viết <Icon name="arrow-right" />
            </Link>
          </div>

          <div className="article-grid">
            <div className="card article-card">
              <div className="article-illustration">
                <span><Icon name="file-text" size="large" /></span>
              </div>
              <div className="article-content">
                <Badge tone="soft">BẢO HIỂM XÃ HỘI</Badge>
                <h3>Cách tính lương hưu BHXH mới nhất theo Luật 2024 và điểm hòa vốn</h3>
                <div>
                  <span>5 phút đọc · Cập nhật 2025</span>
                  <Icon name="arrow-right" />
                </div>
              </div>
            </div>

            <div className="card article-card">
              <div className="article-illustration article-2">
                <span><Icon name="chart" size="large" /></span>
              </div>
              <div className="article-content">
                <Badge tone="honey">CHIẾN LƯỢC ĐẦU TƯ</Badge>
                <h3>Quy tắc 4% và cách áp dụng phù hợp với tỷ lệ lạm phát Việt Nam</h3>
                <div>
                  <span>8 phút đọc · Chuyên sâu</span>
                  <Icon name="arrow-right" />
                </div>
              </div>
            </div>

            <div className="card article-card">
              <div className="article-illustration article-3">
                <span><Icon name="life-buoy" size="large" /></span>
              </div>
              <div className="article-content">
                <Badge tone="info">SỨC KHỎE & BẢO HIỂM</Badge>
                <h3>Xây dựng khiên chắn y tế sau tuổi 50: Những điều cần lưu ý</h3>
                <div>
                  <span>6 phút đọc · Cẩm nang</span>
                  <Icon name="arrow-right" />
                </div>
              </div>
            </div>
          </div>

          {/* Integrated Trust & Security Strip */}
          <div className="security-strip-card" id="tin-cay">
            <div className="security-item">
              <span className="security-icon"><Icon name="circle-check" /></span>
              <div>
                <strong>Mã hóa AES-256</strong>
                <p>Bảo mật dữ liệu tài chính cấp ngân hàng</p>
              </div>
            </div>
            <div className="security-item">
              <span className="security-icon"><Icon name="circle-check" /></span>
              <div>
                <strong>Hoàn toàn độc lập</strong>
                <p>Không thiên kiến bán hàng hay môi giới</p>
              </div>
            </div>
            <div className="security-item">
              <span className="security-icon"><Icon name="circle-check" /></span>
              <div>
                <strong>Chuẩn mực CFP</strong>
                <p>Phương pháp luận từ chuyên gia hoạch định</p>
              </div>
            </div>
            <div className="security-item">
              <span className="security-icon"><Icon name="circle-check" /></span>
              <div>
                <strong>Làm chủ dữ liệu</strong>
                <p>Xuất PDF hoặc xóa dữ liệu bất kỳ lúc nào</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 11: High-Converting Final CTA */}
      <section className="primary-cta-section">
        <div className="site-container">
          <div className="cta-content">
            <Badge tone="soft">KHỞI ĐẦU HÔM NAY</Badge>
            <h2>Sẵn sàng xây dựng kế hoạch tương lai an tâm cho chính bạn?</h2>
            <p>Hàng ngàn người đã có câu trả lời rõ ràng cho tuổi hưu của mình cùng An Hưu. Hãy bắt đầu ngay hôm nay.</p>
          </div>
          <div className="cta-actions">
            <Link to="/register" className="button button-large">
              Bắt đầu lập kế hoạch miễn phí <Icon name="arrow-right" />
            </Link>
            <div className="cta-micro-assurance">
              <span>Hoàn thành trong 3 phút</span> · <span>Không cần thẻ ngân hàng</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 12: Site Footer */}
      <footer className="site-footer">
        <div className="site-container">
          <div className="footer-main">
            <div className="footer-brand-col">
              <div className="site-brand is-light">
                <BrandLogo variant="vertical" inverted height={76} />
              </div>
              <p>
                An tâm, dễ hiểu, đáng tin cậy, có kế hoạch, có tương lai. Giải pháp hỗ trợ người Việt chuẩn bị tài chính cho tuổi già viên mãn.
              </p>
            </div>

            <div>
              <strong>Sản phẩm</strong>
              <a href="#mo-phong"><button type="button">Mô phỏng hưu trí</button></a>
              <a href="#tro-ly-ai"><button type="button">Trợ lý AI</button></a>
              <Link to="/register"><button type="button">Hồ sơ tài chính</button></Link>
              <Link to="/login"><button type="button">Đăng nhập</button></Link>
            </div>

            <div>
              <strong>Tài nguyên</strong>
              <a href="#kien-thuc"><button type="button">Kiến thức BHXH</button></a>
              <a href="#kien-thuc"><button type="button">Chiến lược tích lũy</button></a>
              <a href="#tin-cay"><button type="button">Bảo mật thông tin</button></a>
              <Link to="/admin"><button type="button">Khu vực quản trị</button></Link>
            </div>

            <div>
              <strong>Liên hệ & Hỗ trợ</strong>
              <button type="button">hotro@anhuu.vn</button>
              <button type="button">1900 6868 (8:00 - 18:00)</button>
              <button type="button">Hà Nội & TP. Hồ Chí Minh</button>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© 2025 An Hưu Platform. Bảo lưu mọi quyền.</span>
            <span>Các công cụ tính toán mang tính chất tham khảo và hỗ trợ lập kế hoạch cá nhân.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
