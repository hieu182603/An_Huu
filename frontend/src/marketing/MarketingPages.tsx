export { ArticleCards, KnowledgePage, ArticlePage } from "./PublicContent";
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
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

function parseScenarioInput(searchParams: URLSearchParams): { input: RetirementCalculationInput; scenarioName: string | null } {
  const currentAgeParam = searchParams.get('currentAge');
  const retirementAgeParam = searchParams.get('retirementAge');
  const lifeExpectancyParam = searchParams.get('lifeExpectancy');
  const cashSavingsParam = searchParams.get('cashSavings');
  const monthlyExpenseParam = searchParams.get('monthlyExpenseToday');
  const monthlyContribParam = searchParams.get('monthlyContribution');
  const returnRateParam = searchParams.get('annualReturnRate');
  const inflationParam = searchParams.get('annualInflationRate');
  const scenarioName = searchParams.get('scenarioName');

  if (!currentAgeParam && !retirementAgeParam && !monthlyContribParam && !scenarioName) {
    return { input: defaultInput, scenarioName: null };
  }

  const custom: RetirementCalculationInput = { ...defaultInput };
  if (currentAgeParam) custom.currentAge = Math.max(18, Math.min(74, Number(currentAgeParam) || defaultInput.currentAge));
  if (retirementAgeParam) custom.retirementAge = Math.max(custom.currentAge, Math.min(75, Number(retirementAgeParam) || defaultInput.retirementAge));
  if (lifeExpectancyParam) custom.lifeExpectancy = Math.max(custom.retirementAge + 1, Math.min(110, Number(lifeExpectancyParam) || defaultInput.lifeExpectancy));
  if (cashSavingsParam !== null) custom.cashSavings = Math.max(0, Number(cashSavingsParam) || 0);
  if (monthlyExpenseParam !== null) custom.monthlyExpenseToday = Math.max(0, Number(monthlyExpenseParam) || 0);
  if (monthlyContribParam !== null) custom.monthlyContribution = Math.max(0, Number(monthlyContribParam) || 0);
  if (returnRateParam !== null) custom.annualReturnRate = Math.max(0, Math.min(30, Number(returnRateParam) || 0));
  if (inflationParam !== null) custom.annualInflationRate = Math.max(0, Math.min(20, Number(inflationParam) || 0));

  return { input: custom, scenarioName: scenarioName || 'Kịch bản đề xuất' };
}

function SimFieldInput({
  id,
  label,
  value,
  min,
  max,
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
    const raw = e.target.value;
    setTextValue(raw);
    if (isCurrency) {
      const digits = raw.replace(/\D/g, '');
      if (digits === '') {
        onChange(0);
      } else {
        const num = Number(digits);
        if (Number.isFinite(num)) {
          onChange(num);
        }
      }
    } else {
      const num = Number(raw);
      if (Number.isFinite(num)) {
        onChange(num);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setTextValue(formatDisplay(value));
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
            aria-label={`Nhập giá trị cho ${label}`}
          />
          <span className="mk-field-unit">{unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={event => onChange(Number(event.target.value))}
        aria-valuetext={`${value} ${unit}`}
      />
    </div>
  );
}

export function SimulationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialData = useMemo(() => parseScenarioInput(searchParams), [searchParams]);
  const [input, setInput] = useState<RetirementCalculationInput>(initialData.input);
  const [appliedScenario, setAppliedScenario] = useState<string | null>(initialData.scenarioName);

  // Sync if URL search params change (e.g. back/forward navigation)
  useEffect(() => {
    const parsed = parseScenarioInput(searchParams);
    setInput(parsed.input);
    setAppliedScenario(parsed.scenarioName);
  }, [searchParams]);

  const result = calculateRetirement(input);

  const update = (key: keyof RetirementCalculationInput, value: number) => setInput(current => {
    const next = { ...current, [key]: value };
    // Allow retirement age to equal current age (FE-01)
    next.retirementAge = Math.max(next.currentAge, next.retirementAge);
    next.lifeExpectancy = Math.max(next.retirementAge + 1, next.lifeExpectancy);
    return next;
  });

  const handleReset = () => {
    setInput(defaultInput);
    setAppliedScenario(null);
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

  // Chart calculation covering entire span from currentAge through lifeExpectancy (FE-23)
  const totalSpan = Math.max(1, input.lifeExpectancy - input.currentAge);
  const years = Array.from({ length: 7 }, (_, index) => Math.round(input.currentAge + (totalSpan * index / 6)));
  const balances = years.map(age => projectBalanceAtAge(input, age));
  const max = Math.max(1, ...balances, result.targetFund);
  const points = balances.map((balance, index) => `${index * 100},${180 - balance / max * 150}`).join(' ');

  return (
    <MarketingLayout>
      <PageIntro eyebrow="MÔ PHỎNG HƯU TRÍ" title="Thử hôm nay. Hiểu thêm về ngày mai.">
        Thay đổi một giả định, nhìn thấy một khả năng. Không cần đăng nhập, không lưu thông tin cá nhân.
      </PageIntro>

      <section className="mk-container mk-simulator">
        <div className="mk-sim-inputs">
          <div className="mk-sim-title">
            <h2>Kịch bản của bạn</h2>
            <button type="button" onClick={handleReset}>Đặt lại</button>
          </div>

          {appliedScenario && (
            <div className="mk-scenario-banner" role="status">
              <div className="mk-scenario-banner-text">
                <Icon name="sparkles" />
                <span>Đang áp dụng: <strong>{appliedScenario}</strong></span>
              </div>
              <button type="button" className="mk-scenario-reset" onClick={handleReset}>
                Khôi phục mặc định
              </button>
            </div>
          )}

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
            id="sim-lifeExpectancy"
            label="Dự trù chi tiêu đến tuổi"
            value={input.lifeExpectancy}
            min={input.retirementAge + 1}
            max={100}
            step={1}
            unit="tuổi"
            onChange={v => update('lifeExpectancy', v)}
          />

          <SimFieldInput
            id="sim-cashSavings"
            label="Tài sản ban đầu"
            value={input.cashSavings}
            min={0}
            max={5000000000}
            step={10000000}
            unit="VND"
            isCurrency
            onChange={v => update('cashSavings', v)}
          />

          <SimFieldInput
            id="sim-monthlyExpenseToday"
            label="Chi tiêu mỗi tháng theo giá hôm nay"
            value={input.monthlyExpenseToday}
            min={0}
            max={60000000}
            step={500000}
            unit="VND"
            isCurrency
            onChange={v => update('monthlyExpenseToday', v)}
          />

          <SimFieldInput
            id="sim-monthlyContribution"
            label="Tích lũy mỗi tháng"
            value={input.monthlyContribution}
            min={0}
            max={50000000}
            step={500000}
            unit="VND"
            isCurrency
            onChange={v => update('monthlyContribution', v)}
          />

          <SimFieldInput
            id="sim-annualReturnRate"
            label="Lợi suất giả định mỗi năm"
            value={input.annualReturnRate}
            min={0}
            max={15}
            step={0.5}
            unit="%"
            onChange={v => update('annualReturnRate', v)}
          />

          <SimFieldInput
            id="sim-annualInflationRate"
            label="Lạm phát giả định mỗi năm"
            value={input.annualInflationRate}
            min={0}
            max={10}
            step={0.5}
            unit="%"
            onChange={v => update('annualInflationRate', v)}
          />
        </div>

        <div className="mk-sim-output">
          <span className="mk-eyebrow">
            {result.yearsToRetirement > 0 ? `SAU ${result.yearsToRetirement} NĂM TÍCH LŨY` : 'NGHỈ HƯU TẠI TUỔI HIỆN TẠI'}
          </span>

          <div className="mk-sim-results" aria-live="polite" aria-atomic="true">
            <p>Quỹ dự kiến ở tuổi {input.retirementAge}</p>
            <strong data-testid="projected-fund">{currency(result.projectedFund)}</strong>
            <dl>
              <div>
                <dt>Quỹ mục tiêu ước tính</dt>
                <dd>{currency(result.targetFund)}</dd>
              </div>
              <div>
                <dt>{result.gap > 0 ? 'Khoảng thiếu hụt ước tính' : 'Phần vượt mục tiêu ước tính'}</dt>
                <dd>{currency(Math.abs(result.gap))}</dd>
              </div>
              <div>
                <dt>Chi tiêu mỗi tháng khi nghỉ hưu</dt>
                <dd>{currency(result.futureMonthlyExpense)}</dd>
              </div>
            </dl>
          </div>

          <div className="mk-sim-chart">
            <svg viewBox="0 0 600 205" role="img" aria-label="Biểu đồ quỹ tích lũy dự kiến theo thời gian">
              <line x1="0" y1="180" x2="600" y2="180" stroke="#cbdde9" />
              <polyline points={`0,180 ${points} 600,180`} fill="#e3f4f2" stroke="none" />
              <polyline points={points} fill="none" stroke="#008a75" strokeWidth="4" strokeLinejoin="round" />
              <line x1="0" y1={180 - result.targetFund / max * 150} x2="600" y2={180 - result.targetFund / max * 150} stroke="#10385b" strokeDasharray="6 6" strokeWidth="2" />
            </svg>
            <div className="mk-chart-labels">
              <span>{input.currentAge} tuổi</span>
              <span>Hưu: {input.retirementAge} tuổi</span>
              <span>{input.lifeExpectancy} tuổi</span>
            </div>
            <div className="mk-chart-legend">
              <span><i />Quỹ dự kiến</span>
              <span><i />Quỹ mục tiêu</span>
            </div>
          </div>

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
          <div className="mk-sim-scope-card">
            <div className="mk-sim-scope-title">
              <Icon name="info" />
              <strong>Phạm vi và giới hạn của mô phỏng công khai</strong>
            </div>
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
                <span className="mk-scope-pill is-excluded">Chưa bao gồm (cần tạo tài khoản)</span>
                <ul>
                  <li>Lương hưu BHXH chính thức (cần số năm đóng)</li>
                  <li>Thuế, phí quản lý quỹ và nghĩa vụ trả nợ</li>
                  <li>Biến động thị trường bất thường theo chu kỳ</li>
                </ul>
              </div>
            </div>
          </div>

          <MarketingButton>Lập kế hoạch của riêng bạn</MarketingButton>
        </div>
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
    </MarketingLayout>
  );
}
