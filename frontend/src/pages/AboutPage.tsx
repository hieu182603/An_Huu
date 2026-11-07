import { Link } from 'react-router';
import MarketingLayout, { MarketingButton } from '../marketing/MarketingLayout';
import { Icon } from '../components/ui';
import heroLifestyle from '../assets/hero-lifestyle.webp';
import peacefulRetirement from '../assets/peaceful-retirement.webp';
import '../marketing/editorial-pages.css';

export default function AboutPage() {
  return (
    <MarketingLayout>
      <div className="ed-main">
        <section className="ed-hero">
          <div className="mk-container ed-hero-grid">
            <div className="ed-hero-copy">
              <nav className="mk-breadcrumb ed-breadcrumb" aria-label="Đường dẫn trang">
                <Link to="/">Trang chủ</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Giới thiệu</span>
              </nav>
              <h1>Biết rõ mình cần bao nhiêu, <em>để an tâm nghỉ hưu.</em></h1>
              <p className="ed-lead">An Hưu giúp gia đình Việt tính đúng số tiền cần tích lũy và mức góp mỗi tháng, bằng số liệu minh bạch.</p>
              <div className="ed-actions">
                <MarketingButton to="/mo-phong">
                  <span>Thử mô phỏng</span>
                </MarketingButton>
                <a href="#nguyen-tac" className="ed-link-btn">Xem nguyên tắc</a>
              </div>
            </div>
            <figure className="ed-hero-media">
              <img src={heroLifestyle} alt="Người lớn tuổi thong thả tận hưởng cuộc sống" width="720" height="820" fetchPriority="high" />
            </figure>
          </div>
        </section>

        <section className="ed-statement" aria-label="Lý do An Hưu ra đời">
          <div className="mk-container">
            <p className="ed-statement-text mk-reveal">Hưu trí không phải chuyện của tuổi 60. Đó là sự an tâm được tích lũy từ những quyết định có cơ sở <strong>ngay hôm nay</strong>.</p>
            <dl className="ed-facts mk-reveal">
              <div><dt>Mô phỏng</dt><dd>Từng tháng, đến hết tuổi hưu</dd></div>
              <div><dt>Căn cứ</dt><dd>Luật BHXH số 41/2024/QH15</dd></div>
              <div><dt>Dữ liệu</dt><dd>Chỉ nằm trong phiên làm việc</dd></div>
            </dl>
          </div>
        </section>

        <section className="ed-section" id="nguyen-tac">
          <div className="mk-container">
            <h2 className="ed-h2">Ba nguyên tắc chúng tôi giữ</h2>
            <div className="ed-principles">
              <article className="ed-principle ed-principle-lead mk-reveal">
                <span className="ed-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>
                </span>
                <h3>Nói thật về khoản thiếu</h3>
                <p>Không làm đẹp số liệu bằng giả định lợi suất cao. Nếu kế hoạch có nguy cơ thiếu vốn, bạn thấy rõ thời điểm và số tiền thiếu để điều chỉnh sớm.</p>
              </article>
              <article className="ed-principle mk-reveal">
                <span className="ed-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/></svg>
                </span>
                <h3>Bảo vệ trước, tăng trưởng sau</h3>
                <p>Quỹ dự phòng và tiền cho mục tiêu gần được tách riêng trước khi tính phần vốn đầu tư dài hạn.</p>
              </article>
              <article className="ed-principle mk-reveal">
                <span className="ed-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                </span>
                <h3>Dữ liệu là của bạn</h3>
                <p>Bản trải nghiệm không lưu dữ liệu tài chính lên máy chủ. Tải lại trang là dữ liệu được xóa.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ed-section ed-tint">
          <div className="mk-container ed-team">
            <figure className="ed-team-media mk-reveal">
              <img src={peacefulRetirement} alt="Gia đình nhiều thế hệ quây quần" loading="lazy" width="640" height="520" />
            </figure>
            <div className="ed-team-copy">
              <h2 className="ed-h2">Ba nhóm chuyên môn cùng làm một kế hoạch</h2>
              <ol className="ed-team-list">
                <li className="mk-reveal">
                  <h3>Hoạch định tài chính</h3>
                  <p>Mô hình dòng tiền hộ gia đình theo từng giai đoạn tuổi, có tính trượt giá.</p>
                </li>
                <li className="mk-reveal">
                  <h3>Pháp lý và an sinh</h3>
                  <p>Đối chiếu quy định BHXH hiện hành: tỷ lệ hưởng, bình quân tiền lương, tuổi nghỉ hưu.</p>
                </li>
                <li className="mk-reveal">
                  <h3>Định lượng và mô phỏng</h3>
                  <p>Kiểm thử kế hoạch qua các kịch bản thị trường bất lợi trước khi gợi ý phân bổ.</p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="ed-section">
          <div className="mk-container">
            <h2 className="ed-h2">Số liệu dựa vào đâu?</h2>
            <p className="ed-sub">Mỗi giả định đều ghi nguồn. Bạn có thể tự đổi các giả định này trong kế hoạch.</p>
            <div className="ed-sources">
              <article className="ed-source ed-source-wide mk-reveal">
                <span className="ed-source-value">3,5%<small>/năm</small></span>
                <h3>Lạm phát quy chiếu</h3>
                <p>Tham chiếu chuỗi CPI của Tổng cục Thống kê và Ngân hàng Nhà nước. Có thể chỉnh theo kỳ vọng riêng.</p>
              </article>
              <article className="ed-source mk-reveal">
                <span className="ed-source-value">45% đến 75%</span>
                <h3>Tỷ lệ hưởng lương hưu</h3>
                <p>Theo Luật BHXH số 41/2024/QH15 và lộ trình tuổi nghỉ hưu của Bộ luật Lao động 2019.</p>
              </article>
              <article className="ed-source mk-reveal">
                <span className="ed-source-value">TPCP và tiền gửi</span>
                <h3>Lợi suất tham chiếu</h3>
                <p>Lãi suất huy động kỳ hạn 12 đến 36 tháng và lợi suất trái phiếu Chính phủ niêm yết tại HNX.</p>
              </article>
              <article className="ed-source ed-source-dark mk-reveal">
                <span className="ed-source-value">Từng tháng</span>
                <h3>Lõi tính dòng tiền</h3>
                <p>Đầu kỳ cộng tiền góp và lợi tức, trừ tiền rút và chi phí. Khoản thiếu được hiển thị, không bị che đi.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ed-cta-band">
          <div className="mk-container ed-cta-inner">
            <h2>Xem kế hoạch của bạn trong 2 phút</h2>
            <div className="ed-actions">
              <MarketingButton to="/mo-phong">
                <span>Thử mô phỏng</span>
              </MarketingButton>
              <Link to="/kien-thuc" className="ed-link-btn ed-link-light">Đọc kiến thức</Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

