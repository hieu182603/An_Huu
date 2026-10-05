export { ArticleCards, KnowledgePage, ArticlePage } from "./PublicContent";
import { useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/ui';
import MarketingLayout, { FinalCTA, MarketingButton, PageIntro } from './MarketingLayout';
import {
  assistantCapabilities,
  assistantComparison,
  assistantExamples,
  assistantFaqs,
  steps,
} from './content';
import { calculateRetirement, projectBalanceAtAge, type RetirementCalculationInput } from '../domain/retirementCalculator';

const currency = (amount: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount)} đ`;

export function AssistantPreview({ expanded = false }: { expanded?: boolean }) {
  const [selected, setSelected] = useState(0);
  const current = assistantExamples[selected];

  return (
    <div className={`mk-chat ${expanded ? 'mk-chat-expanded' : ''}`}>
      <div className="mk-chat-header">
        <div className="mk-chat-status">
          <span className="mk-chat-pulse" aria-hidden="true" />
          <div>
            <strong>Trợ lý Phân tích Hưu trí</strong>
            <small>Mô phỏng toán học · Độc lập 100%</small>
          </div>
        </div>
        <span className="mk-chat-tag">{current.category}</span>
      </div>

      <div className="mk-chat-tabs" role="tablist" aria-label="Chủ đề tư vấn">
        {assistantExamples.map((item, i) => (
          <button
            key={item.tabLabel || item.question}
            type="button"
            role="tab"
            aria-selected={selected === i}
            className={`mk-chat-tab ${selected === i ? 'is-active' : ''}`}
            onClick={() => setSelected(i)}
          >
            {item.tabLabel || item.category}
          </button>
        ))}
      </div>

      <div className="mk-chat-conversation" aria-live="polite" aria-atomic="true">
        <div className="mk-chat-bubble-user">
          <span className="mk-bubble-label">Băn khoăn thực tế:</span>
          <p className="mk-chat-question">{current.question}</p>
        </div>

        <div className="mk-chat-bubble-assistant">
          {current.takeaway && (
            <div className="mk-chat-takeaway">
              <Icon name="circle-check" />
              <span><strong>Điểm cốt lõi:</strong> {current.takeaway}</span>
            </div>
          )}
          <div className="mk-chat-answer">
            <span className="mk-assistant-avatar" aria-hidden="true">
              <Icon name="sparkles" />
            </span>
            <p>{current.answer}</p>
          </div>
        </div>
      </div>

      <div className="mk-chat-footer">
        <Link to="/mo-phong" className="mk-chat-action-btn">
          <span>Áp dụng kịch bản này vào Mô phỏng</span>
          <Icon name="arrow-right" />
        </Link>
      </div>
    </div>
  );
}

export function HowItWorksPage() {
  return <MarketingLayout><PageIntro eyebrow="CÁCH HOẠT ĐỘNG" title="Một kế hoạch tốt bắt đầu từ chính bạn.">Từng bước nhìn rõ hiện tại, thử những khả năng và chuẩn bị cho cuộc sống bạn mong muốn.</PageIntro><section className="mk-container mk-how-grid">{steps.map((step, index) => <article className="mk-how-step" key={step.title}><span className="mk-how-number">{index + 1}</span><Icon name={step.icon} /><h2>{step.title}</h2><p>{step.text}</p><p>{[
    'Chuẩn bị thông tin về tuổi, tiền tiết kiệm, tài sản có thể dùng cho hưu trí và khả năng tích lũy. Bạn có thể bắt đầu với một bộ số liệu mẫu.',
    'Xác định tuổi nghỉ hưu, thời gian cần sử dụng quỹ và mức chi tiêu theo giá trị hiện tại. Mục tiêu có thể được cập nhật bất kỳ lúc nào.',
    'Thử thay đổi từng yếu tố như tuổi nghỉ hưu, khoản góp hàng tháng hoặc lạm phát. So sánh kết quả để hiểu kế hoạch phụ thuộc vào điều gì.',
    'Tạo tài khoản để trải nghiệm hồ sơ và theo dõi kế hoạch. Bản demo hiện lưu thông tin trên thiết bị, không thay thế dịch vụ tư vấn chuyên môn.',
  ][index]}</p></article>)}</section><section className="mk-container mk-faq"><h2>Những điều cần biết trước khi bắt đầu</h2>{[
    ['Tôi có cần tài khoản để thử không?', 'Không. Trang Mô phỏng cho phép bạn thay đổi các giả định và xem kết quả ngay, không cần đăng nhập.'],
    ['Kết quả mô phỏng có ý nghĩa gì?', 'Đó là phép tính với dữ liệu và giả định bạn chọn. Kết quả không phải dự báo chính xác và không cam kết lợi nhuận.'],
    ['Thông tin trong bản demo được lưu ở đâu?', 'Hồ sơ trải nghiệm hiện được lưu trên trình duyệt của thiết bị bạn sử dụng. Không nên xem bản demo là nơi lưu trữ duy nhất cho thông tin quan trọng.'],
  ].map(([question, answer]) => <details key={question}><summary>{question}<Icon name="plus" /></summary><p>{answer}</p></details>)}</section><FinalCTA /></MarketingLayout>;
}

export function AssistantPage() {
  return (
    <MarketingLayout>
      {/* SECTION 1: Asymmetric Split Hero Command Center */}
      <section className="mk-assistant-hero">
        <div className="mk-container mk-assistant-hero-inner">
          <div className="mk-assistant-hero-copy">
            <span className="mk-eyebrow">TRỢ LÝ HƯU TRÍ ĐỘC LẬP</span>
            <h1>
              <span className="mk-hero-line">Hỏi đúng băn khoăn.</span><br />
              <span className="mk-hero-line">Vạch rõ tương lai.</span>
            </h1>
            <p className="mk-assistant-hero-desc">
              Phân tích tác động của lãi kép, lạm phát và lương hưu BHXH qua đối thoại thực tế, minh bạch và độc lập.
            </p>

            <div className="mk-assistant-hero-cta">
              <MarketingButton to="/mo-phong">Thử kịch bản ngay</MarketingButton>
              <Link to="/cach-hoat-dong" className="mk-text-link">Xem quy trình 4 bước<Icon name="arrow-right" /></Link>
            </div>

            <div className="mk-benchmarks-strip" aria-label="Các chỉ số tài chính tham chiếu">
              <div className="mk-benchmark-item">
                <span className="mk-benchmark-val">15% - 20%</span>
                <span className="mk-benchmark-lbl">Tích lũy hàng tháng</span>
              </div>
              <div className="mk-benchmark-item">
                <span className="mk-benchmark-val">70% - 75%</span>
                <span className="mk-benchmark-lbl">Bù đắp thu nhập</span>
              </div>
              <div className="mk-benchmark-item">
                <span className="mk-benchmark-val">3,5%/năm</span>
                <span className="mk-benchmark-lbl">Lạm phát cơ sở</span>
              </div>
            </div>
          </div>

          <div className="mk-assistant-hero-console">
            <AssistantPreview expanded />
          </div>
        </div>
      </section>

      {/* SECTION 2: 3-Phase Intelligent Analysis Flow */}
      <section className="mk-section mk-assistant-flow-section">
        <div className="mk-container">
          <div className="mk-section-heading mk-centered mk-reveal">
            <h2>Từ câu hỏi mơ hồ đến kế hoạch rõ ràng</h2>
            <p>Ba bước chuyển hóa băn khoăn tài chính thành quyết định hưu trí tự tin và có cơ sở toán học.</p>
          </div>

          <div className="mk-flow-grid">
            <div className="mk-flow-card mk-reveal">
              <div className="mk-flow-badge"><Icon name="wallet" /></div>
              <span className="mk-flow-tag">Dữ liệu chuẩn xác</span>
              <h3>Rà soát điểm xuất phát</h3>
              <p>Tổng hợp tuổi tác, chi tiêu thực tế, các khoản tiết kiệm hiện hữu và khả năng tích lũy đều đặn mỗi tháng theo sức mua hôm nay.</p>
            </div>

            <div className="mk-flow-connector" aria-hidden="true">
              <Icon name="arrow-right" />
            </div>

            <div className="mk-flow-card mk-reveal">
              <div className="mk-flow-badge"><Icon name="chart" /></div>
              <span className="mk-flow-tag">Mô phỏng động</span>
              <h3>Stress-test đa kịch bản</h3>
              <p>Đo lường độ bền của quỹ khi lạm phát y tế tăng cao, lãi suất suy giảm hoặc khi bạn quyết định nghỉ hưu sớm hơn dự kiến.</p>
            </div>

            <div className="mk-flow-connector" aria-hidden="true">
              <Icon name="arrow-right" />
            </div>

            <div className="mk-flow-card mk-reveal">
              <div className="mk-flow-badge"><Icon name="target" /></div>
              <span className="mk-flow-tag">Định hướng rõ ràng</span>
              <h3>Xác lập lộ trình khả thi</h3>
              <p>Nhận diện chính xác khoảng thiếu hụt (Retirement Gap), tỷ lệ thay thế thu nhập và mức phân bổ tích lũy từng tháng phù hợp.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Bento Grid: So sánh phương pháp (Manual vs An Huu AI) */}
      <section className="mk-section mk-comparison-bento-section">
        <div className="mk-container">
          <div className="mk-section-heading mk-centered mk-reveal">
            <h2>Vì sao nên đồng hành cùng trợ lý chuyên biệt?</h2>
            <p>Sự khác biệt giữa việc tự ước tính bằng bảng tính thông thường và mô phỏng tài chính đa biến cùng An Hưu.</p>
          </div>

          <div className="mk-bento-grid">
            {/* Card 1: Thủ công / Excel */}
            <div className="mk-bento-card mk-bento-manual mk-reveal">
              <div className="mk-bento-header">
                <span className="mk-bento-tag">Phương pháp thủ công / Excel</span>
                <h3>Tự tính toán truyền thống</h3>
              </div>
              <ul className="mk-bento-list">
                <li><Icon name="info" /> <span>Dễ bỏ quên lạm phát lũy kế kép suốt 25 - 30 năm nghỉ hưu</span></li>
                <li><Icon name="info" /> <span>Khó tính toán chính xác dòng tiền rút dần và phần vốn còn lại sinh lời</span></li>
                <li><Icon name="info" /> <span>Không stress-test được khi lãi suất giảm hay chi phí y tế tuổi già tăng</span></li>
                <li><Icon name="info" /> <span>Tốn hàng giờ mày mò công thức và dễ phát sinh sai sót ẩn</span></li>
                <li><Icon name="info" /> <span>Dễ bị chi phối bởi nhân viên tư vấn bán bảo hiểm hoặc chứng chỉ quỹ</span></li>
              </ul>
            </div>

            {/* Card 2: Trợ lý An Hưu (Hero Dark Bento Card) */}
            <div className="mk-bento-card mk-bento-anhuu mk-reveal">
              <div className="mk-bento-header">
                <span className="mk-bento-tag is-brand">Trợ lý Độc lập An Hưu</span>
                <h3>Mô phỏng toán học đa biến</h3>
              </div>
              <ul className="mk-bento-list">
                <li><Icon name="circle-check" /> <span>Tự động tính lạm phát kép theo sức mua thực tế qua từng năm</span></li>
                <li><Icon name="circle-check" /> <span>Mô phỏng chi tiết dòng tiền rút và phần vốn còn lại sinh lời tiếp</span></li>
                <li><Icon name="circle-check" /> <span>Tùy biến nhanh 3 kịch bản: Thận trọng, Cân bằng và Tối ưu hóa</span></li>
                <li><Icon name="circle-check" /> <span>Chỉ mất 2 phút thiết lập trực quan với phản hồi độ nhạy tức thì</span></li>
                <li><Icon name="circle-check" /> <span>100% độc lập: Không ăn hoa hồng môi giới, bảo vệ bạn trọn vẹn</span></li>
              </ul>
              <div className="mk-bento-footer">
                <Link to="/mo-phong" className="mk-bento-action">
                  <span>Trải nghiệm mô phỏng ngay</span>
                  <Icon name="arrow-right" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: AI Ethics & Guardrails Banner */}
      <section className="mk-section mk-guardrails-section">
        <div className="mk-container">
          <div className="mk-guardrails-card mk-reveal">
            <div className="mk-guardrails-header">
              <span className="mk-feature-icon"><Icon name="compass" /></span>
              <div>
                <span className="mk-eyebrow">CAM KẾT MINH BẠCH</span>
                <h3>Ba nguyên tắc đạo đức không bao giờ thỏa hiệp</h3>
              </div>
            </div>
            <div className="mk-guardrails-grid">
              <div>
                <strong>1. Độc lập 100%</strong>
                <p>An Hưu không bán bảo hiểm, không phân phối chứng chỉ quỹ và không nhận hoa hồng môi giới. Quyền lợi duy nhất chúng tôi bảo vệ là của bạn.</p>
              </div>
              <div>
                <strong>2. Không thuật toán "hộp đen"</strong>
                <p>Mọi kết quả mô phỏng đều xuất phát từ công thức toán học mở (lãi kép, tỷ lệ chiết khấu, lạm phát thực tế) mà bạn hoàn toàn có thể tự kiểm chứng.</p>
              </div>
              <div>
                <strong>3. Bảo mật trên thiết bị</strong>
                <p>Dữ liệu trải nghiệm được xử lý trực tiếp trên trình duyệt của bạn. Chúng tôi không yêu cầu và không lưu trữ số CCCD hay tài khoản ngân hàng.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: FAQs */}
      <section className="mk-container mk-faq">
        <h2>Câu hỏi thường gặp về Trợ lý An Hưu</h2>
        {assistantFaqs.map(faq => (
          <details key={faq.q}>
            <summary>{faq.q}<Icon name="plus" /></summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </section>

      <FinalCTA />
    </MarketingLayout>
  );
}

const defaultInput: RetirementCalculationInput = {
  currentAge: 32, retirementAge: 60, lifeExpectancy: 85, monthlyExpenseToday: 20000000,
  monthlyContribution: 10000000, annualReturnRate: 6, annualInflationRate: 3,
  cashSavings: 300000000, liquidAssets: 0, stockFundValue: 0, consumerDebt: 0,
  socialInsuranceYears: 0, socialInsuranceSalary: 0,
};

export function SimulationPage() {
  const [input, setInput] = useState(defaultInput);
  const result = calculateRetirement(input);
  const update = (key: keyof RetirementCalculationInput, value: number) => setInput(current => {
    const next = { ...current, [key]: value };
    next.retirementAge = Math.max(next.currentAge + 1, next.retirementAge);
    next.lifeExpectancy = Math.max(next.retirementAge + 1, next.lifeExpectancy);
    return next;
  });
  const fields: { key: keyof RetirementCalculationInput; label: string; min: number; max: number; step: number; format: (v: number) => string }[] = [
    { key: 'currentAge', label: 'Tuổi hiện tại', min: 18, max: 65, step: 1, format: v => `${v} tuổi` },
    { key: 'retirementAge', label: 'Tuổi nghỉ hưu', min: input.currentAge + 1, max: 75, step: 1, format: v => `${v} tuổi` },
    { key: 'lifeExpectancy', label: 'Dự trù chi tiêu đến tuổi', min: input.retirementAge + 1, max: 100, step: 1, format: v => `${v} tuổi` },
    { key: 'cashSavings', label: 'Tài sản ban đầu', min: 0, max: 5000000000, step: 50000000, format: currency },
    { key: 'monthlyExpenseToday', label: 'Chi tiêu mỗi tháng theo giá hôm nay', min: 5000000, max: 60000000, step: 1000000, format: currency },
    { key: 'monthlyContribution', label: 'Tích lũy mỗi tháng', min: 0, max: 50000000, step: 500000, format: currency },
    { key: 'annualReturnRate', label: 'Lợi suất giả định mỗi năm', min: 0, max: 12, step: 0.5, format: v => `${v}%` },
    { key: 'annualInflationRate', label: 'Lạm phát giả định mỗi năm', min: 0, max: 10, step: 0.5, format: v => `${v}%` },
  ];
  const years = Array.from({ length: 7 }, (_, index) => input.currentAge + (result.yearsToRetirement * index / 6));
  const balances = years.map(age => projectBalanceAtAge(input, age));
  const max = Math.max(1, ...balances, result.targetFund);
  const points = balances.map((balance, index) => `${index * 100},${180 - balance / max * 150}`).join(' ');
  return <MarketingLayout><PageIntro eyebrow="MÔ PHỎNG HƯU TRÍ" title="Thử hôm nay. Hiểu thêm về ngày mai.">Thay đổi một giả định, nhìn thấy một khả năng. Không cần đăng nhập, không lưu thông tin cá nhân.</PageIntro><section className="mk-container mk-simulator"><div className="mk-sim-inputs"><div className="mk-sim-title"><h2>Kịch bản của bạn</h2><button type="button" onClick={() => setInput(defaultInput)}>Đặt lại</button></div>{fields.map(field => <div className="mk-range-field" key={field.key}><div><label htmlFor={`sim-${field.key}`}>{field.label}</label><output htmlFor={`sim-${field.key}`}>{field.format(input[field.key])}</output></div><input id={`sim-${field.key}`} type="range" min={field.min} max={field.max} step={field.step} value={input[field.key]} aria-valuetext={field.format(input[field.key])} onChange={event => update(field.key, Number(event.target.value))} /></div>)}</div><div className="mk-sim-output"><span className="mk-eyebrow">SAU {result.yearsToRetirement} NĂM TÍCH LŨY</span><div className="mk-sim-results" aria-live="polite" aria-atomic="true"><p>Quỹ dự kiến ở tuổi {input.retirementAge}</p><strong data-testid="projected-fund">{currency(result.projectedFund)}</strong><dl><div><dt>Quỹ mục tiêu ước tính</dt><dd>{currency(result.targetFund)}</dd></div><div><dt>{result.gap > 0 ? 'Khoảng thiếu hụt ước tính' : 'Phần vượt mục tiêu ước tính'}</dt><dd>{currency(Math.abs(result.gap))}</dd></div><div><dt>Chi tiêu mỗi tháng khi nghỉ hưu</dt><dd>{currency(result.futureMonthlyExpense)}</dd></div></dl></div><div className="mk-sim-chart"><svg viewBox="0 0 600 205" role="img" aria-label="Biểu đồ quỹ tích lũy dự kiến theo thời gian"><line x1="0" y1="180" x2="600" y2="180" stroke="#cbdde9" /><polyline points={`0,180 ${points} 600,180`} fill="#e3f4f2" stroke="none" /><polyline points={points} fill="none" stroke="#008a75" strokeWidth="4" strokeLinejoin="round" /><line x1="0" y1={180 - result.targetFund / max * 150} x2="600" y2={180 - result.targetFund / max * 150} stroke="#10385b" strokeDasharray="6 6" strokeWidth="2" /></svg><div className="mk-chart-labels"><span>{input.currentAge} tuổi</span><span>{input.retirementAge} tuổi</span></div><div className="mk-chart-legend"><span><i />Quỹ dự kiến</span><span><i />Quỹ mục tiêu</span></div></div><MarketingButton>Lập kế hoạch của riêng bạn</MarketingButton></div></section><section className="mk-container mk-assumptions"><h2>Hiểu các giả định phía sau kết quả</h2><p>Đây là mô hình minh họa với lợi suất và lạm phát cố định, khoản tích lũy được góp vào cuối mỗi tháng. Chưa tính lương hưu BHXH, thuế, phí, nợ hoặc biến động thị trường. Tài sản ban đầu được xem là toàn bộ phần có thể dùng cho hưu trí.</p><p>Giai đoạn nghỉ hưu dùng lợi suất thấp hơn giai đoạn tích lũy 1,5 điểm phần trăm, tối thiểu 0%. Chi tiêu tăng theo lạm phát cho đến tuổi dự trù. Đây là giả định của công cụ, không phải mức lợi suất được đảm bảo.</p></section></MarketingLayout>;
}
