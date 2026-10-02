import { Link } from 'react-router';
import { Icon } from '../components/ui';
import heroLifestyle from '../assets/hero-lifestyle.webp';
import peacefulRetirement from '../assets/peaceful-retirement.webp';
import MarketingLayout, { FinalCTA, MarketingButton } from '../marketing/MarketingLayout';
import HeroScene from '../marketing/HeroScene';
import { features, steps } from '../marketing/content';
import { ArticleCards, AssistantPreview } from '../marketing/MarketingPages';
import { useMarketingMotion } from '../marketing/useMarketingMotion';

export default function LandingPage() {
  const scope = useMarketingMotion();
  return <MarketingLayout home><div ref={scope}>
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-column-backdrop" aria-hidden="true" /><HeroScene />
      <div className="mk-container mk-hero-content">
        <p className="mk-hero-kicker">KẾ HOẠCH HƯU TRÍ CHO NGƯỜI VIỆT</p>
        <h1 id="hero-title">An tâm hôm nay,<br /><span>an yên ngày mai.</span></h1>
        <p className="mk-hero-description">Một kế hoạch rõ ràng. Một tương lai chủ động.<br className="mk-desktop-break" /> Cùng bạn chuẩn bị tài chính cho cuộc sống sau nghỉ hưu.</p>
        <div className="mk-hero-actions"><MarketingButton>Bắt đầu lập kế hoạch</MarketingButton><Link className="mk-hero-secondary" to="/mo-phong">Khám phá mô phỏng<Icon name="arrow-right" /></Link></div>
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
      <div className="mk-section-heading mk-centered mk-reveal"><span className="mk-eyebrow">HIỂU RÕ HÔM NAY, CHỦ ĐỘNG NGÀY MAI</span><h2>Tương lai rõ ràng hơn.<br /><span>Từ những điều đơn giản.</span></h2><p>Mọi điều bạn cần để bắt đầu một kế hoạch hưu trí,<br className="mk-desktop-break" /> được kết nối trong một nơi dễ sử dụng.</p></div>
      <div className="mk-feature-grid">{features.map((feature, i) => <Link className={`mk-feature mk-reveal ${i === 0 ? 'mk-feature-primary' : ''}`} to={feature.path} key={feature.title}><span className="mk-feature-icon"><Icon name={feature.icon} /></span><h3>{feature.title}</h3><p>{feature.text}</p><span className="mk-feature-link">Khám phá<Icon name="arrow-right" /></span></Link>)}</div>
    </div></section>
    <section className="mk-section mk-journey" id="quy-trinh"><div className="mk-container mk-journey-grid">
      <div className="mk-journey-photo mk-reveal"><img src={peacefulRetirement} width="720" height="840" loading="lazy" alt="Cuộc sống nghỉ hưu bình yên giữa thiên nhiên" /><div><span>ĐÍCH ĐẾN LÀ CUỘC SỐNG BẠN YÊU</span><p>Thời gian cho mình.<br />Thời gian cho người thương.</p></div></div>
      <div className="mk-reveal"><div className="mk-section-heading"><span className="mk-eyebrow">MỘT HÀNH TRÌNH, BỐN BƯỚC NHỎ</span><h2>Từ hôm nay đến<br /><span>ngày an yên.</span></h2></div><ol className="mk-steps">{steps.map(step => <li key={step.title}><span className="mk-feature-icon"><Icon name={step.icon} /></span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol><Link className="mk-text-link" to="/cach-hoat-dong">Tìm hiểu cách hoạt động<Icon name="arrow-right" /></Link></div>
    </div></section>
    <section className="mk-section mk-assistant-section" id="tro-ly-ai"><div className="mk-container mk-assistant-grid"><div className="mk-section-heading mk-reveal"><span className="mk-eyebrow">TRỢ LÝ AN HƯU</span><h2>Câu hỏi của bạn.<br /><span>Một khởi đầu rõ hơn.</span></h2><p>Từ những khái niệm mới đến các kịch bản cuộc sống. Bắt đầu bằng một câu hỏi đơn giản.</p><MarketingButton to="/tro-ly-ai">Tìm hiểu trợ lý AI</MarketingButton><small>Các hội thoại trên trang là nội dung minh họa.</small></div><div className="mk-reveal"><AssistantPreview /></div></div></section>
    <section className="mk-section" id="kien-thuc"><div className="mk-container"><div className="mk-heading-row mk-reveal"><div className="mk-section-heading"><span className="mk-eyebrow">HIỂU ĐỂ CHỦ ĐỘNG</span><h2>Thêm hiểu biết.<br /><span>Bớt lo tương lai.</span></h2></div><Link to="/kien-thuc" className="mk-text-link">Khám phá kiến thức<Icon name="arrow-right" /></Link></div><ArticleCards /></div></section>
    <FinalCTA />
  </div></MarketingLayout>;
}
