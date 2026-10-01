import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../components/ui";

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
  const [inputPrompt, setInputPrompt] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [modelMode, setModelMode] = useState<string>("An Hưu Finance High");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m-init-assistant",
      sender: "assistant",
      text: "Các trang chính hiện đã vừa khung ở điện thoại, tablet và desktop trong lượt kiểm tra đầu tiên. Mình đang chạy kiểm tra rộng hơn, gồm màn hình ngang thấp và kích thước 320px; phần này giúp phát hiện lỗi chỉ xuất hiện khi mở form dài hoặc chuyển sang tab phụ.\n\nLượt kiểm tra 30 đường dẫn ở 8 kích thước đã qua phần bố cục. Mình cũng thấy phần đăng nhập và menu đang được cập nhật đồng thời trong thư mục dự án, nên đang giữ các thay đổi đó và kiểm tra lại hộp thoại, điều hướng trên bản mới nhất để tránh xung đột.",
      time: "11:12",
      tools: [
        { type: "edit", label: "Đã trích xuất hồ sơ tài chính cá nhân, khởi chạy mô phỏng" },
        { type: "command", label: "Chạy mô hình Hiện giá Dòng tiền Niên kim (PV Annuity)" },
        {
          type: "images",
          label: "Đã phân tích 2 kịch bản dòng tiền",
          images: [
            { title: "Tuổi 60", subtitle: "Tích lũy 14.2 tr/tháng", tag: "8.5 TỶ Đ" },
            { title: "Tuổi 58", subtitle: "Tích lũy 16.5 tr/tháng", tag: "+2.3 TR/TH" },
          ],
        },
        { type: "command", label: "Đã đồng bộ biểu đồ phân bổ tài sản" },
        { type: "edit", label: "Đã cập nhật bản kế hoạch hưu trí độc lập" },
        { type: "time", label: "Worked for 17m 35s" },
      ],
      metric: {
        label: "Mức tích lũy bổ sung cần thiết mỗi tháng",
        value: "+2.300.000 đ / tháng",
        detail: "Tăng từ 14.2 triệu lên 16.5 triệu/tháng để bảo đảm chạm đích 8.5 tỷ ở tuổi 58.",
        deltaType: "warning",
      },
      hasChart: false,
    },
  ]);

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

    const userMsg: Message = {
      id: `m-${Date.now()}`,
      sender: "user",
      text,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      tools: [{ type: "edit", label: "Đã đọc bối cảnh tài chính, chạy thuật toán tính toán" }],
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt("");
    setIsTyping(true);

    setTimeout(() => {
      let aiText = "Tôi đã phân tích yêu cầu của bạn dựa trên dữ liệu tài chính thời gian thực của hồ sơ Nguyễn Minh An.";
      let metric: Message["metric"] | undefined = undefined;
      let hasChart = false;
      const lower = text.toLowerCase();

      if (lower.includes("bhxh") || lower.includes("bảo hiểm xã hội") || lower.includes("lương hưu")) {
        aiText = "Với 9 năm đóng BHXH hiện tại và tiếp tục tham gia đến tuổi 60 (tổng 37 năm tham gia), bạn sẽ đạt tỷ lệ hưởng lương hưu tối đa 75% mức bình quân tiền lương đóng. Mức lương hưu ước tính nhận về khoảng 13.500.000 đ/tháng theo giá trị hiện tại, tạo chân kiềng bảo trợ vững chắc trước rủi ro lạm phát.\n\nLương hưu BHXH sẽ đảm bảo chi trả 61% chi phí sinh hoạt thiết yếu (22 triệu/tháng). Quỹ hưu trí tự nguyện chỉ cần gánh 39% còn lại.";
        metric = {
          label: "Tỷ lệ hưởng lương hưu BHXH dự kiến",
          value: "75% (Tối đa)",
          detail: "Đạt trần cao nhất theo quy định Luật Bảo hiểm Xã hội Việt Nam mới.",
          deltaType: "positive",
        };
      } else if (lower.includes("lạm phát") || lower.includes("giá cả") || lower.includes("sức mua")) {
        aiText = "Mô hình hoạch định của An Hưu áp dụng tỷ lệ lạm phát kỳ vọng 4.0%/năm (phù hợp với mức bình quân 10 năm qua của Việt Nam). Sau 28 năm nữa, rổ hàng hóa sinh hoạt 22 triệu đồng hôm nay sẽ có giá trị danh nghĩa khoảng 66 triệu đồng năm 2053.\n\nQuỹ mục tiêu 8.5 tỷ của bạn đã được tính toán đầy đủ để triệt tiêu toàn bộ độ trượt giá này.";
        metric = {
          label: "Hệ số điều chỉnh lạm phát (28 năm)",
          value: "3.00× sức mua",
          detail: "22 triệu đ hôm nay tương đương 66 triệu đ ở tuổi 60.",
          deltaType: "neutral",
        };
      } else if (lower.includes("phân bổ") || lower.includes("danh mục") || lower.includes("8%")) {
        aiText = "Để đạt tỷ suất sinh lời danh mục kỳ vọng 7.8%/năm ở độ tuổi 32, công thức tối ưu khuyến nghị cho bạn là: 35% Quỹ mở cổ phiếu VN30/Cổ tức, 35% Chứng chỉ quỹ trái phiếu chất lượng cao, 20% Tiền gửi kỳ hạn 12 tháng tại các ngân hàng lớn và 10% Vàng vật chất dự phòng thanh khoản.";
        metric = {
          label: "Lợi suất kỳ vọng bình quân gia quyền",
          value: "7.8% / năm",
          detail: "Độ lệch chuẩn rủi ro danh mục kiểm soát ở mức 5.4%.",
          deltaType: "positive",
        };
      } else {
        aiText = "Dựa trên dữ liệu tài chính của bạn, việc gia tăng tích lũy thêm 1 triệu đồng/tháng từ năm 32 tuổi sẽ tạo ra thêm khoảng 1.15 tỷ đồng tài sản ở tuổi 60 nhờ sức mạnh lãi kép 7.8%/năm. Đây là bước đệm an toàn giúp bạn nâng cao chất lượng cuộc sống hưu trí.";
        metric = {
          label: "Giá trị tương lai của 1 triệu đ/tháng",
          value: "+1.15 tỷ đồng",
          detail: "Tính toán theo lãi suất kép tái đầu tư 7.8%/năm trong 28 năm.",
          deltaType: "positive",
        };
        hasChart = true;
      }

      const aiMsg: Message = {
        id: `m-${Date.now() + 1}`,
        sender: "assistant",
        text: aiText,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        tools: [
          { type: "edit", label: "Đã cập nhật dự báo dòng tiền" },
          { type: "time", label: "Thời gian xử lý: 0.6s" },
        ],
        metric,
        hasChart,
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
            <span className="codex-title-sub"> · Đọc lại thông tin dự án</span>
          </h1>
          <span className="codex-status-pill">
            <span className="codex-pulse" />
            Trực tuyến
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
            onClick={() => setMessages([messages[0]])}
          >
            <Icon name="trash" size="small" />
          </button>
        </div>
      </header>

      {/* Main Container: Left Tick Marks + Chat Feed + Right Floating Rail */}
      <div className="codex-body-layout">
        {/* Subtle Far-Left Ruler Ticks */}
        <div className="codex-left-ticks" aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </div>

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
                      <span className="metric-pill">Khuyến nghị CFP</span>
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
                      <span><i className="dot green" /> Tuổi 60: 14.2 tr/tháng (8.5 tỷ đ)</span>
                      <span><i className="dot blue" /> Tuổi 58: 16.5 tr/tháng (+2.3 tr)</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="codex-turn assistant typing">
                <div className="tool-row">
                  <span className="tool-icon">✎</span>
                  <span className="tool-text">Đang phân tích dữ liệu và tính toán kịch bản...</span>
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
                ⓘ Dữ liệu cá nhân hóa đã được đồng bộ với hồ sơ Nguyễn Minh An (32 tuổi, mục tiêu 8.5 tỷ đ)
              </span>
              <span className="sync-line" />
            </div>

            {/* Financial Status Summary Card (matches layout of usage card in screenshot) */}
            <div className="codex-status-card">
              <div className="status-copy">
                <strong>Hồ sơ mục tiêu hưu trí: 8.50 tỷ đ (Đã đạt 72%)</strong>
                <p>Thặng dư khả dụng 18.5 tr/tháng — Đủ điều kiện bổ sung kịch bản tuổi 58.</p>
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
                    <span>Chuẩn CFP & Luật BHXH 2024</span>
                  </div>
                </div>

                <div className="composer-right-actions">
                  <button
                    type="button"
                    className="composer-model-pill"
                    onClick={() => setModelMode(modelMode.includes("High") ? "An Hưu Deep Reasoning" : "An Hưu Finance High")}
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
          <aside className="codex-side-rail" aria-label="Outputs and Sources Panel">
            <div className="codex-dock-widget">
              {/* Outputs Section */}
              <div className="dock-section">
                <div className="dock-header">
                  <span>Outputs</span>
                  <button type="button" className="dock-add-btn" title="Thêm output">+</button>
                </div>
                <div className="dock-list">
                  <div className="dock-item" onClick={() => window.open("/", "_blank")}>
                    <span className="dock-icon globe">🌐</span>
                    <span className="dock-label">Local preview</span>
                  </div>
                  <div className="dock-item" onClick={() => alert("Tải xuống hồ sơ An_Huu_User_Admin.docx")}>
                    <span className="dock-icon doc">📄</span>
                    <span className="dock-label">An_Huu_User_Admin.docx</span>
                  </div>
                </div>
              </div>

              {/* Sources Section */}
              <div className="dock-section">
                <div className="dock-header">
                  <span>Sources</span>
                  <button type="button" className="dock-add-btn" title="Thêm nguồn dữ liệu">+</button>
                </div>
                <div className="dock-list">
                  <div className="dock-item" onClick={() => alert("Nguồn dữ liệu: Luật BHXH số 41/2024/QH15")}>
                    <span className="dock-icon clip">⌨</span>
                    <span className="dock-label truncate">luat-bhxh-41-2024-qh15</span>
                  </div>
                  <div className="dock-item" onClick={() => alert("Nguồn tài liệu: An_Huu_User_Admin.docx")}>
                    <span className="dock-icon doc">📄</span>
                    <span className="dock-label">An_Huu_User_Admin.docx</span>
                  </div>
                  <div className="dock-item" onClick={() => alert("Nguồn: chatgpt.com/share/6abe2df8-83ec")}>
                    <span className="dock-icon link">🔗</span>
                    <span className="dock-label truncate">chatgpt.com/share/6abe2df8-83ec...</span>
                  </div>
                  <div className="dock-item view-all" onClick={() => alert("Toàn bộ nguồn dữ liệu đã được đối chiếu chuẩn xác.")}>
                    <span className="dock-icon link">🔗</span>
                    <span className="dock-label">Xem tất cả</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
