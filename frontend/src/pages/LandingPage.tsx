import { Link } from 'react-router';
import { Icon } from '../components/ui';
import heroLifestyle from '../assets/hero-lifestyle.webp';
import peacefulRetirement from '../assets/peaceful-retirement.webp';
import productInsurance from '../assets/product-insurance.jpg';
import knowledgeTracking from '../assets/knowledge-tracking.jpg';
import MarketingLayout, { FinalCTA, MarketingButton } from '../marketing/MarketingLayout';
import HeroScene from '../marketing/HeroScene';
import { features, steps } from '../marketing/content';
import { AssistantPreview } from '../marketing/MarketingPages';
import { useMarketingMotion } from '../marketing/useMarketingMotion';

export default function LandingPage() {
  const scope = useMarketingMotion();
  return <MarketingLayout home><div ref={scope}>
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-column-backdrop" aria-hidden="true" /><HeroScene />
      <div className="mk-container mk-hero-content">
        <p className="mk-hero-kicker">KẾ HOẠCH HƯU TRÍ CHO NGƯỜI VIỆT</p>
        <h1 id="hero-title">An tâm hôm nay,<br /><span>an yên ngày mai.</span></h1>
        <p className="mk-hero-description">Bạn muốn sống thế nào khi nghỉ hưu?<br className="mk-desktop-break" /> Hiểu số tiền cần có, khoản còn thiếu và bước có thể làm từ hôm nay.</p>
        <div className="mk-hero-actions"><MarketingButton to="/mo-phong">Xem kế hoạch mẫu</MarketingButton><Link className="mk-hero-secondary" to="/mo-phong#phan-bo">Khám phá phân bổ tài sản<Icon name="arrow-right" /></Link></div>
        <div className="mk-hero-cards">
          <div className="mk-hero-side mk-hero-left">
            <div className="mk-hero-card mk-saving-card"><span className="mk-card-icon"><Icon name="wallet" /></span><p>Từng chút hôm nay</p><strong>Cho những điều<br />bạn mong đợi.</strong><div className="mk-saving-bars" aria-hidden="true">{[22, 31, 28, 42, 52, 65, 78, 95].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div><Link to="/mo-phong">Khám phá cách tích lũy<Icon name="arrow-right" /></Link></div>
            <div className="mk-mini-note"><Icon name="circle-check" /><span>Bắt đầu từ mục tiêu của bạn</span></div>
          </div>
          <div className="mk-hero-card mk-plan-card"><div className="mk-plan-heading"><span><Icon name="compass" /> Hành trình của bạn</span><span>An Hưu</span></div><h2>Tuổi hưu, theo cách bạn muốn.</h2><p>Để dành thời gian cho những điều ý nghĩa.</p><div className="mk-plan-photo"><img src={heroLifestyle} width="720" height="480" alt="Cặp đôi tận hưởng thời gian bên nhau trong không gian xanh" fetchPriority="high" /></div><div className="mk-plan-bottom"><span><small>TỪ HÔM NAY</small><strong>Một kế hoạch rõ ràng</strong></span><Link to="/cach-hoat-dong" className="mk-circle-link" aria-label="Tìm hiểu kế hoạch hưu trí"><Icon name="arrow-right" /></Link></div></div>
          <div className="mk-hero-side mk-hero-right"><div className="mk-hero-card mk-ai-card"><span className="mk-card-icon"><Icon name="sparkles" /></span><p>Có An Hưu đồng hành</p><h2>Bớt băn khoăn.<br />Thêm chủ động.</h2><div className="mk-ai-bubble">“Nếu tôi muốn nghỉ hưu sớm hơn thì sao?”</div><Link to="/tro-ly-ai">Khám phá trợ lý AI<Icon name="arrow-right" /></Link></div><div className="mk-mini-note mk-note-right"><Icon name="target" /><span>Mỗi người, một lộ trình</span></div></div>
        </div>
        <div className="mk-hero-footnote"><span><Icon name="check" /> Không cần thẻ ngân hàng</span><span><Icon name="check" /> Thử mô phỏng miễn phí</span><span><Icon name="check" /> Giả định minh bạch</span></div>
      </div>
    </section>
    <section className="mk-section mk-features" id="gia-tri"><div className="mk-container">
      <div className="mk-section-heading mk-centered mk-reveal"><span className="mk-eyebrow">HIỂU RÕ HÔM NAY, CHỦ ĐỘNG NGÀY MAI</span><h2>Tương lai rõ ràng hơn.<br /><span>Từ những điều đơn giản.</span></h2><p>Cần bao nhiêu để nghỉ hưu? Hiện tại đã đủ đến đâu?<br className="mk-desktop-break" /> Thử một thay đổi để tìm bước tiếp theo vừa sức.</p></div>
      <div className="mk-feature-grid">{features.map((feature, i) => <Link className={`mk-feature mk-reveal ${i === 0 ? 'mk-feature-primary' : ''}`} to={feature.path} key={feature.title}><span className="mk-feature-icon"><Icon name={feature.icon} /></span><h3>{feature.title}</h3><p>{feature.text}</p><span className="mk-feature-link">Khám phá<Icon name="arrow-right" /></span></Link>)}</div>
    </div></section>
    <section className="mk-section mk-journey" id="quy-trinh"><div className="mk-container mk-journey-grid">
      <div className="mk-journey-photo mk-reveal"><img src={peacefulRetirement} width="720" height="840" loading="lazy" alt="Cuộc sống nghỉ hưu bình yên giữa thiên nhiên" /><div><span>ĐÍCH ĐẾN LÀ CUỘC SỐNG BẠN YÊU</span><p>Thời gian cho mình.<br />Thời gian cho người thương.</p></div></div>
      <div className="mk-reveal"><div className="mk-section-heading"><span className="mk-eyebrow">MỘT HÀNH TRÌNH, BỐN BƯỚC NHỎ</span><h2>Từ hôm nay đến<br /><span>ngày an yên.</span></h2></div><ol className="mk-steps">{steps.map(step => <li key={step.title}><span className="mk-feature-icon"><Icon name={step.icon} /></span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol><Link className="mk-text-link" to="/cach-hoat-dong">Tìm hiểu cách hoạt động<Icon name="arrow-right" /></Link></div>
    </div></section>
    <section className="mk-section mk-assistant-section" id="tro-ly-ai"><div className="mk-container mk-assistant-grid"><div className="mk-section-heading mk-reveal"><span className="mk-eyebrow">TRỢ LÝ AN HƯU</span><h2>Câu hỏi của bạn.<br /><span>Một khởi đầu rõ hơn.</span></h2><p>Từ những khái niệm mới đến các kịch bản cuộc sống. Bắt đầu bằng một câu hỏi đơn giản.</p><MarketingButton to="/tro-ly-ai">Tìm hiểu trợ lý AI</MarketingButton><small>Các hội thoại trên trang là nội dung minh họa.</small></div><div className="mk-reveal"><AssistantPreview /></div></div></section>

    {/* Section 5: Knowledge Base Highlights */}
    <section className="mk-section" id="kien-thuc">
      <div className="mk-container">
        <div className="mk-section-heading mk-centered mk-reveal">
          <span className="mk-eyebrow">CẨM NANG KIẾN THỨC HƯU TRÍ</span>
          <h2>Hiểu rõ số liệu.<br /><span>Tự tin bước vào tuổi già.</span></h2>
          <p>Trang bị kiến thức tài chính hưu trí thực tế, hiểu cách tính lương hưu BHXH và nguyên lý tích lũy bền vững.</p>
        </div>

        <div className="mk-landing-knowledge-grid">
          {/* Article 1 Card */}
          <article className="mk-landing-article-card mk-reveal">
            <div className="mk-card-img-wrap">
              <img src={peacefulRetirement} alt="Cần bao nhiêu tiền để nghỉ hưu an tâm?" loading="lazy" width="600" height="300" />
              <span className="mk-card-category-badge">Mục tiêu tài chính</span>
            </div>
            <div className="mk-card-content">
              <h3>Cần bao nhiêu tiền để nghỉ hưu an tâm tại Việt Nam?</h3>
              <p>Cách tính toán số vốn hưu trí thực tế dựa trên mức chi tiêu mong muốn, bù đắp lạm phát 3,5%/năm và phương pháp 4% thích ứng với kinh tế Việt Nam.</p>
              <Link to="/kien-thuc#can-bao-nhieu-tien-de-nghi-huu" className="mk-card-action">
                <span>Đọc bài phân tích chi tiết</span>
                <Icon name="arrow-right" />
              </Link>
            </div>
          </article>

          {/* Article 2 Card */}
          <article className="mk-landing-article-card mk-reveal">
            <div className="mk-card-img-wrap">
              <img src={productInsurance} alt="Lương hưu BHXH tính thế nào theo luật mới?" loading="lazy" width="600" height="300" />
              <span className="mk-card-category-badge">Bảo hiểm xã hội</span>
            </div>
            <div className="mk-card-content">
              <h3>Lương hưu BHXH tính thế nào theo quy định mới nhất?</h3>
              <p>Công thức tính tỷ lệ hưởng nam 20 năm (45%), nữ 20 năm (55%), mức bình quân tiền lương đóng và giải pháp bù đắp khoảng trống thu nhập chờ hưu.</p>
              <Link to="/kien-thuc#luong-huu-bhxh-tinh-the-nao" className="mk-card-action">
                <span>Đọc bài phân tích chi tiết</span>
                <Icon name="arrow-right" />
              </Link>
            </div>
          </article>

          {/* Article 3 Card */}
          <article className="mk-landing-article-card mk-reveal">
            <div className="mk-card-img-wrap">
              <img src={knowledgeTracking} alt="Tách vốn bảo vệ trước khi đầu tư tăng trưởng" loading="lazy" width="600" height="300" />
              <span className="mk-card-category-badge">Phân bổ tài sản</span>
            </div>
            <div className="mk-card-content">
              <h3>Tách vốn bảo vệ trước khi đầu tư tăng trưởng</h3>
              <p>Giữ quỹ dự phòng khẩn cấp và tiền cho mục tiêu gần ngoài danh mục đầu tư dài hạn, tránh rủi ro phải bán tài sản khi thị trường điều chỉnh.</p>
              <Link to="/kien-thuc#thap-tai-san-bao-ve" className="mk-card-action">
                <span>Đọc bài phân tích chi tiết</span>
                <Icon name="arrow-right" />
              </Link>
            </div>
          </article>
        </div>

        <div style={{ textAlign: 'center', marginTop: '28px' }}>
          <Link to="/kien-thuc" className="mk-button mk-secondary-btn">
            <span>Xem toàn bộ thư viện bài viết kiến thức</span>
            <Icon name="arrow-right" />
          </Link>
        </div>
      </div>
    </section>

    {/* Section 6: About & Data Transparency */}
    <section className="mk-section mk-alt-bg" id="gioi-thieu">
      <div className="mk-container">
        <div className="mk-section-heading mk-centered mk-reveal">
          <span className="mk-eyebrow">VỀ NỀN TẢNG AN HƯU</span>
          <h2>Độc lập, minh bạch<br /><span>và bảo mật tối đa.</span></h2>
          <p>Được xây dựng bởi đội ngũ chuyên gia tài chính và kỹ sư định lượng, cam kết vì tương lai an tâm của người Việt.</p>
        </div>

        <div className="mk-landing-about-grid">
          {/* Card 1: Chuyên gia & Cố vấn */}
          <div className="mk-about-card mk-reveal">
            <div className="mk-about-card-top">
              <div className="mk-about-card-icon" aria-hidden="true">
                <Icon name="users" />
              </div>
              <span className="mk-about-badge-pill">Đội ngũ chuyên gia</span>
            </div>

            <div className="mk-about-card-body">
              <h3>Đội ngũ chuyên môn & Cố vấn</h3>
              <p className="mk-about-card-desc">Sự kết hợp giữa chuyên gia quản lý tài sản hưu trí, cố vấn chính sách an sinh xã hội và kỹ sư công nghệ định lượng độc lập.</p>

              <div className="mk-about-items">
                <div className="mk-about-item">
                  <span className="mk-about-tag mk-tag-navy">Hoạch định</span>
                  <div className="mk-about-item-content">
                    <strong>Ban Hoạch định Hưu trí</strong>
                    <p>Phân tích cấu trúc chi tiêu và dòng tiền gia đình theo từng giai đoạn.</p>
                  </div>
                </div>

                <div className="mk-about-item">
                  <span className="mk-about-tag mk-tag-navy">Pháp lý & BHXH</span>
                  <div className="mk-about-item-content">
                    <strong>Ban Nghiên cứu BHXH</strong>
                    <p>Đối chiếu chuẩn xác theo Luật Bảo hiểm xã hội số 41/2024/QH15.</p>
                  </div>
                </div>

                <div className="mk-about-item">
                  <span className="mk-about-tag mk-tag-navy">Định lượng</span>
                  <div className="mk-about-item-content">
                    <strong>Ban Mô phỏng Định lượng</strong>
                    <p>Thuật toán dòng tiền từng tháng không tạo ảo giác tài sản.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mk-about-card-foot">
              <Link to="/gioi-thieu" className="mk-card-action">
                <span>Tìm hiểu thêm về đội ngũ</span>
                <Icon name="arrow-right" />
              </Link>
            </div>
          </div>

          {/* Card 2: Nguồn dữ liệu & Cơ sở tính toán */}
          <div className="mk-about-card mk-reveal">
            <div className="mk-about-card-top">
              <div className="mk-about-card-icon" aria-hidden="true">
                <Icon name="chart" />
              </div>
              <span className="mk-about-badge-pill">Minh bạch dữ liệu</span>
            </div>

            <div className="mk-about-card-body">
              <h3>Nguồn dữ liệu & Cơ sở tính toán</h3>
              <p className="mk-about-card-desc">Mọi con số dự phóng trên An Hưu đều dựa trên chuỗi số liệu thống kê lịch sử và quy chuẩn pháp luật Việt Nam.</p>

              <div className="mk-about-items">
                <div className="mk-about-item">
                  <span className="mk-about-tag mk-tag-jade">GSO & SBV</span>
                  <div className="mk-about-item-content">
                    <strong>Lạm phát chuẩn hóa 3,5%/năm</strong>
                    <p>Chuỗi số liệu lịch sử Tổng cục Thống kê & Ngân hàng Nhà nước.</p>
                  </div>
                </div>

                <div className="mk-about-item">
                  <span className="mk-about-tag mk-tag-jade">Công báo</span>
                  <div className="mk-about-item-content">
                    <strong>Căn cứ pháp lý BHXH</strong>
                    <p>Văn bản quy phạm pháp luật công báo chính thức (Luật 41/2024).</p>
                  </div>
                </div>

                <div className="mk-about-item">
                  <span className="mk-about-tag mk-tag-jade">HNX & Big 4</span>
                  <div className="mk-about-item-content">
                    <strong>Thị trường tài chính</strong>
                    <p>Lợi suất TPCP 10–15 năm và lãi suất tiền gửi trung dài hạn quốc doanh.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mk-about-card-foot">
              <Link to="/gioi-thieu" className="mk-card-action">
                <span>Xem minh bạch nguồn dữ liệu</span>
                <Icon name="arrow-right" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>

    <FinalCTA />
  </div></MarketingLayout>;
}
