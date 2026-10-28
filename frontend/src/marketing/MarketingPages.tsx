import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../components/ui';
import MarketingLayout, { FinalCTA, MarketingButton } from './MarketingLayout';
import { saveSimulatorPrefill } from '../services/simulatorPrefill';
import peacefulRetirement from '../assets/peaceful-retirement.webp';
import './marketing-experience.css';
import {
  assistantExamples,
  assistantFaqs,
  steps,
} from './content';
import { calculateRetirement, projectBalanceAtAge, type RetirementCalculationInput } from '../domain/retirementCalculator';

const compactMoney = (amount: number) => amount >= 1e9 ? `${(amount / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ` : amount >= 1e6 ? `${(amount / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu` : currency(amount);
const currency = (amount: number) => `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} VND`;

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
        {current.scenarioParams ? (
          <Link
            to={`/mo-phong?${new URLSearchParams({
              ...Object.fromEntries(
                Object.entries(current.scenarioParams).map(([k, v]) => [k, String(v)])
              ),
              scenarioName: current.scenarioName || current.tabLabel || 'Kịch bản đề xuất',
            }).toString()}`}
            className="mk-chat-action-btn"
          >
            <span>{current.actionLabel || 'Áp dụng kịch bản này vào Mô phỏng'}</span>
            <Icon name="arrow-right" />
          </Link>
        ) : (
          <Link to="/mo-phong" className="mk-chat-action-btn">
            <span>{current.actionLabel || 'Mở công cụ mô phỏng'}</span>
            <Icon name="arrow-right" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function HowItWorksPage() {
  return <MarketingLayout><div className="mk-how-page">
    <section className="mk-container mk-how-hero">
      <div>
        <span className="mk-eyebrow">CÁCH HOẠT ĐỘNG</span>
        <h1>Một ngày mai an yên.<br /><span>Bắt đầu từ bạn.</span></h1>
        <p>Không cần giỏi tài chính để bắt đầu. Chỉ cần biết cuộc sống bạn mong muốn — An Hưu giúp bạn nhìn rõ những bước tiếp theo.</p>
        <MarketingButton to="/mo-phong">Thử kế hoạch của tôi</MarketingButton>
        <div className="mk-experience-note"><Icon name="circle-check" /> Không cần tài khoản · Bắt đầu với số liệu mẫu</div>
      </div>
      <div className="mk-how-visual">
        <img src={peacefulRetirement} width="720" height="840" alt="Cuộc sống nghỉ hưu bình yên giữa thiên nhiên" fetchPriority="high" />
        <div className="mk-how-caption"><span>ĐÍCH ĐẾN CỦA KẾ HOẠCH</span><strong>Thời gian cho những<br />điều bạn yêu.</strong></div>
        <div className="mk-how-photo-note"><span className="mk-feature-icon"><Icon name="compass" /></span><div><strong>Mỗi người, một lộ trình</strong><small>Đi từng bước, theo nhịp của bạn.</small></div></div>
      </div>
    </section>
    <section className="mk-container mk-promise-strip" aria-label="Bạn sẽ hiểu được gì">
      {['Biết mình cần bao nhiêu.', 'Hiểu hiện tại đủ đến đâu.', 'Chọn một bước vừa sức.'].map((text, i) => <div key={text}><span>0{i + 1}</span><p>{text}</p></div>)}
    </section>
    <section className="mk-container mk-how-journey" aria-labelledby="how-steps-title">
      <div className="mk-how-journey-intro"><span className="mk-eyebrow">BỐN BƯỚC NHỎ</span><h2 id="how-steps-title">Từ một mong muốn,<br /><span>đến một kế hoạch.</span></h2><p>Bạn không cần có mọi câu trả lời ngay hôm nay. Mỗi con số đều có thể điều chỉnh khi cuộc sống thay đổi.</p><Link to="/mo-phong" className="mk-text-link">Khám phá bản mô phỏng<Icon name="arrow-right" /></Link></div>
      <ol className="mk-how-timeline">{steps.map((step, index) => <li key={step.title}>
        <span className="mk-how-step-index">0{index + 1}</span><div><span className="mk-how-step-label">{['ĐIỂM XUẤT PHÁT', 'CUỘC SỐNG BẠN CHỌN', 'NHỮNG KHẢ NĂNG', 'BƯỚC TIẾP THEO'][index]}</span><h3>{step.title}</h3><p>{[
          'Nhập tuổi, phần tài sản dành cho hưu trí và số tiền có thể góp mỗi tháng. Tách riêng dự phòng và các khoản sắp cần.',
          'Chọn tuổi nghỉ hưu và mức chi theo giá hôm nay. Mô phỏng sẽ tính ảnh hưởng của lạm phát đến quỹ cần chuẩn bị.',
          'Nghỉ muộn hơn, chi ít hơn, hay thị trường kém thuận lợi? Đổi một giả định và xem khoảng thiếu thay đổi thế nào.',
          'Xem khoản góp cần thiết, đối chiếu với ngân sách và chọn cách điều chỉnh phù hợp. Tạo tài khoản khi muốn lập kế hoạch đầy đủ.',
        ][index]}</p><div className="mk-how-example"><Icon name={step.icon} /><span>{['Ví dụ: 32 tuổi · 300 triệu vốn ban đầu', 'Mục tiêu: nghỉ tuổi 60 · chi 20 triệu/tháng', 'Thử: nghỉ muộn 5 năm hoặc giảm mức chi 15%', 'Chọn khoản góp bạn có thể duy trì'][index]}</span></div></div>
      </li>)}</ol>
    </section>
    <section className="mk-container mk-how-faq">
      <div><span className="mk-eyebrow">TRƯỚC KHI BẮT ĐẦU</span><h2>Một vài điều<br />bạn có thể băn khoăn.</h2><p>Hiểu rõ công cụ, chủ động với lựa chọn.</p></div>
      <div className="mk-faq">{[
        ['Tôi có cần tài khoản để thử không?', 'Không. Bạn có thể nhập số, thử các kịch bản và phân bổ tài sản ngay trong trang Mô phỏng, không cần đăng nhập.'],
        ['Tôi chưa biết chính xác các con số thì sao?', 'Hãy bắt đầu bằng số liệu mẫu hoặc một ước tính gần đúng. Sau đó thay đổi từng yếu tố để xem điều gì ảnh hưởng nhiều nhất đến kế hoạch.'],
        ['Kết quả có được đảm bảo không?', 'Không. Đây là phép tính theo dữ liệu và giả định bạn chọn, với lợi suất và lạm phát cố định. Kết quả không phải dự báo hay cam kết lợi nhuận.'],
        ['Demo có lưu thông tin của tôi không?', 'Các thay đổi trong demo chỉ dùng cho lần trải nghiệm hiện tại, không tự lưu thành hồ sơ. Tạo tài khoản nếu bạn muốn xây dựng và quản lý kế hoạch đầy đủ.'],
      ].map(([question, answer]) => <details key={question}><summary>{question}<Icon name="plus" /></summary><p>{answer}</p></details>)}</div>
    </section>
    <FinalCTA />
  </div></MarketingLayout>;
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

const inputBounds = {
  currentAge: [18, 74], retirementAge: [18, 75], lifeExpectancy: [19, 110],
  cashSavings: [0, 50000000000], monthlyExpenseToday: [0, 500000000],
  monthlyContribution: [0, 500000000], annualReturnRate: [0, 30], annualInflationRate: [0, 20],
} as const;

function normalizeInput(input: RetirementCalculationInput) {
  const next = { ...input };
  for (const key of Object.keys(inputBounds) as (keyof typeof inputBounds)[]) {
    const [min, max] = inputBounds[key];
    next[key] = Number.isFinite(input[key]) ? Math.min(max, Math.max(min, input[key])) : defaultInput[key];
    if (key.endsWith('Age') || key === 'lifeExpectancy') next[key] = Math.round(next[key]);
  }
  next.retirementAge = Math.max(next.currentAge, next.retirementAge);
  next.lifeExpectancy = Math.max(next.retirementAge + 1, next.lifeExpectancy);
  return next;
}

function parseScenarioInput(searchParams: URLSearchParams) {
  const input = { ...defaultInput };
  let hasScenario = false;
  for (const key of Object.keys(inputBounds) as (keyof typeof inputBounds)[]) {
    const raw = searchParams.get(key);
    if (raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw))) {
      input[key] = Number(raw);
      hasScenario = true;
    }
  }
  return { input: normalizeInput(input), scenarioName: searchParams.get('scenarioName') || (hasScenario ? 'Kịch bản của bạn' : null) };
}

function SimFieldInput({
  id,
  label,
  value,
  min,
  max,
  sliderMax,
  step,
  unit,
  isCurrency,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  sliderMax?: number;
  step: number;
  unit: string;
  isCurrency?: boolean;
  onChange: (v: number) => void;
}) {
  const formatDisplay = (v: number) => isCurrency ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(v);
  const [textValue, setTextValue] = useState(() => formatDisplay(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setTextValue(formatDisplay(value));
    }
  }, [value, isCurrency, isFocused]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextValue(e.target.value);
  };

  const handleBlur = () => {
    const raw = isCurrency ? textValue.replace(/[.\s]/g, '') : textValue.replace(',', '.').trim();
    const parsed = Number(raw);
    const next = raw !== '' && Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    onChange(next);
    setIsFocused(false);
    setTextValue(formatDisplay(next));
  };

  return (
    <div className="mk-range-field">
      <div className="mk-field-header">
        <label htmlFor={`num-${id}`}>{label}</label>
        <div className="mk-field-input-wrap">
          <input
            id={`num-${id}`}
            type="text"
            inputMode={isCurrency ? "numeric" : "decimal"}
            className="mk-num-input"
            value={textValue}
            onFocus={() => setIsFocused(true)}
            onChange={handleTextChange}
            onBlur={handleBlur}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            aria-label={`Nhập giá trị cho ${label}`}
          />
          <span className="mk-field-unit">{unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={Math.max(value, sliderMax ?? max)}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
        aria-valuetext={`${value} ${unit}`}
      />
      {sliderMax !== undefined && <div className="mk-slider-endpoints" aria-hidden="true"><span>{compactMoney(min)}</span><span>{compactMoney(Math.max(value, sliderMax))}</span></div>}
    </div>
  );
}

const allocationAssets = [
  { name: 'Tiết kiệm', weight: 30, rate: 4, description: 'Xem kỳ hạn và điều kiện rút tiền; tách dự phòng khỏi phần dành cho hưu trí.' },
  { name: 'Trái phiếu Chính phủ', weight: 30, rate: 5, description: 'Giá có thể biến động trước đáo hạn. Không dùng chung giả định này cho trái phiếu doanh nghiệp.' },
  { name: 'Cổ phiếu đa dạng hóa', weight: 30, rate: 8, description: 'Dành cho phần vốn dài hạn; giá có thể giảm mạnh và không tăng đều mỗi năm.' },
  { name: 'Vàng', weight: 10, rate: 3, description: 'Không tạo dòng thu định kỳ; giá và chênh lệch mua bán ảnh hưởng kết quả.' },
];

export function SimulationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialData = useMemo(() => parseScenarioInput(searchParams), [searchParams]);
  const [input, setInput] = useState<RetirementCalculationInput>(initialData.input);
  const [appliedScenario, setAppliedScenario] = useState<string | null>(initialData.scenarioName);
  const [allocation, setAllocation] = useState(allocationAssets);
  const [allocationApplied, setAllocationApplied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Sync if URL search params change (e.g. back/forward navigation)
  useEffect(() => {
    const parsed = parseScenarioInput(searchParams);
    setInput(parsed.input);
    setAppliedScenario(parsed.scenarioName);
    setAllocationApplied(false);
  }, [searchParams]);

  const result = calculateRetirement(input);

  const update = (key: keyof RetirementCalculationInput, value: number) => {
    setInput(current => normalizeInput({ ...current, [key]: value }));
    setAppliedScenario(null);
    if (key === 'annualReturnRate') setAllocationApplied(false);
  };

  const handleReset = () => {
    setInput(defaultInput);
    setAppliedScenario(null);
    setAllocation(allocationAssets);
    setAllocationApplied(false);
    setSearchParams({}, { replace: true });
  };

  // Depletion milestone calculation (FE-23)
  const postRetirementAnalysis = useMemo(() => {
    if (result.gap <= 0) {
      return {
        depleted: false,
        depletionAge: null,
        message: `Quỹ dự kiến đáp ứng chi tiêu đến hết mốc dự trù ${input.lifeExpectancy} tuổi theo các giả định đã chọn.`,
      };
    }
    const monthlyReturn = Math.pow(1 + Math.max(0, input.annualReturnRate) / 100, 1 / 12) - 1;
    const monthlyInflation = Math.pow(1 + Math.max(0, input.annualInflationRate) / 100, 1 / 12) - 1;
    let balance = result.projectedFund;
    const postMonths = (input.lifeExpectancy - input.retirementAge) * 12;
    for (let m = 0; m < postMonths; m++) {
      const withdrawal = result.futureMonthlyExpense * Math.pow(1 + monthlyInflation, m);
      balance = balance * (1 + monthlyReturn) - withdrawal;
      if (balance <= 0) {
        const depletionAge = Math.floor(input.retirementAge + (m + 1) / 12);
        const yearsAfter = Math.max(0, depletionAge - input.retirementAge);
        return {
          depleted: true,
          depletionAge,
          yearsAfter,
          message: `Quỹ dự kiến (${currency(result.projectedFund)}) có thể cạn kiệt vào khoảng tuổi ${depletionAge} (sau ${yearsAfter} năm nghỉ hưu) nếu duy trì mức chi tiêu này. Khoảng thiếu hụt cần tích lũy thêm là ${currency(result.gap)}.`,
        };
      }
    }
    return {
      depleted: false,
      depletionAge: null,
      message: `Quỹ dự kiến đáp ứng chi tiêu đến hết mốc dự trù ${input.lifeExpectancy} tuổi theo các giả định đã chọn.`,
    };
  }, [input, result]);

  const months = result.yearsToRetirement * 12;
  const monthlyRate = Math.pow(1 + input.annualReturnRate / 100, 1 / 12) - 1;
  const contributionFactor = monthlyRate === 0 ? months : Math.expm1(months * Math.log1p(monthlyRate)) / monthlyRate;
  const principalAtRetirement = input.cashSavings * Math.pow(1 + monthlyRate, months);
  const requiredContribution = months > 0 ? Math.ceil(Math.max(0, result.targetFund - principalAtRetirement) / contributionFactor) : null;
  const comparisons = [
    { name: 'Nghỉ muộn hơn 5 năm', input: normalizeInput({ ...input, retirementAge: Math.min(75, input.retirementAge + 5) }), disabled: input.retirementAge >= 75 },
    { name: 'Giảm mức chi 15%', input: { ...input, monthlyExpenseToday: Math.round(input.monthlyExpenseToday * .85) }, disabled: input.monthlyExpenseToday === 0 },
    { name: 'Lạm phát tăng 1 điểm %', input: normalizeInput({ ...input, annualInflationRate: input.annualInflationRate + 1 }), disabled: input.annualInflationRate >= 20 },
    { name: 'Lợi suất giảm 1,5 điểm %', input: normalizeInput({ ...input, annualReturnRate: input.annualReturnRate - 1.5 }), disabled: input.annualReturnRate === 0 },
  ];
  const totalWeight = allocation.reduce((sum, asset) => sum + asset.weight, 0);
  const weightedReturn = Math.round(allocation.reduce((sum, asset) => sum + asset.weight * asset.rate / 100, 0) * 100) / 100;
  const validAllocation = Math.abs(totalWeight - 100) < .001;

  // Include the retirement milestone so the peak is not skipped by coarse sampling.
  const totalSpan = Math.max(1, input.lifeExpectancy - input.currentAge);
  const years = [...new Set([...Array.from({ length: totalSpan + 1 }, (_, index) => input.currentAge + index), input.retirementAge])].sort((a, b) => a - b);
  const balances = years.map(age => projectBalanceAtAge(input, age));
  const max = Math.max(1, ...balances, result.targetFund);
  const points = balances.map((balance, index) => `${50 + (years[index] - input.currentAge) / totalSpan * 570},${230 - balance / max * 190}`).join(' ');
  const retirementX = 50 + (input.retirementAge - input.currentAge) / totalSpan * 570;

  return (
    <MarketingLayout><div className="mk-simulation-page">
      <header className="mk-container mk-simulation-intro">
        <div><span className="mk-eyebrow">KỊCH BẢN CHO CUỘC SỐNG BẠN CHỌN</span><h1>Một thay đổi, một ngày mai khác.</h1><p>Thử những lựa chọn vừa với bạn. Nhìn rõ quỹ hưu trí, mức sống và khoản tích lũy cần chuẩn bị.</p></div>
        <button type="button" className="mk-scenario-reset" onClick={() => { setAdvancedOpen(true); requestAnimationFrame(() => { document.getElementById('num-sim-currentAge')?.focus(); }); }}><Icon name="settings" /> Sửa thông tin</button>
      </header>
      <nav className="mk-container mk-demo-nav" aria-label="Các phần mô phỏng">
        <a href="#ke-hoach"><Icon name="chart" /> Kế hoạch của bạn</a><a href="#kich-ban"><Icon name="compass" /> Thử kịch bản</a><a href="#phan-bo"><Icon name="wallet" /> Phân bổ tài sản</a>
      </nav>
      <div className="mk-container mk-demo-notice"><span><Icon name="info" /> Đây là ví dụ minh họa. Thay đổi trong demo chưa được lưu.</span><Link to="/register" onClick={() => saveSimulatorPrefill({ currentAge: input.currentAge, retirementAge: input.retirementAge, monthlyExpenseToday: input.monthlyExpenseToday })}>Tạo kế hoạch riêng <Icon name="arrow-right" /></Link></div>
      <section className="mk-container mk-purchasing-power" aria-label="Ảnh hưởng của lạm phát">
        <div><span>Mức sống theo giá hôm nay</span><strong>{compactMoney(input.monthlyExpenseToday)}<small> / tháng</small></strong></div>
        <Icon name="arrow-right" />
        <div><span>Cùng mức sống ở tuổi {input.retirementAge}</span><strong>{compactMoney(result.futureMonthlyExpense)}<small> / tháng</small></strong></div>
        <p>Với lạm phát {input.annualInflationRate.toLocaleString('vi-VN')}%/năm, sau {result.yearsToRetirement} năm cần số tiền gấp <b>{Math.pow(1 + input.annualInflationRate / 100, result.yearsToRetirement).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} lần</b> để giữ sức mua.</p>
      </section>
      <section className="mk-container mk-sim-metrics" aria-label="Tổng quan kế hoạch" aria-live="polite" aria-atomic="true">
        <article className="mk-metric-primary"><span>Quỹ cần khi nghỉ hưu<Icon name="target" /></span><strong aria-label={currency(result.targetFund)}>{compactMoney(result.targetFund)}</strong><small>Dự trù chi tiêu đến tuổi {input.lifeExpectancy}</small></article>
        <article><span>Quỹ dự kiến của bạn<Icon name="wallet" /></span><strong data-testid="projected-fund" aria-label={currency(result.projectedFund)}>{compactMoney(result.projectedFund)}</strong><small>Tại tuổi {input.retirementAge} · sau {result.yearsToRetirement} năm tích lũy</small></article>
        <article><span>Khoản góp cần mỗi tháng<Icon name="chart" /></span><strong>{requiredContribution === null ? '—' : compactMoney(requiredContribution)}</strong><small>{requiredContribution === null ? 'Đã đến tuổi nghỉ hưu đã chọn' : 'Góp đều theo các giả định hiện tại'}</small></article>
        <article><span>Bạn đang góp mỗi tháng<Icon name="compass" /></span><strong>{compactMoney(input.monthlyContribution)}</strong><small>Chưa đối chiếu với ngân sách của bạn</small></article>
      </section>

      <section className="mk-container mk-sim-workspace" id="ke-hoach" aria-label="Điều chỉnh kế hoạch">
        <div className="mk-sim-main">
          <div className="mk-plan-chart-card">
            <div className="mk-chart-heading"><div><h2>Hành trình quỹ hưu trí của bạn</h2><p>{input.currentAge} → {input.retirementAge} tuổi tích lũy · dự trù đến {input.lifeExpectancy} tuổi</p></div><span className="mk-plan-status">{result.gap > 0 ? 'Cần điều chỉnh' : 'Đáp ứng mục tiêu'}</span></div>
            <div className="mk-plan-chart">
              <span className="mk-chart-unit">Tỷ đồng · giá tại từng thời điểm</span>
              <svg viewBox="0 0 640 270" role="img" aria-label="Biểu đồ quỹ tích lũy dự kiến theo thời gian">
                {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="50" y1={230 - i * 47.5} x2="620" y2={230 - i * 47.5} className="mk-plot-grid" /><text x="38" y={234 - i * 47.5} textAnchor="end">{(max * i / 4 / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</text></g>)}
                <polygon points={`50,230 ${points} 620,230`} className="mk-plot-area" />
                <line x1="50" y1={230 - result.targetFund / max * 190} x2={retirementX} y2={230 - result.targetFund / max * 190} className="mk-plot-target" />
                <line x1={retirementX} y1="25" x2={retirementX} y2="230" className="mk-plot-milestone" />
                <polyline points={points} className="mk-plot-line" />
                <circle cx={retirementX} cy={230 - result.projectedFund / max * 190} r="5" className="mk-plot-point" />
                <text x="50" y="255">{input.currentAge} tuổi</text>
                {input.retirementAge > input.currentAge + 5 && input.retirementAge < input.lifeExpectancy - 5 && <text x={retirementX} y="255" textAnchor="middle">Nghỉ hưu · {input.retirementAge}</text>}
                <text x="620" y="255" textAnchor="end">{input.lifeExpectancy} tuổi</text>
              </svg>
              <div className="mk-plot-legend"><span><i />Quỹ dự kiến</span><span><i />Quỹ cần tại tuổi {input.retirementAge}</span><span><i />Mốc nghỉ hưu</span></div>
            </div>
            <div className="mk-coverage"><div><span>Đáp ứng mục tiêu quỹ</span><strong data-testid="readiness">{result.targetFund > 0 ? `${result.readinessScore}%` : 'Chưa có nhu cầu chi tiêu'}</strong></div><div className="mk-readiness-track" aria-hidden="true"><span style={{ width: `${Math.min(100, result.readinessScore)}%` }} /></div><p>{result.gap > 0 ? 'Còn thiếu khoảng' : 'Vượt mục tiêu khoảng'} <b>{compactMoney(Math.abs(result.gap))}</b> tại tuổi nghỉ hưu. Thử điều chỉnh tuổi nghỉ, khoản góp hoặc mức sống.</p><small>Tỷ lệ đáp ứng quỹ không phải xác suất thành công.</small></div>
                      {/* Post-retirement duration & depletion alert (FE-23) */}
          <div className="mk-sim-post-section" aria-label="Giai đoạn sau nghỉ hưu">
            <div className="mk-sim-post-header">
              <Icon name="compass" />
              <strong>Thời gian hưởng hưu: {result.retirementYears} năm ({result.retirementYears * 12} tháng)</strong>
            </div>
            <p className="mk-sim-post-period">
              Dự trù từ tuổi {input.retirementAge} đến tuổi {input.lifeExpectancy} với mức chi {currency(result.futureMonthlyExpense)}/tháng (đã tính lạm phát).
            </p>
            <div className={`mk-sim-status-box ${postRetirementAnalysis.depleted ? 'is-warning' : 'is-success'}`}>
              <Icon name={postRetirementAnalysis.depleted ? 'alert' : 'circle-check'} />
              <p>{postRetirementAnalysis.message}</p>
            </div>
            <p className="mk-sim-disclaimer-small">
              <em>Lưu ý quan trọng:</em> Mốc tuổi kết thúc kế hoạch ({input.lifeExpectancy} tuổi) là giả định dự trù tài chính, không phải dự đoán tuổi thọ cá nhân. Việc quỹ không thiếu trong kỳ dự trù không đồng nghĩa đủ vĩnh viễn sau tuổi này.
            </p>
          </div>

          {/* Simulation Scope & Limitations placed directly under results (FE-25) */}
          <details className="mk-sim-scope-card">
            <summary className="mk-sim-scope-title">
              <Icon name="info" />
              <strong>Phạm vi và giới hạn của mô phỏng</strong><Icon name="plus" />
            </summary>
            <div className="mk-sim-scope-grid">
              <div className="mk-sim-scope-col">
                <span className="mk-scope-pill is-included">Đã bao gồm trong phép tính</span>
                <ul>
                  <li>Tài sản có thể dùng hưu trí đầu kỳ</li>
                  <li>Tích lũy hàng tháng và lãi kép dự kiến</li>
                  <li>Lạm phát chi tiêu lũy kế theo từng năm</li>
                </ul>
              </div>
              <div className="mk-sim-scope-col">
                <span className="mk-scope-pill is-excluded">Chưa bao gồm trong demo</span>
                <ul>
                  <li>Lương hưu BHXH chính thức (cần số năm đóng)</li>
                  <li>Thuế, phí quản lý quỹ và nghĩa vụ trả nợ</li>
                  <li>Biến động thị trường bất thường theo chu kỳ</li>
                </ul>
              </div>
            </div>
          </details>


          </div>
          <section className="mk-scenario-section" id="kich-ban" aria-labelledby="scenario-title">
            <div className="mk-presets-heading"><h2 id="scenario-title">Thử một lựa chọn khác</h2><span>So với số liệu đang nhập</span></div>
            <div className="mk-preset-grid">
              <article className="mk-preset-current"><span className="mk-preset-label"><Icon name="circle-check" /> Kế hoạch hiện tại</span><p>Nghỉ {input.retirementAge} tuổi · chi {compactMoney(input.monthlyExpenseToday)}/tháng</p><strong>{compactMoney(result.projectedFund)}</strong><small>Quỹ dự kiến khi nghỉ hưu</small></article>
              {comparisons.slice(0, 2).map(scenario => {
                const compared = calculateRetirement(scenario.input);
                return <button type="button" className="mk-preset" key={scenario.name} aria-label={`Thử: ${scenario.name}`} disabled={scenario.disabled} onClick={() => { setInput(scenario.input); setAppliedScenario(scenario.name); setAllocationApplied(false); }}><span className="mk-preset-label">{scenario.name}<Icon name="arrow-right" /></span><p>Nghỉ {scenario.input.retirementAge} tuổi · chi {compactMoney(scenario.input.monthlyExpenseToday)}/tháng</p><strong>{compactMoney(compared.projectedFund)}</strong><small>{compared.gap > 0 ? 'Còn thiếu' : 'Vượt mục tiêu'} {compactMoney(Math.abs(compared.gap))}</small></button>;
              })}
            </div>
            <p className="mk-preset-help">Mỗi lần chọn áp dụng thay đổi vào số liệu hiện tại. “Đặt lại” đưa về mẫu ban đầu.</p>
          </section>
        </div>

        <aside className="mk-sim-sidebar" aria-label="Thông số mô phỏng">
          <div className="mk-tuning-card">
            <div className="mk-sim-title"><h2>Tự xây kịch bản của bạn</h2><button type="button" onClick={handleReset}>Đặt lại</button></div>
            <p className="mk-tuning-subtitle">Thay đổi để thấy tác động ngay.</p>
            {appliedScenario && <p className="mk-applied-scenario" role="status"><Icon name="circle-check" /> Đang áp dụng: {appliedScenario}</p>}
            <SimFieldInput
            id="sim-retirementAge"
            label="Tuổi nghỉ hưu"
            value={input.retirementAge}
            min={input.currentAge}
            max={75}
            step={1}
            unit="tuổi"
            onChange={v => update('retirementAge', v)}
          />
            <SimFieldInput
            id="sim-monthlyExpenseToday"
            sliderMax={70000000}
            label="Chi tiêu mỗi tháng theo giá hôm nay"
            value={input.monthlyExpenseToday}
            min={0}
            max={500000000}
            step={500000}
            unit="VND"
            isCurrency
            onChange={v => update('monthlyExpenseToday', v)}
          />
            <SimFieldInput
            id="sim-monthlyContribution"
            sliderMax={50000000}
            label="Tích lũy mỗi tháng"
            value={input.monthlyContribution}
            min={0}
            max={500000000}
            step={500000}
            unit="VND"
            isCurrency
            onChange={v => update('monthlyContribution', v)}
          />
            <details id="sim-advanced" className="mk-advanced-inputs" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
              <summary><Icon name="settings" /> Thông tin & giả định khác<Icon name="plus" /></summary>
              <SimFieldInput
            id="sim-currentAge"
            label="Tuổi hiện tại"
            value={input.currentAge}
            min={18}
            max={74}
            step={1}
            unit="tuổi"
            onChange={v => update('currentAge', v)}
          />
              <SimFieldInput
            id="sim-cashSavings"
            label="Tài sản ban đầu"
            value={input.cashSavings}
            min={0}
            max={50000000000}
            step={10000000}
            unit="VND"
            isCurrency
            onChange={v => update('cashSavings', v)}
          />
              <p className="mk-input-hint">Vốn dành cho hưu trí, không gồm nhà đang ở, quỹ dự phòng và tiền cho mục tiêu gần hạn.</p>
              <SimFieldInput
            id="sim-lifeExpectancy"
            label="Dự trù chi tiêu đến tuổi"
            value={input.lifeExpectancy}
            min={input.retirementAge + 1}
            max={110}
            step={1}
            unit="tuổi"
            onChange={v => update('lifeExpectancy', v)}
          />
              <SimFieldInput
            id="sim-annualReturnRate"
            label="Lợi suất giả định mỗi năm"
            value={input.annualReturnRate}
            min={0}
            max={30}
            step={0.01}
            unit="%"
            onChange={v => update('annualReturnRate', v)}
          />
              <SimFieldInput
            id="sim-annualInflationRate"
            label="Lạm phát giả định mỗi năm"
            value={input.annualInflationRate}
            min={0}
            max={20}
            step={0.5}
            unit="%"
            onChange={v => update('annualInflationRate', v)}
          />
            </details>
            <p className="mk-tuning-note">Kéo thanh trượt hoặc nhập số rồi nhấn Enter. Khoản góp cần phù hợp với thu nhập còn dư của bạn.</p>
            <MarketingButton to="/register" onClick={() => saveSimulatorPrefill({ currentAge: input.currentAge, retirementAge: input.retirementAge, monthlyExpenseToday: input.monthlyExpenseToday })}>Lập kế hoạch của riêng bạn</MarketingButton>
            <div className="mk-stress-tests"><span>Thử thêm tình huống bất lợi</span>{comparisons.slice(2).map(scenario => <button type="button" key={scenario.name} aria-label={`Thử: ${scenario.name}`} disabled={scenario.disabled} onClick={() => { setInput(scenario.input); setAppliedScenario(scenario.name); setAllocationApplied(false); }}><Icon name="plus" />{scenario.name}</button>)}</div>
          </div>
                    <div className="mk-sim-post-section mk-next-step" aria-label="Bước tiếp theo">
            <h2 className="mk-sim-post-header"><Icon name="sparkles" /> Bước nhỏ từ tháng này</h2>
            <p className="mk-sim-post-period" data-testid="next-action">
              {requiredContribution === null
                ? result.gap > 0 ? `Bạn đã chọn nghỉ hưu ngay. Cần cân đối thêm ${currency(result.gap)} vốn hoặc thử giảm mức chi; không còn thời gian góp trước hưu.` : 'Bạn đã chọn nghỉ hưu ngay. Rà soát lịch rút tiền và các nguồn thu sau nghỉ hưu.'
                : result.gap > 0 ? `Để đạt mục tiêu theo mô hình, cần góp khoảng ${currency(requiredContribution)}/tháng, thêm ${currency(Math.max(0, requiredContribution - input.monthlyContribution))} so với hiện tại.` : 'Khoản góp hiện tại đáp ứng mục tiêu theo các giả định đã chọn. Thử tình huống bất lợi và rà soát lại khi cuộc sống thay đổi.'}
            </p>
            <p className="mk-sim-disclaimer-small">Demo chưa kiểm tra thu nhập còn dư. Đối chiếu khoản góp với ngân sách sau sinh hoạt, trả nợ và dự phòng.</p>
            {requiredContribution !== null && result.gap > 0 && requiredContribution <= inputBounds.monthlyContribution[1] && <button className="mk-scenario-reset" type="button" onClick={() => update('monthlyContribution', requiredContribution)}>Thử khoản góp này</button>}
          </div>


        </aside>
      </section>

      <section className="mk-container mk-allocation-section" id="phan-bo" aria-labelledby="allocation-title"><span className="mk-eyebrow">03 / HIỂU TÀI SẢN CỦA BẠN</span>
        <h2 id="allocation-title">Năm nhóm tài sản, mỗi nhóm một vai trò</h2>
        <p>Thử phân bổ phần vốn dành cho hưu trí. Các tỷ trọng và mức sinh lời dưới đây chỉ là số liệu minh họa để hiểu phép tính, không phải đề xuất danh mục hay dữ liệu thị trường.</p>
        <div className="mk-allocation-workspace"><div className="mk-allocation-assets">
        {allocation.map((asset, index) => <details key={asset.name}>
          <summary><span className={`mk-asset-dot mk-asset-${index}`} /><span>{asset.name}</span><b>{asset.weight}%</b><Icon name="plus" /></summary>
          <p>{asset.description}</p>
          <SimFieldInput id={`allocation-weight-${index}`} label={`Tỷ trọng ${asset.name}`} value={asset.weight} min={0} max={100} step={1} unit="%" onChange={weight => { setAllocation(current => current.map((item, i) => i === index ? { ...item, weight } : item)); setAllocationApplied(false); }} />
          <SimFieldInput id={`allocation-rate-${index}`} label={`Lợi suất giả định ${asset.name}`} value={asset.rate} min={0} max={30} step={.5} unit="%/năm" onChange={rate => { setAllocation(current => current.map((item, i) => i === index ? { ...item, rate } : item)); setAllocationApplied(false); }} />
          <p>Đóng góp vào lợi suất danh mục: {asset.weight}% × {asset.rate}% = {(asset.weight * asset.rate / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm %/năm.</p>
        </details>)}
        <details><summary>Bất động sản<Icon name="plus" /></summary><p>Nhà đang ở và bất động sản trực tiếp được theo dõi riêng, không cộng vào quỹ có thể rút trong demo. Tiền thuê ròng, thời điểm bán và chi phí cần được khai riêng trong kế hoạch đầy đủ.</p></details>
        </div><aside className="mk-allocation-summary">
          <span className="mk-eyebrow">DANH MỤC BẠN ĐANG THỬ</span>
          <div className="mk-allocation-rate"><strong>{validAllocation ? weightedReturn.toLocaleString('vi-VN') : '—'}<small>%</small></strong><span>Lợi suất bình quân / năm</span></div>
          <div className="mk-allocation-bar" aria-hidden="true">{allocation.map((asset, i) => <span key={asset.name} className={`mk-asset-${i}`} style={{ flex: asset.weight }} />)}</div>
          <ul className="mk-allocation-legend">{allocation.map((asset, i) => <li key={asset.name}><i className={`mk-asset-${i}`} /><span>{asset.name}</span><b>{asset.weight}%</b></li>)}</ul>
          <p role="status">Tổng tỷ trọng: {totalWeight.toLocaleString('vi-VN')}%. {validAllocation ? `Lợi suất bình quân minh họa: ${weightedReturn.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%/năm.` : 'Điều chỉnh tổng về 100% để áp dụng; demo vẫn giữ lợi suất trước đó.'}</p>
          <p className="mk-sim-post-period">Lợi suất bình quân = tổng (tỷ trọng × lợi suất từng nhóm). Chưa tính phí, thuế hay mức biến động; cùng một lợi suất bình quân không đồng nghĩa cùng mức rủi ro.</p>
          <button type="button" className="mk-scenario-reset" disabled={!validAllocation} onClick={() => { update('annualReturnRate', weightedReturn); setAllocationApplied(true); }}>Áp dụng lợi suất vào demo</button>
          {allocationApplied && <p role="status">Đã áp dụng {weightedReturn.toLocaleString('vi-VN')}%/năm vào kết quả phía trên.</p>}
        </aside></div>
      </section>

      <section className="mk-container mk-assumptions">
        <h2>Hiểu các giả định phía sau kết quả</h2>
        <p>
          Đây là mô hình minh họa với lợi suất và lạm phát cố định, khoản tích lũy được góp vào cuối mỗi tháng. Chưa tính lương hưu BHXH, thuế, phí, nợ hoặc biến động thị trường. Tài sản ban đầu được xem là toàn bộ phần có thể dùng cho hưu trí.
        </p>
        <p>
          Giai đoạn nghỉ hưu dùng cùng mức lợi suất giả định khai báo để tính toán dòng tiền rút dần bù đắp chi tiêu. Chi tiêu tăng theo lạm phát cho đến tuổi dự trù. Đây là giả định toán học của công cụ, không phải mức lợi suất được đảm bảo.
        </p>
      </section>
    </div></MarketingLayout>
  );
}
