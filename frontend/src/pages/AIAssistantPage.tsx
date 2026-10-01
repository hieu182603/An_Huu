import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { calculateRetirement, inputFromProfile } from "../domain/retirementCalculator";

type ToolItem = {
  type: "edit" | "command" | "images" | "time";
  label: string;
  details?: string;
  images?: { title: string; subtitle: string; tag: string }[];
};

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  time: string;
  tools?: ToolItem[];
  metric?: { label: string; value: string; detail: string; deltaType?: "neutral" | "warning" | "positive" };
  hasChart?: boolean;
};

export default function AIAssistantPage() {
  const navigate = useNavigate();
  const { profile } = useFinancialProfile();
  const calculation = calculateRetirement(inputFromProfile(profile));
  const [inputPrompt, setInputPrompt] = useState("");
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1024);
  const [modelMode, setModelMode] = useState<string>("Minh họa theo hồ sơ");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);

  const initialMessage: Message = {
    id: "m-init-assistant",
    sender: "assistant",
    text: "Xin chào! Tôi là trợ lý minh họa của An Hưu. Tôi có thể giải thích các con số đang có trong hồ sơ demo và gợi ý nơi bạn nên điều chỉnh. Phản hồi hiện chưa được tạo bởi dịch vụ AI trực tuyến và không tự thay đổi kế hoạch của bạn.",
    time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
  };
  const [messages, setMessages] = useState<Message[]>([initialMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTyping]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputPrompt).trim();
    if (!text) return;

    const version = ++requestVersion.current;
    const userMsg: Message = {
      id: `m-${Date.now()}`,
      sender: "user",
      text,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt("");
    setIsTyping(true);

    setTimeout(() => {
      if (requestVersion.current !== version) return;
      const format = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
      let aiText = `Theo hồ sơ demo hiện tại, quỹ dự phóng ở tuổi ${profile.goal.targetRetireAge} là ${format(calculation.projectedFund)}, so với mục tiêu ${format(calculation.targetFund)}. Đây là phản hồi minh họa từ bộ quy tắc cục bộ, chưa phải tư vấn của chuyên gia hoặc AI trực tuyến.`;
      let metric: Message["metric"] | undefined = undefined;
      const lower = text.toLowerCase();

      if (lower.includes("bhxh") || lower.includes("bảo hiểm xã hội") || lower.includes("lương hưu")) {
        aiText = `Bộ tính demo ước tính lương hưu ${format(calculation.estimatedMonthlyPension)}/tháng tại thời điểm nghỉ hưu, dựa trên ${profile.socialSecurity.socialInsuranceYears} năm đã đóng và giả định tiếp tục tham gia. Con số này chỉ phục vụ mô phỏng; quyền lợi thực tế cần được xác nhận với cơ quan BHXH.`;
        metric = {
          label: "Lương hưu ước tính trong mô hình demo",
          value: format(calculation.estimatedMonthlyPension),
          detail: "Không phải kết quả tính quyền lợi BHXH chính thức.",
          deltaType: "positive",
        };
      } else if (lower.includes("lạm phát") || lower.includes("giá cả") || lower.includes("sức mua")) {
        aiText = `Với giả định lạm phát ${profile.goal.inflationRate}%/năm, mức chi tiêu ${format(profile.goal.monthlyExpenseInRetirement)} theo giá hiện tại tương đương khoảng ${format(calculation.futureMonthlyExpense)}/tháng ở tuổi ${profile.goal.targetRetireAge}. Bạn có thể đổi giả định tại trang Mục tiêu rồi lưu để tính lại.`;
        metric = {
          label: "Chi tiêu tháng tại thời điểm nghỉ hưu",
          value: format(calculation.futureMonthlyExpense),
          detail: `Sau ${calculation.yearsToRetirement} năm với lạm phát ${profile.goal.inflationRate}%/năm.`,
          deltaType: "neutral",
        };
      } else if (calculation.gap > 0) {
        aiText = `Kế hoạch demo hiện còn thiếu ${format(calculation.gap)} tại thời điểm nghỉ hưu. Bạn nên dùng trang Mô phỏng để thử tăng tích lũy, nghỉ muộn hơn hoặc điều chỉnh mức chi tiêu. Hội thoại này không tự áp dụng thay đổi.`;
        metric = {
          label: "Khoảng thiếu theo mô hình demo",
          value: format(calculation.gap),
          detail: "Mở trang Mô phỏng để thử kịch bản và xác nhận riêng trước khi áp dụng.",
          deltaType: "warning",
        };
      }

      const aiMsg: Message = {
        id: `m-${Date.now() + 1}`,
        sender: "assistant",
        text: aiText,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        metric,
        hasChart: false,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 600);
  };

  return (
    <div className="codex-work-workspace">
      {/* Top Header Bar */}
      <header className="codex-topbar">
        <div className="codex-title-wrap">
          <span className="codex-folder-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </span>
          <h1>
            Trợ lý tài chính
            <span className="codex-title-sub"> · Chế độ minh họa</span>
          </h1>
          <span className="codex-status-pill">
            <span className="codex-pulse" />
            Không kết nối AI trực tuyến
          </span>
        </div>

        <div className="codex-actions-wrap">
          <button
            type="button"
            className="codex-icon-btn"
            title="Tùy chọn khác"
            aria-label="Tùy chọn khác"
            onClick={() => handleSend("Tóm tắt lại tình trạng tài chính hiện tại của tôi.")}
          >
            <span>···</span>
          </button>

          <button
            type="button"
            className={`codex-icon-btn ${railOpen ? "is-active" : ""}`}
            title="Bật/tắt thanh Outputs & Sources"
            aria-label="Bật/tắt thanh Outputs & Sources"
            onClick={() => setRailOpen(!railOpen)}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>

          <button
            type="button"
            className="codex-icon-btn"
            title="Làm mới cuộc trò chuyện"
            aria-label="Làm mới cuộc trò chuyện"
            onClick={() => {
              requestVersion.current++;
              setIsTyping(false);
              setMessages([initialMessage]);
            }}
          >
            <Icon name="trash" size="small" />
          </button>
        </div>
      </header>

      {/* Main Container: Chat Feed + Right Docked Rail */}
      <div className="codex-body-layout">
        {/* Chat Feed */}
        <div className="codex-chat-container">
          <div className="conversation-scroll" ref={scrollRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`codex-turn ${msg.sender}`}>
                {/* Tool execution logs */}
                {msg.tools && msg.tools.map((t, idx) => (
                  <div key={idx} className="codex-tool-log">
                    {t.type === "edit" && (
                      <div className="tool-row">
                        <span className="tool-icon">✎</span>
                        <span className="tool-text">{t.label}</span>
                      </div>
                    )}

                    {t.type === "command" && (
                      <div className="tool-row">
                        <span className="tool-icon cmd">⊡</span>
                        <span className="tool-text">{t.label}</span>
                      </div>
                    )}

                    {t.type === "images" && (
                      <div className="tool-images-block">
                        <div className="tool-row">
                          <span className="tool-icon">◫</span>
                          <span className="tool-text">{t.label} ▾</span>
                        </div>
                        {t.images && (
                          <div className="tool-images-grid">
                            {t.images.map((img, imgIdx) => (
                              <div key={imgIdx} className="scenario-thumb-card">
                                <div className="thumb-header">
                                  <strong>{img.title}</strong>
                                  <span className="thumb-tag">{img.tag}</span>
                                </div>
                                <div className="thumb-preview">
                                  <div className="mini-phone-header">
                                    <span className="pill-dot" />
                                    <span className="pill-line" />
                                  </div>
                                  <div className="mini-phone-body">
                                    <div className="mini-card-row" />
                                    <div className="mini-card-row short" />
                                  </div>
                                </div>
                                <small>{img.subtitle}</small>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {t.type === "time" && (
                      <div className="tool-time-row">
                        <span>{t.label}</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Message Body */}
                <div className="codex-message-prose">
                  {msg.text.split("\n\n").map((para, pIdx) => (
                    <p key={pIdx}>{para}</p>
                  ))}
                </div>

                {/* Optional Highlight Metric */}
                {msg.metric && (
                  <div className={`codex-metric-card ${msg.metric.deltaType || "neutral"}`}>
                    <div className="metric-top">
                      <span>{msg.metric.label}</span>
                      <span className="metric-pill">Ước tính demo</span>
                    </div>
                    <strong>{msg.metric.value}</strong>
                    <small>{msg.metric.detail}</small>
                  </div>
                )}

                {/* Optional Interactive Curve Chart */}
                {msg.hasChart && (
                  <div className="codex-chart-card">
                    <div className="chart-top">
                      <div>
                        <h4>Đường cong tích lũy tài sản hưu trí (Mô phỏng lãi kép 7.8%/năm)</h4>
                        <p>So sánh lộ trình mục tiêu tuổi 60 và kịch bản tuổi 58</p>
                      </div>
                      <span className="chart-badge">LIVE SIMULATION</span>
                    </div>

                    <div className="chart-svg-wrap">
                      <svg viewBox="0 0 540 180" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="codexGreenGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="30" x2="540" y2="30" className="chart-grid-line" />
                        <line x1="0" y1="80" x2="540" y2="80" className="chart-grid-line" />
                        <line x1="0" y1="130" x2="540" y2="130" className="chart-grid-line" />

                        <path d="M 20 160 C 160 150, 320 110, 510 50 L 510 160 Z" fill="url(#codexGreenGlow)" />
                        <path d="M 20 160 C 160 150, 320 110, 510 50" className="chart-base-line" />
                        <path d="M 20 160 C 140 135, 290 80, 460 25" className="chart-sim-line" />

                        <circle cx="20" cy="160" r="4" className="chart-dot" />
                        <circle cx="220" cy="135" r="4" className="chart-dot" />
                        <circle cx="460" cy="25" r="5" className="chart-sim-dot" />
                        <circle cx="510" cy="50" r="5" className="chart-base-dot" />

                        <text x="460" y="16" textAnchor="middle" className="chart-tag-text">Tuổi 58</text>
                        <text x="510" y="42" textAnchor="middle" className="chart-tag-text">Tuổi 60</text>
                      </svg>
                    </div>

                    <div className="chart-legends-row">
                      <span><i className="dot green" /> Kế hoạch hiện tại: {new Intl.NumberFormat("vi-VN").format(profile.plan.monthlySavings)} đ/tháng</span>
                      <span><i className="dot blue" /> Mục tiêu tuổi {profile.goal.targetRetireAge}: {new Intl.NumberFormat("vi-VN").format(calculation.targetFund)} đ</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="codex-turn assistant typing">
                <div className="tool-row">
                  <span className="tool-icon">✎</span>
                  <span className="tool-text">Đang chuẩn bị phản hồi minh họa từ hồ sơ đã lưu...</span>
                </div>
                <div className="typing-pulse-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {/* Informational Limit / Sync Divider */}
            <div className="codex-sync-divider">
              <span className="sync-line" />
              <span className="sync-label">
                ⓘ Dữ liệu đang đọc từ hồ sơ {profile.personal.name} ({profile.personal.age} tuổi, mục tiêu nghỉ hưu ở tuổi {profile.goal.targetRetireAge})
              </span>
              <span className="sync-line" />
            </div>

            {/* Financial Status Summary Card (matches layout of usage card in screenshot) */}
            <div className="codex-status-card">
              <div className="status-copy">
                <strong>Mục tiêu hưu trí: {new Intl.NumberFormat("vi-VN").format(calculation.targetFund)} đ (đạt {calculation.readinessScore}%)</strong>
                <p>{calculation.gap > 0 ? `Kế hoạch còn thiếu ${new Intl.NumberFormat("vi-VN").format(calculation.gap)} đ theo các giả định hiện tại.` : `Kế hoạch đang vượt mục tiêu ${new Intl.NumberFormat("vi-VN").format(Math.abs(calculation.gap))} đ theo các giả định hiện tại.`}</p>
              </div>
              <div className="status-actions">
                <button
                  type="button"
                  className="btn-ghost-dark"
                  onClick={() => navigate("/user/goal")}
                >
                  Điều chỉnh mục tiêu
                </button>
                <button
                  type="button"
                  className="btn-primary-dark"
                  onClick={() => navigate("/user/simulation")}
                >
                  ✦ Mở mô phỏng
                </button>
              </div>
            </div>

            {/* Quick Prompt Suggestions to fill empty frame */}
            {messages.length <= 1 && (
              <div className="codex-suggestions-block">
                <div className="suggestions-header">
                  <Icon name="sparkles" size="small" />
                  <span>GỢI Ý CÂU HỎI THƯỜNG GẶP</span>
                </div>
                <div className="suggestions-grid">
                  <button
                    type="button"
                    className="suggestion-chip"
                    onClick={() => handleSend("Ước tính lương hưu BHXH của tôi khi về hưu là bao nhiêu?")}
                  >
                    <span className="chip-icon">🛡️</span>
                    <div>
                      <strong>Lương hưu BHXH ước tính</strong>
                      <p>Dựa trên {profile.socialSecurity.socialInsuranceYears} năm đóng BHXH trong hồ sơ</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="suggestion-chip"
                    onClick={() => handleSend("Lạm phát 4% ảnh hưởng thế nào đến sức mua khi tôi nghỉ hưu?")}
                  >
                    <span className="chip-icon">📈</span>
                    <div>
                      <strong>Tác động của lạm phát</strong>
                      <p>Quy đổi chi tiêu {new Intl.NumberFormat("vi-VN").format(profile.goal.monthlyExpenseInRetirement)} đ sang giá tương lai</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="suggestion-chip"
                    onClick={() => handleSend("Làm thế nào để bù đắp khoảng thiếu hụt quỹ hưu trí?")}
                  >
                    <span className="chip-icon">🎯</span>
                    <div>
                      <strong>Bù đắp khoảng thiếu hụt</strong>
                      <p>Phương án tăng tích lũy hoặc điều chỉnh mốc tuổi hưu</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="suggestion-chip"
                    onClick={() => handleSend("Gợi ý cho tôi 3 bước tối ưu tài chính quan trọng nhất trong tháng này.")}
                  >
                    <span className="chip-icon">💡</span>
                    <div>
                      <strong>Tối ưu hóa tích lũy tháng</strong>
                      <p>3 gợi ý minh họa dựa trên hồ sơ đang lưu</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Floating Composer */}
          <div className="codex-composer-wrapper">
            <div className="codex-composer-card">
              <textarea
                aria-label="Câu hỏi dành cho trợ lý AI"
                placeholder="Hỏi An Hưu AI về kế hoạch hưu trí, BHXH, tích lũy..."
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
              />

              <div className="composer-bottom-bar">
                <div className="composer-left-actions">
                  <button
                    type="button"
                    className="composer-circle-btn"
                    title="Gợi ý câu hỏi"
                    onClick={() => handleSend("Gợi ý cho tôi 3 bước tối ưu tài chính quan trọng nhất trong tháng này.")}
                  >
                    +
                  </button>

                  <div className="composer-shield-badge">
                    <span className="shield-icon">🛡️</span>
                    <span>Mô hình demo để tham khảo</span>
                  </div>
                </div>

                <div className="composer-right-actions">
                  <button
                    type="button"
                    className="composer-model-pill"
                    onClick={() => setModelMode("Minh họa theo hồ sơ")}
                  >
                    <span>{modelMode}</span>
                    <span className="caret">▾</span>
                  </button>

                  <button
                    type="button"
                    className="composer-send-btn"
                    aria-label="Gửi câu hỏi"
                    title="Gửi câu hỏi"
                    disabled={!inputPrompt.trim()}
                    onClick={() => handleSend()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Floating Rail: Outputs & Sources */}
        {railOpen && (
          <aside className="codex-side-rail" aria-label="Kết quả và nguồn dữ liệu">
            <div className="codex-dock-widget">
              {/* Outputs Section */}
              <div className="dock-section">
                <div className="dock-header">
                  <span>Kết quả</span>
                </div>
                <div className="dock-list">
                  <button type="button" className="dock-item" onClick={() => navigate("/user/plan")}>
                    <span className="dock-icon globe"><Icon name="target" size="small" /></span>
                    <span className="dock-label">Xem kế hoạch hiện tại</span>
                  </button>
                  <button type="button" className="dock-item" onClick={() => navigate("/user/simulation")}>
                    <span className="dock-icon doc"><Icon name="chart" size="small" /></span>
                    <span className="dock-label">Mở công cụ mô phỏng</span>
                  </button>
                </div>
              </div>

              {/* Sources Section */}
              <div className="dock-section">
                <div className="dock-header">
                  <span>Nguồn dữ liệu</span>
                </div>
                <div className="dock-list">
                  <button type="button" className="dock-item" onClick={() => navigate("/user/account")}>
                    <span className="dock-icon clip"><Icon name="users" size="small" /></span>
                    <span className="dock-label">Hồ sơ tài chính của bạn</span>
                  </button>
                  <button type="button" className="dock-item" onClick={() => navigate("/user/goal")}>
                    <span className="dock-icon doc"><Icon name="settings" size="small" /></span>
                    <span className="dock-label">Giả định mục tiêu đã lưu</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
