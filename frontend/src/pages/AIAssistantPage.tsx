import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Drawer, Icon, IconButton, Modal, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import {
  getAiPrivacy,
  updateAiPrivacy,
  explainRetirementPlan,
  simulateViaAi,
  listAiConversations,
  createAiConversation,
  getAiConversation,
  renameAiConversation,
  deleteAiConversation,
  exportAiConversation,
  AI_POLICY_VERSION,
  type AiPrivacyResponse,
  type AiCitation,
  type AiFact,
  type AiProvenance,
  type AiConversationItem,
} from "../services/ai";
import { formatVNDCurrency } from "../services/retirement";
import { useI18n } from "../i18n";
import type { SimulatePlanResponse } from "../services/plans";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " ₫";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  facts?: AiFact[];
  citations?: AiCitation[];
  provenance?: AiProvenance | null;
  status?: string;
}

export default function AIAssistantPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, profileRevision } = useFinancialProfile();
  const { activePlan, currentVersion } = useRetirementPlan();

  const [inputPrompt, setInputPrompt] = useState("");
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1024);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Privacy & Consent state
  const [privacyError, setPrivacyError] = useState(false);
  const [privacy, setPrivacy] = useState<AiPrivacyResponse | null>(null);
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [updatingConsent, setUpdatingConsent] = useState(false);

  // Conversations state
  const [conversations, setConversations] = useState<AiConversationItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationRevision, setConversationRevision] = useState<number>(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // What-if simulation modal state
  const [whatIfModalOpen, setWhatIfModalOpen] = useState(false);
  const [whatIfRetireAge, setWhatIfRetireAge] = useState<number>(profile.goal.targetRetireAge || 60);
  const [whatIfMonthlyContribution, setWhatIfMonthlyContribution] = useState<number>(profile.plan.monthlySavings || 5000000);
  const [whatIfMonthlyExpense, setWhatIfMonthlyExpense] = useState<number>(profile.goal.monthlyExpenseInRetirement || 20000000);
  const [whatIfSimulating, setWhatIfSimulating] = useState(false);
  const [whatIfResult, setWhatIfResult] = useState<SimulatePlanResponse | null>(null);

  // Initial welcome message
  const initialMessage = useMemo<ChatMessage>(() => ({
    id: "m-init-assistant",
    role: "assistant",
    content: language === "en"
      ? "Hello! I am your An Huu explanation assistant. I help explain calculation results, forecasting rules, and regulatory knowledge sources in your retirement plan. Responses are grounded in actual model data without altering your official plan."
      : "Xin chào! Tôi là trợ lý giải thích của An Hữu. Tôi hỗ trợ giải thích rõ ràng các kết quả tính toán, quy tắc dự báo và các nguồn tri thức pháp lý trong kế hoạch hưu trí của bạn. Phản hồi luôn dựa trên dữ liệu mô hình thực tế và không tự ý thay đổi kế hoạch chính thức.",
    time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
  }), [language]);

  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === "m-init-assistant") {
        return [initialMessage];
      }
      return prev;
    });
  }, [initialMessage]);

  // Load privacy settings
  const loadPrivacy = async () => {
    setPrivacyError(false);
    try {
      const p = await getAiPrivacy();
      setPrivacy(p);
      if (!p.processing) {
        setConsentModalOpen(true);
      }
    } catch {
      setPrivacyError(true);
    }
  };

  // Load conversation list
  const loadConversations = async () => {
    try {
      const res = await listAiConversations(1, 20);
      setConversations(res.items);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadPrivacy();
    loadConversations();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTyping]);

  const handleConsent = async (processing: boolean, saveHistory: boolean) => {
    if (!privacy) return;
    setUpdatingConsent(true);
    try {
      const updated = await updateAiPrivacy({
        expectedRevision: privacy.revision,
        policyVersion: AI_POLICY_VERSION,
        processing,
        saveHistory,
      });
      setPrivacy(updated);
      setConsentModalOpen(false);
      notify.success(
        language === "en" ? "Preferences Saved" : "Đã lưu tùy chọn",
        language === "en" ? "Updated AI data processing preferences." : "Đã cập nhật tùy chọn xử lý dữ liệu của trợ lý."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not update preferences." : "Không thể cập nhật tùy chọn.");
      notify.error(language === "en" ? "Update Error" : "Lỗi cập nhật", msg);
    } finally {
      setUpdatingConsent(false);
    }
  };

  const handleSelectConversation = async (id: string) => {
    try {
      const detail = await getAiConversation(id);
      setCurrentConversationId(detail.id);
      setConversationRevision(detail.revision);
      const loaded: ChatMessage[] = detail.messages.map((m) => {
        const parsedContext = m.context as { response?: { facts?: AiFact[]; citations?: AiCitation[]; provenance?: AiProvenance } } | undefined;
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          time: new Date(m.createdAt).toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
          facts: parsedContext?.response?.facts,
          citations: m.citedSources || parsedContext?.response?.citations,
          provenance: parsedContext?.response?.provenance,
        };
      });
      setMessages(loaded.length > 0 ? loaded : [initialMessage]);
      setDrawerOpen(false);
    } catch (e) {
      notify.error(
        language === "en" ? "Failed to Load Conversation" : "Lỗi tải hội thoại",
        e instanceof Error ? e.message : (language === "en" ? "Could not load conversation." : "Không thể tải hội thoại.")
      );
    }
  };

  const handleNewConversation = async () => {
    try {
      const created = await createAiConversation();
      setCurrentConversationId(created.id);
      setConversationRevision(created.revision);
      setMessages([initialMessage]);
      await loadConversations();
      setDrawerOpen(false);
      notify.info(
        language === "en" ? "New Conversation" : "Hội thoại mới",
        language === "en" ? "Started a new conversation session." : "Đã khởi tạo phiên trò chuyện mới."
      );
    } catch (e) {
      if (privacy?.saveHistory) {
        notify.error(
          language === "en" ? "Could Not Create Conversation" : "Không thể khởi tạo hội thoại",
          e instanceof Error ? e.message : (language === "en" ? "Could not start new conversation on server." : "Không thể khởi tạo cuộc hội thoại trên máy chủ.")
        );
      }
      // Fallback: local session
      setCurrentConversationId(null);
      setConversationRevision(0);
      setMessages([initialMessage]);
      setDrawerOpen(false);
    }
  };

  const handleRename = async (id: string, rev: number) => {
    if (!newTitle.trim()) return;
    try {
      await renameAiConversation(id, rev, newTitle.trim());
      await loadConversations();
      setRenamingId(null);
      setNewTitle("");
      notify.success(
        language === "en" ? "Renamed Successfully" : "Đổi tên thành công",
        language === "en" ? "Updated conversation title." : "Đã cập nhật tiêu đề cuộc trò chuyện."
      );
    } catch (e) {
      notify.error(
        language === "en" ? "Rename Error" : "Lỗi đổi tên",
        e instanceof Error ? e.message : (language === "en" ? "Could not rename conversation." : "Không thể đổi tên.")
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAiConversation(id);
      await loadConversations();
      if (currentConversationId === id) {
        handleNewConversation();
      }
      notify.success(
        language === "en" ? "Deleted" : "Đã xóa",
        language === "en" ? "Conversation deleted." : "Đã xóa cuộc trò chuyện."
      );
    } catch (e) {
      notify.error(
        language === "en" ? "Delete Error" : "Lỗi xóa",
        e instanceof Error ? e.message : (language === "en" ? "Could not delete." : "Không thể xóa.")
      );
    }
  };

  const handleExportJson = async () => {
    if (currentConversationId) {
      try {
        await exportAiConversation(currentConversationId);
        notify.success(
          language === "en" ? "Exported Successfully" : "Xuất thành công",
          language === "en" ? "AI conversation exported." : "Đã xuất cuộc trò chuyện AI."
        );
        return;
      } catch (e) {
        notify.error(
          language === "en" ? "Export Failed" : "Xuất thất bại",
          e instanceof Error ? e.message : (language === "en" ? "Could not export conversation." : "Không thể xuất cuộc trò chuyện.")
        );
      }
    }
    const data = {
      conversationId: currentConversationId,
      exportedAt: new Date().toISOString(),
      planId: activePlan?.id,
      versionId: currentVersion?.id,
      messages,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `an-huu-ai-conversation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = async (textToSend?: string) => {
    const question = (textToSend || inputPrompt).trim();
    if (!question || isTyping) return;

    if (!privacy?.processing) {
      setConsentModalOpen(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      role: "user",
      content: question,
      time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt("");
    setIsTyping(true);

    try {
      const res = await explainRetirementPlan({
        question,
        planId: activePlan?.id,
        versionId: currentVersion?.id,
        conversationId: privacy.saveHistory && currentConversationId ? currentConversationId : undefined,
        expectedRevision: privacy.saveHistory && currentConversationId ? conversationRevision : undefined,
      });

      if (res.conversationId && res.revision !== null) {
        setCurrentConversationId(res.conversationId);
        setConversationRevision(res.revision);
        loadConversations();
      }

      const aiMsg: ChatMessage = {
        id: `m-${Date.now() + 1}`,
        role: "assistant",
        content: res.answer,
        time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
        facts: res.facts,
        citations: res.citations,
        provenance: res.provenance,
        status: res.status,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not get response from assistant." : "Không thể nhận phản hồi từ trợ lý.");
      const errorMsg: ChatMessage = {
        id: `m-${Date.now() + 1}`,
        role: "assistant",
        content: language === "en"
          ? `Sorry, an error occurred: ${msg}. Please retry or start a new conversation.`
          : `Rất tiếc, đã có lỗi xảy ra: ${msg}. Vui lòng thử lại hoặc làm mới cuộc trò chuyện.`,
        time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleRunWhatIfSimulation = async () => {
    if (!activePlan?.id || !currentVersion?.id) {
      notify.error(
        language === "en" ? "No Plan Available" : "Chưa có kế hoạch",
        language === "en" ? "An active official plan version is required to run what-if simulations." : "Cần một phiên bản kế hoạch chính thức để mô phỏng."
      );
      return;
    }

    setWhatIfSimulating(true);
    setWhatIfResult(null);

    const birthYear = new Date().getFullYear() - (profile.personal.age || 30);
    const retireMonth = `${birthYear + whatIfRetireAge}-12`;

    try {
      const res = await simulateViaAi({
        planId: activePlan.id,
        versionId: currentVersion.id,
        expectedProfileRevision: profileRevision > 0 ? profileRevision : 1,
        changes: {
          retirementMonth: retireMonth,
          monthlyContribution: String(whatIfMonthlyContribution),
          monthlyExpenseToday: String(whatIfMonthlyExpense),
        },
      });
      setWhatIfResult(res);
      notify.success(
        language === "en" ? "Simulation Completed" : "Mô phỏng thành công",
        language === "en" ? "Comparative simulation for experimental scenario finished." : "Đã hoàn thành tính toán so sánh cho phương án thử nghiệm."
      );
    } catch (e) {
      notify.error(
        language === "en" ? "Simulation Error" : "Lỗi mô phỏng",
        e instanceof Error ? e.message : (language === "en" ? "Could not run simulation." : "Không thể chạy mô phỏng.")
      );
    } finally {
      setWhatIfSimulating(false);
    }
  };

  return (
    <div className="codex-work-workspace">
        {privacyError && <Alert tone="danger" title={language === "en" ? "Unable to load AI preferences" : "Không thể tải tùy chọn AI"} action={<Button onClick={loadPrivacy}>{language === "en" ? "Retry" : "Thử lại"}</Button>} />}
      {!currentVersion && <Alert tone="info" title={language === "en" ? "No applied plan" : "Chưa có kế hoạch được áp dụng"}>{language === "en" ? "Apply a plan to ask questions about its figures." : "Áp dụng kế hoạch để trợ lý có số liệu giải thích chính xác."}<Link className="button button-secondary" to="/user/plan">{language === "en" ? "Open plan" : "Đến kế hoạch"}</Link></Alert>}
      {/* Top Header Bar */}
      <header className="codex-topbar">
      <div className="codex-title-wrap">
          <span className="codex-folder-icon" aria-hidden="true">
            <Icon name="sparkles" size="small" />
          </span>
          <h1>
            {t("ai.page_title")}
            <span className="codex-title-sub">{language === "en" ? " · Calculation Engine" : " · Động cơ An Hữu"}</span>
          </h1>
          <span className="codex-status-pill">
            <span className="codex-pulse" />
            {privacy?.providerConfigured
              ? (language === "en" ? "AI Analytical Assistant" : "AI Hỗ trợ phân tích")
              : (language === "en" ? "Plan Data Explainer - Local Calculation Engine" : "Giải thích từ số liệu kế hoạch - chưa kết nối AI ngoài")}
          </span>
        </div>

        <div className="codex-actions-wrap">
          <Button
            variant="ghost"
            size="small"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="file-text" size="small" /> {language === "en" ? "Conversations" : "Danh sách hội thoại"} ({conversations.length})
          </Button>

          <button
            type="button"
            className="codex-icon-btn"
            title={language === "en" ? "Export conversation data (JSON)" : "Xuất dữ liệu hội thoại (JSON)"}
            aria-label={language === "en" ? "Export conversation data" : "Xuất dữ liệu hội thoại"}
            onClick={handleExportJson}
          >
            <Icon name="download" size="small" />
          </button>

          <button
            type="button"
            className={`codex-icon-btn ${railOpen ? "is-active" : ""}`}
            title={language === "en" ? "Toggle Sources & Context Rail" : "Bật/tắt thanh Nguồn dữ liệu & Ngữ cảnh"}
            aria-label={language === "en" ? "Toggle Sources & Context Rail" : "Bật/tắt thanh Nguồn dữ liệu & Ngữ cảnh"}
            onClick={() => setRailOpen(!railOpen)}
          >
            <Icon name="panel-right" size="small" />
          </button>

          <button
            type="button"
            className="codex-icon-btn"
            title={language === "en" ? "Start new conversation" : "Khởi tạo hội thoại mới"}
            aria-label={language === "en" ? "Start new conversation" : "Khởi tạo hội thoại mới"}
            onClick={handleNewConversation}
          >
            <Icon name="plus" size="small" />
          </button>
        </div>
      </header>

      {/* Main Container: Chat Feed + Right Docked Rail */}
      <div className="codex-body-layout">
        {/* Chat Feed */}
        <div className="codex-chat-container">
          {!activePlan && (
            <div style={{ margin: "16px 20px 0", padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-secondary-soft)", border: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--color-primary-700)" }}>
                <Icon name="info" size="small" />
                <span>
                  {language === "en"
                    ? "You haven't established an official retirement plan yet. Create one to get personalized AI data insights."
                    : "Bạn chưa có kế hoạch hưu trí chính thức. Hãy tạo kế hoạch để trợ lý phân tích số liệu cá nhân hóa cho bạn."}
                </span>
              </div>
              <Link to="/user/goal" className="button button-primary button-small" style={{ textDecoration: "none", fontSize: "12px" }}>
                {language === "en" ? "Set Up Goal" : "Thiết lập mục tiêu"}
              </Link>
            </div>
          )}
          <div className="conversation-scroll" ref={scrollRef}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`codex-turn ${msg.role}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {/* Assistant Message Body */}
                <div className="codex-message-prose">
                  {msg.content.split("\n\n").map((para, pIdx) => (
                    <p key={pIdx}>{para}</p>
                  ))}
                </div>

                {/* Structured Key Facts Grid */}
                {msg.facts && msg.facts.length > 0 && (
                  <div style={{ marginTop: "14px", display: "grid", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.04em" }}>
                      {language === "en" ? "KEY METRICS FROM ENGINE:" : "SỐ LIỆU CHÍNH TỪ MÔ HÌNH:"}
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
                      {msg.facts.map((fact) => (
                        <div
                          key={fact.key}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(15, 23, 42, 0.03)",
                            border: "1px solid var(--color-border)",
                            fontSize: "12px",
                            lineHeight: "1.45",
                          }}
                        >
                          <strong style={{ display: "block", color: "var(--color-primary-700)", fontSize: "11px", marginBottom: "2px" }}>
                            {fact.key.toUpperCase()}
                          </strong>
                          {fact.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approved Citations from Knowledge Base */}
                {msg.citations && msg.citations.length > 0 && (
                  <div style={{ marginTop: "14px", borderTop: "1px dashed var(--color-border)", paddingTop: "10px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "LEGAL & REGULATORY CITATIONS:" : "CĂN CỨ VÀ NGUỒN TRI THỨC PHÁP LÝ / CHUẨN MỰC:"}
                    </span>
                    <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                      {msg.citations.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: "8px 10px",
                            background: "var(--color-surface-subtle)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "11.5px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong>{c.title} (v{c.version})</strong>
                            <small className="font-mono" style={{ color: "var(--color-text-muted)" }}>
                              {language === "en" ? "Effective" : "Hiệu lực"}: {new Date(c.effectiveDate).toLocaleDateString(language === "en" ? "en-US" : "vi-VN")}
                            </small>
                          </div>
                          <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                            "{c.excerpt}"
                          </p>
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: "11px", color: "var(--color-primary-600)", marginTop: "4px", display: "inline-block" }}
                            >
                              {language === "en" ? "View source text →" : "Xem văn bản gốc →"}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Provenance Metadata & Simulation Trigger Button */}
                {msg.role === "assistant" && msg.provenance && (
                  <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <Badge tone="soft">
                        {language === "en" ? "Plan" : "Kế hoạch"}: {msg.provenance.valueKind}
                      </Badge>
                      <small className="font-mono" style={{ fontSize: "10.5px", color: "var(--color-text-muted)" }}>
                        {language === "en" ? "Model v" : "Mô hình v"}{msg.provenance.modelVersion} • {language === "en" ? "Valuation" : "Định giá"}: {msg.provenance.valuationDate}
                      </small>
                    </div>

                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setWhatIfModalOpen(true)}
                    >
                      <Icon name="sparkles" size="small" /> {language === "en" ? "Test What-if" : "Thử nghiệm What-if"}
                    </Button>
                  </div>
                )}
              </motion.div>
            ))}

            {isTyping && (
              <div className="codex-turn assistant typing">
                <div className="tool-row">
                  <span className="tool-icon">✎</span>
                  <span className="tool-text">
                    {language === "en" ? "Cross-referencing plan data and regulatory standards..." : "Đang đối chiếu dữ liệu kế hoạch và tri thức chuẩn mực..."}
                  </span>
                </div>
                <div className="typing-pulse-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {/* Informational Sync Divider */}
            <div className="codex-sync-divider">
              <span className="sync-line" />
              <span className="sync-label">
                {language === "en"
                  ? `ⓘ Grounded on active plan for ${profile.personal.name} • Target retire age ${profile.goal.targetRetireAge}`
                  : `ⓘ Phân tích dựa trên kế hoạch hiện hành của ${profile.personal.name} • Mục tiêu tuổi ${profile.goal.targetRetireAge}`}
              </span>
              <span className="sync-line" />
            </div>

            {/* Quick Suggestions Block */}
            <div className="codex-suggestions-block">
              <span className="suggestions-title">{language === "en" ? "FREQUENT PLAN QUESTIONS:" : "CÂU HỎI THƯỜNG GẶP VỀ KẾ HOẠCH:"}</span>
              <div className="suggestions-pills">
                <button
                  type="button"
                  onClick={() => handleSend(language === "en" ? "Explain my retirement coverage ratio and its most critical driving factors?" : "Giải thích tỷ lệ bao phủ quỹ hưu trí của tôi và các yếu tố ảnh hưởng lớn nhất?")}
                >
                  {language === "en" ? "What is the retirement coverage ratio?" : "Tỷ lệ bao phủ quỹ hưu trí là gì?"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(language === "en" ? "How much more do I need to contribute monthly to retire 2 years earlier?" : "Nếu tôi muốn nghỉ hưu sớm hơn 2 năm thì cần đóng góp thêm bao nhiêu mỗi tháng?")}
                >
                  {language === "en" ? "Retiring 2 years earlier requirements" : "Nghỉ hưu sớm hơn 2 năm cần thêm vốn gì?"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(language === "en" ? "How are inflation and investment return assumptions set in this plan?" : "Giả định lạm phát và lợi suất trong phiên bản này được quy định như thế nào?")}
                >
                  {language === "en" ? "Inflation and yield assumptions" : "Quy ước lạm phát và lợi suất đầu tư"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(language === "en" ? "What key limitations should I keep in mind regarding these projections?" : "Các giới hạn quan trọng tôi cần lưu ý trước khi dựa vào kết quả này?")}
                >
                  {language === "en" ? "Important model limitations" : "Các giới hạn cần lưu ý"}
                </button>
              </div>
            </div>
          </div>

          {/* Composer Input Form */}
          <div className="codex-composer-wrapper">
            <form
              className="codex-composer-card"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <textarea
                aria-label={language === "en" ? "Question for AI assistant" : "Câu hỏi dành cho trợ lý AI"}
                placeholder={t("ai.input_placeholder")}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                disabled={isTyping}
              />
              <div className="composer-actions-bar">
                <div className="composer-left-actions">
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                    {language === "en" ? "Press Enter to send, Shift+Enter for new line" : "Nhấn Enter để gửi, Shift+Enter để xuống dòng"}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="small"
                  type="submit"
                  disabled={!inputPrompt.trim() || isTyping}
                >
                  <Icon name="arrow-right" size="small" /> {t("ai.send")}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Docked Rail: Outputs & Sources */}
        {railOpen && (
          <aside className="codex-side-rail" aria-label={language === "en" ? "Sources and Context" : "Nguồn dữ liệu và Ngữ cảnh"}>
            <div className="codex-dock-widget">
              <header className="dock-widget-header">
                <h3>{language === "en" ? "Active Plan Context" : "Ngữ cảnh kế hoạch đang phân tích"}</h3>
              </header>

              <div style={{ padding: "var(--space-4)", display: "grid", gap: "14px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                    {language === "en" ? "PLAN VERSION" : "PHIÊN BẢN KẾ HOẠCH"}
                  </span>
                  <div style={{ marginTop: "4px" }}>
                    <strong>{currentVersion ? (language === "en" ? `Version v${currentVersion.version}` : `Phiên bản v${currentVersion.version}`) : (language === "en" ? "No applied version" : "Chưa có bản áp dụng")}</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-text-muted)" }}>
                      {currentVersion?.snapshotHash ? `Hash: ${currentVersion.snapshotHash.slice(0, 12)}...` : ""}
                    </p>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                    {language === "en" ? "RETIREMENT GOAL" : "MỤC TIÊU HƯU TRÍ"}
                  </span>
                  <div style={{ marginTop: "4px" }}>
                    <strong className="font-mono">
                      {currentVersion?.preview.calculation ? formatVND(Number(currentVersion.preview.calculation.summary.atRetirement.requiredFund)) : "-"}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Retire age" : "Tuổi hưu"}: {profile.goal.targetRetireAge || 60} • {language === "en" ? "Savings" : "Tích lũy"}: {formatVND(profile.plan.monthlySavings)}/{language === "en" ? "mo" : "tháng"}
                    </p>
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "12px" }}>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                    {language === "en" ? "PRIVACY & DATA SETTINGS" : "QUYỀN RIÊNG TƯ & DỮ LIỆU"}
                  </span>
                  <p style={{ margin: "4px 0", fontSize: "11.5px", color: "var(--color-text-muted)" }}>
                    {language === "en" ? "Save history" : "Lưu lịch sử"}: <b>{privacy?.saveHistory ? (language === "en" ? "On (auto-purges in 30 days)" : "Bật (tự xóa sau 30 ngày)") : (language === "en" ? "Off" : "Tắt")}</b>
                  </p>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => setConsentModalOpen(true)}
                    style={{ paddingLeft: 0, marginTop: "4px" }}
                  >
                    {language === "en" ? "Privacy settings →" : "Cài đặt quyền riêng tư →"}
                  </Button>
                </div>

                <div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "12px" }}>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                    {language === "en" ? "LEGAL DISCLAIMER" : "GIỚI HẠN PHÁP LÝ (DISCLAIMER)"}
                  </span>
                  <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                    {language === "en"
                      ? "The assistant explains figures calculated by the formal actuarial engine. Any real-world financial decision requires your independent evaluation and professional verification."
                      : "Trợ lý chỉ hỗ trợ giải thích dữ liệu từ mô hình tính toán chuẩn mực. Mọi quyết định tài chính thực tế cần bạn cân nhắc riêng và xác nhận độc lập."}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Conversations Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={language === "en" ? "Conversation Sessions History" : "Lịch sử các phiên hội thoại"}
      >
        <div style={{ display: "grid", gap: "12px", padding: "8px 0" }}>
          <Button variant="primary" onClick={handleNewConversation}>
            <Icon name="plus" size="small" /> {language === "en" ? "New Conversation" : "Tạo cuộc trò chuyện mới"}
          </Button>

          {conversations.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: "12px", textAlign: "center", margin: "20px 0" }}>
              {language === "en" ? "No stored conversations yet." : "Chưa có cuộc trò chuyện nào được lưu."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
              {conversations.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 12px",
                    border: `1.5px solid ${c.id === currentConversationId ? "var(--color-primary-700)" : "var(--color-border)"}`,
                    borderRadius: "var(--radius-md)",
                    background: c.id === currentConversationId ? "var(--color-surface-subtle)" : "var(--color-white)",
                  }}
                >
                  {renamingId === c.id ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="input"
                        style={{ height: "30px", fontSize: "12px" }}
                      />
                      <Button size="small" variant="primary" onClick={() => handleRename(c.id, c.revision)}>
                        {language === "en" ? "Save" : "Lưu"}
                      </Button>
                      <Button size="small" variant="ghost" onClick={() => setRenamingId(null)}>
                        {language === "en" ? "Cancel" : "Hủy"}
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div
                        style={{ cursor: "pointer", flex: 1 }}
                        onClick={() => handleSelectConversation(c.id)}
                      >
                        <strong style={{ fontSize: "12.5px", display: "block" }}>{c.title}</strong>
                        <small style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
                          {new Date(c.createdAt).toLocaleDateString(language === "en" ? "en-US" : "vi-VN")} • {language === "en" ? "Expires" : "Tự xóa"}: {new Date(c.expiresAt).toLocaleDateString(language === "en" ? "en-US" : "vi-VN")}
                        </small>
                      </div>

                      <div style={{ display: "flex", gap: "4px" }}>
                        <IconButton
                          icon="settings"
                          label={language === "en" ? "Rename" : "Đổi tên"}
                          onClick={() => {
                            setRenamingId(c.id);
                            setNewTitle(c.title);
                          }}
                        />
                        <IconButton
                          icon="trash"
                          label={language === "en" ? "Delete" : "Xóa"}
                          onClick={() => handleDelete(c.id)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Drawer>

      {/* Privacy Consent Modal */}
      <Modal
        open={consentModalOpen}
        onClose={() => setConsentModalOpen(false)}
        title={language === "en" ? "AI Privacy & Data Processing" : "Quyền riêng tư & Xử lý dữ liệu AI"}
      >
        <div style={{ display: "grid", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6 }}>
            {language === "en"
              ? "The An Huu assistant uses key metric outputs from your retirement plan to provide rigorous explanations. The system never exposes personal identification, contact details, or granular transaction records."
              : "Trợ lý An Hữu sử dụng các chỉ số đầu ra từ kế hoạch hưu trí của bạn để giải thích tường tận. Hệ thống cam kết không gửi hồ sơ cá nhân đầy đủ, thông tin liên hệ hay dữ liệu giao dịch chi tiết ra ngoài."}
          </p>

          <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)", fontSize: "12px" }}>
            <span style={{ fontWeight: 700, display: "block", marginBottom: "4px" }}>
              {language === "en" ? "DATA PROTECTION POLICY:" : "CHÍNH SÁCH BẢO VỆ DỮ LIỆU:"}
            </span>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              <li>
                {language === "en"
                  ? "Transmits only: Your prompt, high-level plan summaries, and regulatory citations."
                  : "Chỉ gửi: Câu hỏi của bạn, các chỉ số tóm tắt của kế hoạch và các đoạn tri thức chuẩn mực."}
              </li>
              <li>
                {language === "en"
                  ? "Strictly excludes: Full name, email, phone number, bank account details, and raw ledgers."
                  : "Loại trừ tuyệt đối: Tên, email, số điện thoại, số tài khoản và các dòng giao dịch chi tiết."}
              </li>
              <li>
                {language === "en"
                  ? "Conversations automatically expire and are purged after 30 days."
                  : "Hội thoại được lưu tự động hết hạn và xóa hoàn toàn sau 30 ngày."}
              </li>
            </ul>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
            <Button
              variant="secondary"
              onClick={() => handleConsent(false, false)}
              disabled={updatingConsent}
            >
              {language === "en" ? "Decline Processing" : "Từ chối xử lý"}
            </Button>
            <Button
              variant="primary"
              onClick={() => handleConsent(true, true)}
              loading={updatingConsent}
            >
              {language === "en" ? "Agree & Save History (30 Days)" : "Đồng ý & Lưu lịch sử (30 ngày)"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* What-If Simulation Modal */}
      <Modal
        open={whatIfModalOpen}
        onClose={() => setWhatIfModalOpen(false)}
        title={language === "en" ? "What-If Simulation from AI Suggestions" : "Mô phỏng thử nghiệm What-if từ gợi ý AI"}
      >
        <div style={{ display: "grid", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-text-muted)" }}>
            {language === "en"
              ? "Quickly adjust key parameters to recalculate your retirement fund without changing base profile data."
              : "Điều chỉnh nhanh các thông số để xem động cơ tính toán lại quỹ hưu mà không làm thay đổi hồ sơ gốc."}
          </p>

          <div style={{ display: "grid", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                {language === "en" ? "Target retirement age" : "Tuổi nghỉ hưu mong muốn"}: {whatIfRetireAge} {language === "en" ? "yrs" : "tuổi"}
              </label>
              <input
                type="range"
                min={(profile.personal.age || 30) + 1}
                max={75}
                value={whatIfRetireAge}
                onChange={(e) => setWhatIfRetireAge(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                {language === "en" ? "Monthly contribution amount (₫)" : "Mức tích lũy mỗi tháng (₫)"}: {formatVND(whatIfMonthlyContribution)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={new Intl.NumberFormat("vi-VN").format(whatIfMonthlyContribution)}
                onChange={(e) => setWhatIfMonthlyContribution(Number(e.target.value.replace(/\D/g, "")) || 0)}
                className="input font-mono"
                style={{ width: "100%", height: "36px" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                {language === "en" ? "Retirement monthly expense (today's value)" : "Chi tiêu khi hưu (giá trị hôm nay)"}: {formatVND(whatIfMonthlyExpense)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={new Intl.NumberFormat("vi-VN").format(whatIfMonthlyExpense)}
                onChange={(e) => setWhatIfMonthlyExpense(Number(e.target.value.replace(/\D/g, "")) || 0)}
                className="input font-mono"
                style={{ width: "100%", height: "36px" }}
              />
            </div>
          </div>

          <Button
            variant="primary"
            onClick={handleRunWhatIfSimulation}
            loading={whatIfSimulating}
          >
            <Icon name="sparkles" size="small" /> {language === "en" ? "Run Test Calculation" : "Chạy tính toán thử nghiệm"}
          </Button>

          {whatIfResult && (
            <div style={{ marginTop: "12px", padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)", fontSize: "12px" }}>
              <strong style={{ display: "block", marginBottom: "6px" }}>
                {language === "en" ? "COMPARISON WITH BASELINE PLAN:" : "KẾT QUẢ SO SÁNH VỚI KẾ HOẠCH GỐC:"}
              </strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }} className="font-mono">
                <div>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                    {language === "en" ? "Projected Test Fund:" : "Quỹ dự phóng thử nghiệm:"}
                  </span>
                  <strong style={{ display: "block" }}>{formatVND(Number(whatIfResult.candidate.calculation?.summary.atRetirement.projectedFund || 0))}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                    {language === "en" ? "Retirement Fund Delta:" : "Chênh lệch quỹ hưu:"}
                  </span>
                  <strong style={{ display: "block", color: Number(whatIfResult.comparison.delta?.projectedFundAtValuation || 0) >= 0 ? "var(--color-secondary-700)" : "var(--color-danger)" }}>
                    {Number(whatIfResult.comparison.delta?.projectedFundAtValuation || 0) >= 0 ? "+" : ""}
                    {formatVND(Number(whatIfResult.comparison.delta?.projectedFundAtValuation || 0))}
                  </strong>
                </div>
              </div>

              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setWhatIfModalOpen(false);
                    navigate("/user/simulation");
                  }}
                >
                  {language === "en" ? "Open Simulation page for details →" : "Mở trang Mô phỏng để xem chi tiết →"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
