import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Icon, IconButton, Modal, useNotification } from "../components/ui";
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
  clearAllAiConversations,
  editAiMessage,
  AI_POLICY_VERSION,
  type AiPrivacyResponse,
  type AiCitation,
  type AiFact,
  type AiProvenance,
  type AiConversationItem,
  type AiExplainCommand,
} from "../services/ai";
import { formatAiMoney as formatVNDCurrency } from "../utils/aiPresentation";
import { useI18n } from "../i18n";
import { formatDateVN } from "../utils/date";
import type { SimulatePlanResponse } from "../services/plans";
import { ApiError } from "../services/api";
import "./ai-assistant.css";

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
  const [planDetailsOpen, setPlanDetailsOpen] = useState(false);
  const { language } = useI18n();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profileRevision, v2Profile } = useFinancialProfile();
  const { activePlan, currentVersion, loadingPlans } = useRetirementPlan();

  const [inputPrompt, setInputPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const requestEpoch = useRef(0);
  const sending = useRef(false);
  const pendingRequest = useRef<{ command: AiExplainCommand; key: string } | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyEpoch = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editedQuestion, setEditedQuestion] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  useEffect(() => () => { requestEpoch.current++; }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 44), 180)}px`;
    }
  }, [inputPrompt]);

  // Privacy & Consent state
  const [privacyLoading, setPrivacyLoading] = useState(true);
  const [privacyError, setPrivacyError] = useState(false);
  const [privacy, setPrivacy] = useState<AiPrivacyResponse | null>(null);
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [updatingConsent, setUpdatingConsent] = useState(false);

  const processingNotice = privacy?.processingNotice;

  // Conversations state
  const [conversations, setConversations] = useState<AiConversationItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationRevision, setConversationRevision] = useState<number>(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const historyPanelRef = useRef<HTMLElement>(null);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (drawerOpen) historyCloseRef.current?.focus({ preventScroll: true });
    else if (historyPanelRef.current?.contains(document.activeElement)) historyToggleRef.current?.focus({ preventScroll: true });
  }, [drawerOpen]);
  const closeHistory = () => {
    setDrawerOpen(false);
    historyToggleRef.current?.focus({ preventScroll: true });
  };
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // What-if simulation modal state
  const [whatIfModalOpen, setWhatIfModalOpen] = useState(false);
  const [whatIfRetirementMonth, setWhatIfRetirementMonth] = useState("");
  const [whatIfMonthlyContribution, setWhatIfMonthlyContribution] = useState("");
  const [whatIfMonthlyExpense, setWhatIfMonthlyExpense] = useState("");
  const [simulationError, setSimulationError] = useState("");
  const simulationEpoch = useRef(0);
  const [whatIfSimulating, setWhatIfSimulating] = useState(false);
  const [whatIfResult, setWhatIfResult] = useState<SimulatePlanResponse | null>(null);

  // Initial welcome message
  const initialMessage = useMemo<ChatMessage>(() => ({
    id: "m-init-assistant",
    role: "assistant",
    content: language === "en"
      ? "Hello! I am your An Huu explanation assistant. I help explain calculation results, forecasting rules, and regulatory knowledge sources in your retirement plan. Responses are grounded in actual model data without altering your official plan."
      : "Xin chào! Tôi giúp bạn hiểu tiền cần có khi nghỉ hưu, tháng nào có thể thiếu tiền và các khoản cần góp thêm. Bạn có thể hỏi về kế hoạch đã lưu hoặc mở phần thử thay đổi kế hoạch để tính lại. Tôi không tự sửa hồ sơ hay áp dụng thay đổi.",
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
    setPrivacyLoading(true);
    setPrivacyError(false);
    try {
      const p = await getAiPrivacy();
      setPrivacy(p);
      if (!p.processing || p.reconsentRequired || (p.acceptedPolicyVersion && p.policyVersion && p.acceptedPolicyVersion !== p.policyVersion)) {
        setConsentModalOpen(true);
      }
    } catch {
      setPrivacy(null);
      setPrivacyError(true);
    } finally {
      setPrivacyLoading(false);
    }
  };

  // Load conversation list
  const loadConversations = async (page = 1) => {
    const epoch = ++historyEpoch.current;
    setHistoryError("");
    try {
      const res = await listAiConversations(page, 20);
      if (epoch !== historyEpoch.current) return;
      setConversations(previous => page === 1 ? res.items : [...previous.filter(item => !res.items.some(next => next.id === item.id)), ...res.items]);
      setHistoryTotal(res.total);
      setHistoryPage(page);
    } catch {
      if (epoch !== historyEpoch.current) return;
      setHistoryError(language === "en" ? "Could not load conversations. Please retry." : "Chưa tải được hội thoại. Hãy thử lại.");
    }
  };

  useEffect(() => {
    loadPrivacy();
    loadConversations();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: messages.some(message => message.id !== "m-init-assistant") ? scrollRef.current.scrollHeight : 0,
        behavior: "auto",
      });
    }
  }, [messages, isTyping]);

  const handleConsent = async (processing: boolean, saveHistory: boolean) => {
    if (!privacy) return;
    setUpdatingConsent(true);
    try {
      const updated = await updateAiPrivacy({
        expectedRevision: privacy.revision,
        policyVersion: privacy.policyVersion || AI_POLICY_VERSION,
        processing,
        saveHistory,
      });
      setPrivacy(updated);
      requestEpoch.current++;
      sending.current = false;
      pendingRequest.current = null;
      setIsTyping(false);
      if (!updated.saveHistory) {
        historyEpoch.current++;
        setConversations([]); setHistoryTotal(0); setCurrentConversationId(null); setConversationRevision(0); setMessages([initialMessage]);
      }
      setConsentModalOpen(false);
      notify.success(
        language === "en" ? "Preferences Saved" : "Đã lưu tùy chọn",
        language === "en" ? "Updated AI data processing preferences." : "Đã cập nhật tùy chọn xử lý dữ liệu của trợ lý."
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "REVISION_CONFLICT") await loadPrivacy();
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not update preferences." : "Không thể cập nhật tùy chọn.");
      notify.error(language === "en" ? "Update Error" : "Lỗi cập nhật", msg);
    } finally {
      setUpdatingConsent(false);
    }
  };

  const handleSelectConversation = async (id: string) => {
    const epoch = ++requestEpoch.current;
    sending.current = false; pendingRequest.current = null; setIsTyping(false); setConversationLoading(true);
    try {
      const detail = await getAiConversation(id);
      if (epoch !== requestEpoch.current) return;
      setCurrentConversationId(detail.id);
      setConversationRevision(detail.revision);
      const loaded: ChatMessage[] = detail.messages.map((m) => {
        const parsedContext = m.context as { response?: { facts?: AiFact[]; citations?: AiCitation[]; provenance?: AiProvenance; status?: string } } | undefined;
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          time: new Date(m.createdAt).toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
          facts: parsedContext?.response?.facts,
          citations: m.citedSources || parsedContext?.response?.citations,
          provenance: parsedContext?.response?.provenance,
          status: parsedContext?.response?.status,
        };
      });
      setMessages(loaded.length > 0 ? loaded : [initialMessage]);
      setDrawerOpen(false);
    } catch (e) {
      if (epoch !== requestEpoch.current) return;
      if (e instanceof ApiError && e.status === 404) {
        setCurrentConversationId(null); setConversationRevision(0); setMessages([initialMessage]);
        void loadConversations();
      }
      notify.error(
        language === "en" ? "Failed to Load Conversation" : "Lỗi tải hội thoại",
        e instanceof Error ? e.message : (language === "en" ? "Could not load conversation." : "Không thể tải hội thoại.")
      );
    } finally { if (epoch === requestEpoch.current) setConversationLoading(false); }
  };

  const handleNewConversation = async () => {
      requestEpoch.current++; sending.current = false; pendingRequest.current = null;
      setIsTyping(false); setConversationLoading(false);
      setCurrentConversationId(null);
      setConversationRevision(0);
      setMessages([initialMessage]);
      setInputPrompt("");
      setDrawerOpen(false);
  };

  const handleRename = async (id: string, rev: number) => {
    if (!newTitle.trim()) return;
    try {
      await renameAiConversation(id, rev, newTitle.trim());
      if (id === currentConversationId) setConversationRevision(rev + 1);
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
    setDeleting(true);
    try {
      if (id === "ALL") await clearAllAiConversations(); else await deleteAiConversation(id);
      await loadConversations();
      await loadPrivacy();
      if (id === "ALL" || currentConversationId === id) {
        handleNewConversation();
      }
      setDeleteTarget(null);
      notify.success(
        language === "en" ? "Deleted" : "Đã xóa",
        language === "en" ? "Conversation deleted." : "Đã xóa cuộc trò chuyện."
      );
    } catch (e) {
      notify.error(
        language === "en" ? "Delete Error" : "Lỗi xóa",
        e instanceof Error ? e.message : (language === "en" ? "Could not delete." : "Không thể xóa.")
      );
    } finally { setDeleting(false); }
  };

  const handleEditMessage = async () => {
    if (!currentConversationId || !editingMessage || !editedQuestion.trim()) return;
    setSavingEdit(true);
    try {
      await editAiMessage(currentConversationId, editingMessage.id, conversationRevision, editedQuestion.trim());
      await handleSelectConversation(currentConversationId);
      setInputPrompt(editedQuestion.trim()); setEditingMessage(null);
      notify.info(language === "en" ? "Question updated" : "Đã sửa câu hỏi", language === "en" ? "The old answer was removed. Send the edited question for a new answer." : "Đã bỏ câu trả lời cũ. Bấm gửi câu hỏi đã sửa để nhận câu trả lời mới.");
    } catch (e) { notify.error(language === "en" ? "Could not edit" : "Chưa sửa được", e instanceof Error ? e.message : ""); }
    finally { setSavingEdit(false); }
  };

  const handleSend = async (textToSend?: string) => {
    const question = (textToSend || inputPrompt).trim();
    if (!question || sending.current || conversationLoading || loadingPlans || privacyLoading || privacyError || !privacy) return;
    if (question.length > 2000) {
      notify.error(language === "en" ? "Question too long" : "Câu hỏi quá dài", language === "en" ? "Please keep your question within 2,000 characters." : "Vui lòng rút gọn câu hỏi còn tối đa 2.000 ký tự.");
      return;
    }

    if (!privacy.processing || privacy.reconsentRequired || (privacy.acceptedPolicyVersion && privacy.policyVersion && privacy.acceptedPolicyVersion !== privacy.policyVersion)) {
      setConsentModalOpen(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      role: "user",
      content: question,
      time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    const epoch = requestEpoch.current;
    sending.current = true;
    if (pendingRequest.current?.command.question !== question) setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) {
      setInputPrompt("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "44px";
      }
    }
    setIsTyping(true);

    try {
      let conversationId = privacy.saveHistory ? currentConversationId : null;
      let revision = conversationRevision;
      if (privacy.saveHistory && !conversationId) {
        const conversation = await createAiConversation();
        if (epoch !== requestEpoch.current) return;
        conversationId = conversation.id;
        revision = conversation.revision;
        setCurrentConversationId(conversationId);
        setConversationRevision(revision);
      }
      const command: AiExplainCommand = {
        question,
        // A draft plan has no applied version. Send neither ID in that case.
        ...(activePlan && currentVersion ? { planId: activePlan.id, versionId: currentVersion.id } : {}),
        ...(conversationId ? { conversationId, expectedRevision: revision } : {}),
      };
      if (JSON.stringify(pendingRequest.current?.command) !== JSON.stringify(command)) pendingRequest.current = { command, key: crypto.randomUUID() };
      const res = await explainRetirementPlan(command, pendingRequest.current!.key);
      if (epoch !== requestEpoch.current) return;
      pendingRequest.current = null;

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
      if (epoch !== requestEpoch.current) return;
      let recoveryEpoch = epoch;
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not get response from assistant." : "Không thể nhận phản hồi từ trợ lý.");
      if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
        await loadPrivacy();
        if (epoch !== requestEpoch.current) return;
        setConsentModalOpen(true);
      }
      if (e instanceof ApiError && (e.status === 404 || ["REVISION_CONFLICT", "AI_PRIVACY_CHANGED"].includes(e.code))) {
        pendingRequest.current = null;
        if (e.status === 404) { setCurrentConversationId(null); setConversationRevision(0); }
        else if (currentConversationId) {
          const recovery = handleSelectConversation(currentConversationId);
          recoveryEpoch = requestEpoch.current;
          await recovery;
        }
        await loadPrivacy();
      }
      if (recoveryEpoch !== requestEpoch.current) return;
      const errorMsg: ChatMessage = {
        id: `m-${Date.now() + 1}`,
        role: "assistant",
        content: language === "en"
          ? `Your question could not be answered: ${msg}`
          : `Chưa thể trả lời câu hỏi: ${msg}`,
        time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setInputPrompt(previous => previous || question);
    } finally {
      if (epoch === requestEpoch.current) { sending.current = false; setIsTyping(false); }
    }
  };

  const handleSelectSuggestion = (text: string) => {
    if (!inputPrompt.trim()) {
      setInputPrompt(text);
    } else {
      notify.info(
        language === "en" ? "Draft preserved" : "Đã giữ câu đang soạn",
        language === "en"
          ? "Appended suggested question to your draft."
          : "Đã nối thêm câu hỏi gợi ý vào nội dung đang soạn."
      );
      setInputPrompt((prev) => `${prev.trim()}\n${text}`);
    }
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const openSimulation = () => {
    simulationEpoch.current++;
    setWhatIfResult(null); setSimulationError(""); setWhatIfSimulating(false);
    setWhatIfRetirementMonth(currentVersion?.preview.calculation?.summary.retirementMonth ?? "");
    setWhatIfMonthlyContribution(currentVersion?.preview.selection.monthlyContribution ?? "");
    setWhatIfMonthlyExpense(currentVersion?.preview.selection.monthlyExpenseToday ?? "");
    setWhatIfModalOpen(true);
  };
  const handleRunWhatIfSimulation = async () => {
    if (!activePlan?.id || !currentVersion?.id) {
      notify.error(
        language === "en" ? "No Plan Available" : "Chưa có kế hoạch",
        language === "en" ? "An active official plan version is required to run what-if simulations." : "Cần một phiên bản kế hoạch chính thức để mô phỏng."
      );
      return;
    }

    const moneyPattern = /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(whatIfRetirementMonth) || !moneyPattern.test(whatIfMonthlyContribution) || !moneyPattern.test(whatIfMonthlyExpense) || profileRevision < 1) {
      setSimulationError(language === "en" ? "Enter a retirement month and non-negative amounts (up to two decimal places)." : "Hãy nhập tháng nghỉ hưu và số tiền không âm, tối đa hai chữ số sau dấu chấm. Số 0 là hợp lệ.");
      return;
    }
    const epoch = ++simulationEpoch.current;
    setWhatIfSimulating(true);
    setSimulationError("");
    setWhatIfResult(null);

    try {
      const res = await simulateViaAi({
        planId: activePlan.id,
        versionId: currentVersion.id,
        expectedProfileRevision: profileRevision,
        changes: {
          retirementMonth: whatIfRetirementMonth,
          monthlyContribution: whatIfMonthlyContribution,
          monthlyExpenseToday: whatIfMonthlyExpense,
        },
      });
      if (epoch !== simulationEpoch.current) return;
      setWhatIfResult(res);
      if (res.candidate.status !== "READY") {
        setSimulationError(language === "en" ? "This change cannot be calculated yet. Review the missing data in your plan." : "Chưa đủ dữ liệu để tính thay đổi này. Hãy kiểm tra các mục còn thiếu trong kế hoạch.");
        return;
      }

    } catch (e) {
      if (epoch !== simulationEpoch.current) return;
      setSimulationError(e instanceof Error ? e.message : "Chưa thể tính. Hãy thử lại.");
      notify.error(
        language === "en" ? "Simulation Error" : "Lỗi mô phỏng",
        e instanceof Error ? e.message : (language === "en" ? "Could not run simulation." : "Không thể chạy mô phỏng.")
      );
    } finally {
      if (epoch === simulationEpoch.current) setWhatIfSimulating(false);
    }
  };

  const isEn = language === "en";
  const hasMessages = messages.some(message => message.id !== "m-init-assistant");
  const canSimulate = !!currentVersion && !currentVersion.preview.reforecast;
  const suggestions = [
    { title: isEn ? "Will my retirement fund be enough?" : "Tiền nghỉ hưu của tôi có đủ không?", description: isEn ? "Compare the projected fund with what you need." : "Hiểu số tiền dự kiến có và số tiền cần chuẩn bị.", question: isEn ? "Explain how much of my retirement needs my projected fund covers." : "Tiền dự kiến có đáp ứng bao nhiêu phần trăm số tiền cần khi nghỉ hưu?" },
    { title: isEn ? "How much more should I contribute?" : "Tôi cần góp thêm bao nhiêu?", description: isEn ? "Understand the contribution in your saved plan." : "Xem khoản góp thêm theo kế hoạch đã lưu.", question: isEn ? "Explain the additional monthly contribution in my saved plan." : "Giải thích số tiền cần góp thêm mỗi tháng theo kế hoạch đã lưu của tôi." },
    { title: isEn ? "When might I run short?" : "Khi nào tôi có thể thiếu tiền?", description: isEn ? "Find the first projected shortfall month." : "Hiểu thời điểm quỹ dự kiến không đủ chi tiêu.", question: isEn ? "When does my saved plan first project a shortfall?" : "Theo kế hoạch đã lưu, tháng nào tôi bắt đầu thiếu tiền và con số đó có ý nghĩa gì?" },
  ];

  const historyList = <div className="ai-history-list">
    {historyError && <div role="alert"><p>{historyError}</p><Button onClick={() => loadConversations()}>{isEn ? "Retry" : "Tải lại hội thoại"}</Button></div>}
    {conversations.length === 0 && <p className="ai-history-empty">{privacy?.saveHistory ? (isEn ? "Your saved conversations will appear here." : "Hội thoại đã lưu sẽ xuất hiện ở đây.") : (isEn ? "History is off. You can turn it on in privacy settings." : "Bạn đang tắt lưu lịch sử. Có thể bật trong Quyền riêng tư.")}</p>}
    {conversations.map(c => <div key={c.id} className={`ai-history-item ${c.id === currentConversationId ? "is-active" : ""}`}>
      {renamingId === c.id ? <div className="ai-history-rename">
        <input aria-label="Tên hội thoại" className="input" maxLength={120} value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus />
        <Button size="small" onClick={() => handleRename(c.id, c.revision)}>{isEn ? "Save" : "Lưu"}</Button>
        <Button size="small" variant="ghost" onClick={() => setRenamingId(null)}>{isEn ? "Cancel" : "Hủy"}</Button>
      </div> : <>
        <button type="button" className="ai-history-open" aria-current={c.id === currentConversationId ? "true" : undefined} onClick={() => handleSelectConversation(c.id)} title={c.title}><span>{c.title}</span><small>{formatDateVN(c.createdAt)}</small></button>
        <div className="ai-history-tools"><IconButton icon="edit" label={isEn ? "Rename" : "Đổi tên"} onClick={() => { setRenamingId(c.id); setNewTitle(c.title); }} /><IconButton icon="trash" label={isEn ? "Delete" : "Xóa"} onClick={() => setDeleteTarget(c.id)} /></div>
      </>}
    </div>)}
    {conversations.length < historyTotal && <Button variant="ghost" onClick={() => loadConversations(historyPage + 1)}>{isEn ? "Load more" : "Xem thêm hội thoại"}</Button>}
    {historyTotal > 0 && <button className="ai-history-clear" onClick={() => setDeleteTarget("ALL")}>{isEn ? "Delete all history" : "Xóa toàn bộ lịch sử"}</button>}
  </div>;

  return (
    <div className="ai-chat-page">
      <div className={`ai-chat-workspace ${!hasMessages && !conversationLoading ? "is-empty" : "has-messages"}`}>
        <header className="ai-chat-header">
          <div className="ai-chat-heading"><h1>{isEn ? "An Huu assistant" : "Trợ lý An Hưu"}</h1></div>
          <div className="ai-chat-actions">
            <button className="ai-plan-trigger" type="button" title={isEn ? "View the retirement plan used for answers" : "Xem kế hoạch nghỉ hưu dùng để trả lời"} aria-haspopup="dialog" onClick={() => setPlanDetailsOpen(true)}><Icon name="file-text" size="small" /><span>{isEn ? "Retirement plan" : "Kế hoạch nghỉ hưu"}</span><span className="ai-plan-version">{loadingPlans ? (isEn ? "Loading…" : "Đang tải…") : currentVersion ? (isEn ? `V${currentVersion.version}` : `Bản ${currentVersion.version}`) : (isEn ? "Not set" : "Chưa có")}</span><Icon name="chevron-down" size="small" /></button>
            <button ref={historyToggleRef} className="ai-history-toggle" type="button" aria-label={isEn ? "Chat history" : "Lịch sử chat"} aria-expanded={drawerOpen} aria-controls="ai-saved-conversations" onClick={() => setDrawerOpen(open => !open)}><Icon name="message" size="small" /><span>{isEn ? "Chat history" : "Lịch sử chat"}</span></button>
          </div>
        </header>
        <div className="ai-chat-body">
        <div className="ai-chat-stage">
          {!hasMessages && !conversationLoading && <section className="ai-chat-welcome"><span className="ai-welcome-kicker">{isEn ? "YOUR RETIREMENT, EXPLAINED" : "HIỂU KẾ HOẠCH, AN TÂM NGHỈ HƯU"}</span><h2>{isEn ? "What would you like to understand?" : "Bạn muốn hiểu rõ điều gì?"}</h2><p>{isEn ? "Let's walk through your retirement plan, one question at a time." : "Cùng bạn giải đáp từng câu hỏi về kế hoạch nghỉ hưu."}</p></section>}
      <div className="ai-chat-feed" ref={scrollRef} aria-busy={isTyping || conversationLoading}>
        <div className="ai-chat-content">
          {conversationLoading && <p role="status" className="ai-chat-notice">{isEn ? "Opening conversation…" : "Đang mở hội thoại…"}</p>}
          {messages.filter(message => message.id !== "m-init-assistant").map(msg => <article key={msg.id} className={`ai-chat-message ${msg.role}`}>
            <div className="ai-chat-message-meta"><strong>{msg.role === "user" ? (isEn ? "You" : "Bạn") : (isEn ? "An Huu assistant" : "Trợ lý An Hưu")}</strong><span>{msg.time}</span></div>
            <div className="ai-chat-message-body">{msg.content.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            {msg.status === "PROVIDER_UNAVAILABLE" && <p className="ai-chat-response-note">{isEn ? "Gemini is unavailable. This explanation uses system data." : "Gemini đang gián đoạn. Câu trả lời này được tạo từ dữ liệu hệ thống."}</p>}
            {msg.status === "PROVIDER_NOT_CONFIGURED" && <p className="ai-chat-response-note">{isEn ? "Explanation from system data." : "Giải thích từ số liệu hệ thống."}</p>}
            {!!msg.citations?.length && <details className="ai-chat-sources"><summary>{isEn ? "Reference documents" : "Tài liệu được dùng"} ({msg.citations.length})</summary>
              {msg.citations.map(citation => <div key={citation.id}><strong>{citation.title}</strong><small>{isEn ? "Version" : "Bản"} {citation.version} · {isEn ? "Effective" : "Hiệu lực"}: {formatDateVN(citation.effectiveDate)}</small><blockquote>{citation.excerpt}</blockquote>
                {citation.url?.startsWith("https://") && <a href={citation.url} target="_blank" rel="noreferrer">{isEn ? "Read original document" : "Đọc tài liệu gốc"} ↗</a>}
              </div>)}
            </details>}
            {msg.provenance && <p className="ai-chat-provenance">{isEn ? "Based on saved plan data dated" : "Theo số liệu kế hoạch đã lưu ngày"} {formatDateVN(msg.provenance.valuationDate)}{msg.provenance.valueKind === "REFORECAST" ? (isEn ? " · Updated forecast" : " · Dự báo cập nhật từ thực tế") : ""}.</p>}
            {msg.role === "user" && currentConversationId && /^[0-9a-f-]{36}$/i.test(msg.id) && <Button variant="ghost" size="small" disabled={isTyping} onClick={() => { setEditingMessage(msg); setEditedQuestion(msg.content); }}>{isEn ? "Edit question" : "Sửa câu hỏi"}</Button>}
          </article>)}
          {isTyping && <div className="ai-chat-pending" role="status"><span className="ai-chat-loading" aria-hidden="true" />{isEn ? "Preparing your explanation…" : "Đang chuẩn bị câu trả lời…"}</div>}
        </div>
      </div>

      <div className="ai-chat-bottom">
        <div className="ai-chat-composer-wrap">
          {(privacyLoading || privacyError) && <div className="assistant-send-status" role="status"><span>{privacyLoading ? (isEn ? "Checking permissions. You can keep drafting." : "Đang tải quyền xử lý. Bạn vẫn có thể soạn câu hỏi.") : (isEn ? "Could not load permissions. Your draft is kept." : "Chưa tải được quyền xử lý. Câu hỏi được giữ lại; hãy thử lại trước khi gửi.")}</span>{privacyError && <Button variant="secondary" onClick={loadPrivacy}>{isEn ? "Retry permissions" : "Tải lại quyền xử lý"}</Button>}</div>}
          {!privacyLoading && !privacyError && privacy && !privacy.providerConfigured && <p className="assistant-send-status">{isEn ? "External AI is not connected. Answers use system plan data." : "Chưa kết nối AI ngoài. Hiện trợ lý giải thích từ số liệu kế hoạch."}</p>}
          <form className="ai-chat-composer" onSubmit={event => { event.preventDefault(); void handleSend(); }}>
            <label className="sr-only" htmlFor="ai-chat-question">{isEn ? "Question for AI assistant" : "Câu hỏi dành cho trợ lý AI"}</label>
            <textarea id="ai-chat-question" ref={textareaRef} placeholder={isEn ? "For example: How much more should I contribute each month?" : "Bạn muốn hỏi gì về kế hoạch nghỉ hưu?"} value={inputPrompt} onChange={event => setInputPrompt(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSend(); } }} rows={2} maxLength={2000} disabled={isTyping} />
            <div className="ai-chat-composer-actions"><span className="ai-chat-shortcut">{isEn ? "Enter to send · Shift + Enter for a new line" : "Enter để gửi · Shift + Enter để xuống dòng"}</span>
              <div>{inputPrompt.trim() && !isTyping && <button type="button" className="ai-chat-clear" onClick={() => { setInputPrompt(""); textareaRef.current?.focus(); }}>{isEn ? "Clear question" : "Xóa câu hỏi"}</button>}
                <button type="submit" className="ai-chat-send" disabled={!inputPrompt.trim() || isTyping || conversationLoading || loadingPlans || privacyLoading || privacyError || !privacy}>{isTyping ? (isEn ? "Processing…" : "Đang xử lý…") : (isEn ? "Send question" : "Gửi câu hỏi")}<Icon name="arrow-right" size="small" /></button>
              </div>
            </div>
          </form>
          <p className="ai-chat-limits">{isEn ? "The assistant explains projected figures. It does not change your plan or guarantee investment returns." : "Trợ lý giải thích số liệu dự báo, không tự sửa kế hoạch hay cam kết lợi nhuận."}</p>
        </div>
      </div>


          {!hasMessages && !conversationLoading && <div className="ai-chat-suggestions" aria-label={isEn ? "Suggested questions" : "Câu hỏi gợi ý"}>{suggestions.map(suggestion => <button key={suggestion.title} type="button" onClick={() => handleSelectSuggestion(suggestion.question)}>{suggestion.title}</button>)}</div>}
        </div>
        <p className="ai-workspace-note">{isEn ? "An Huu helps you understand your plan. Check the figures before making a decision." : "An Hưu giúp bạn hiểu kế hoạch. Hãy kiểm tra số liệu trước khi quyết định."}</p>
          <aside id="ai-saved-conversations" ref={historyPanelRef} className={`ai-history-panel ${drawerOpen ? "is-open" : ""}`} aria-labelledby="ai-history-title" aria-hidden={!drawerOpen} inert={!drawerOpen} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeHistory(); } }}>
            <div className="ai-history-panel-header"><h2 id="ai-history-title">{isEn ? "Saved conversations" : "Hội thoại đã lưu"}</h2><button ref={historyCloseRef} type="button" className="ai-history-close" aria-label={isEn ? "Close conversation history" : "Đóng danh sách hội thoại"} onClick={closeHistory}><Icon name="x" size="small" /></button></div>
            <Button variant="secondary" onClick={handleNewConversation}><Icon name="pen" size="small" />{isEn ? "New conversation" : "Cuộc trò chuyện mới"}</Button>
            {historyList}
            <div className="ai-sidebar-bottom"><Button variant="ghost" disabled={privacyLoading || privacyError} onClick={() => { setDrawerOpen(false); setConsentModalOpen(true); }}>{isEn ? "Privacy & history" : "Quyền riêng tư & lịch sử"}</Button></div>
          </aside>
        </div>
      </div>
      <Modal className="ai-plan-dialog" open={planDetailsOpen} onClose={() => setPlanDetailsOpen(false)} title={isEn ? "Plan used for answers" : "Kế hoạch dùng để trả lời"}>
      <section className="ai-chat-plan" aria-label={isEn ? "Plan used for new questions" : "Kế hoạch dùng cho câu hỏi mới"}>
        <div className="ai-chat-plan-copy">
          <Icon name="file-text" />
          <div><strong className="ai-chat-plan-name">{loadingPlans ? (isEn ? "Loading your plan…" : "Đang tải kế hoạch…") : currentVersion ? (isEn ? `Using plan version ${currentVersion.version}` : `Đang dùng kế hoạch phiên bản ${currentVersion.version}`) : (isEn ? "No applied plan yet" : "Bạn chưa có kế hoạch đang áp dụng")}</strong>
            <p>{currentVersion ? (isEn ? "Answers use this saved version, including its assumptions." : "Trả lời theo số liệu của bản đã lưu, gồm cả các giả định trong bản này.") : (isEn ? "Save and apply a plan to explain your own figures." : "Cần lưu và áp dụng kế hoạch để giải thích số tiền của bạn.")}</p>
          </div>
        </div>
        <div className="ai-chat-plan-actions">
          <Link to={activePlan ? "/user/plan" : "/user/goal"}>{currentVersion ? (isEn ? "View plan" : "Xem kế hoạch") : (isEn ? "Set up plan" : "Lập kế hoạch")}</Link>
          {canSimulate && <Button variant="secondary" onClick={() => { setPlanDetailsOpen(false); openSimulation(); }}>{isEn ? "Try plan changes" : "Thử thay đổi kế hoạch"}</Button>}
          {!!currentVersion?.preview.reforecast && <Link to="/user/simulation">{isEn ? "Open updated forecast" : "Mở mô phỏng từ số liệu thực tế"}</Link>}
        </div>
      </section>


      </Modal>
      <Modal open={consentModalOpen} onClose={() => { if (!updatingConsent) setConsentModalOpen(false); }} title={isEn ? "Privacy & conversation history" : "Quyền riêng tư & lịch sử"}>
        <div className="ai-chat-privacy">
          <p>{processingNotice || (isEn ? "Questions, plan summary figures and approved excerpts may be sent to Google Gemini to prepare an explanation." : "Câu hỏi, số liệu tóm tắt kế hoạch và trích đoạn tài liệu đã duyệt có thể được gửi tới Google Gemini để hỗ trợ giải thích.")}</p>
          <p>{isEn ? "Do not include passwords, identity numbers or sensitive personal details in a question." : "Không nhập mật khẩu, số giấy tờ hoặc thông tin cá nhân nhạy cảm vào câu hỏi."}</p>
          <h3>{isEn ? "Choose how to keep your conversations" : "Bạn muốn lưu hội thoại như thế nào?"}</h3>
          <p>{isEn ? "Saved conversations can be reviewed for 30 days from creation. You can delete them at any time." : "Hội thoại được lưu có thể xem lại trong 30 ngày kể từ lúc tạo. Bạn có thể xóa bất cứ lúc nào."}</p>
          {privacy?.saveHistory && <p className="ai-chat-privacy-warning" role="note">{isEn ? "Choosing no history or declining will delete all saved conversations on An Huu." : "Chọn không lưu hoặc từ chối sẽ xóa toàn bộ hội thoại đã lưu trên An Hưu."}</p>}
          <div className="ai-chat-privacy-choices">
            <Button disabled={updatingConsent || !privacy} onClick={() => handleConsent(true, true)}>{isEn ? "Allow & save history (30 days)" : "Đồng ý & Lưu lịch sử (30 ngày)"}</Button>
            <Button variant="secondary" disabled={updatingConsent || !privacy} onClick={() => handleConsent(true, false)}>{isEn ? "Allow without saving history" : "Đồng ý, không lưu lịch sử"}</Button>
            <Button variant="ghost" disabled={updatingConsent || !privacy} onClick={() => handleConsent(false, false)}>{isEn ? "Decline processing" : "Từ chối xử lý"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={whatIfModalOpen} onClose={() => { simulationEpoch.current++; setWhatIfModalOpen(false); setWhatIfSimulating(false); }} title={language === "en" ? "Try plan changes" : "Thử thay đổi kế hoạch"}>
        <div className="ai-simulation-form">
          <p>Các giá trị dưới đây lấy từ phiên bản đang áp dụng. Kết quả thử không tự lưu hoặc thay đổi kế hoạch của bạn.</p>
          <label htmlFor="ai-retirement-month">Tháng bắt đầu nghỉ hưu</label>
          <input id="ai-retirement-month" type="month" className="input" value={whatIfRetirementMonth}
            min={v2Profile?.valuationDate.slice(0, 7)} max={currentVersion?.preview.selection.endMonth}
            disabled={whatIfSimulating} onChange={e => { setWhatIfRetirementMonth(e.target.value); setWhatIfResult(null); }} />
          <label htmlFor="ai-contribution">Tiền góp mỗi tháng (đồng)</label>
          <input id="ai-contribution" className="input" inputMode="decimal" value={whatIfMonthlyContribution}
            disabled={whatIfSimulating} onChange={e => { setWhatIfMonthlyContribution(e.target.value); setWhatIfResult(null); }} />
          <label htmlFor="ai-expense">Chi tiêu mỗi tháng khi nghỉ hưu, theo giá hôm nay (đồng)</label>
          <input id="ai-expense" className="input" inputMode="decimal" value={whatIfMonthlyExpense}
            disabled={whatIfSimulating} onChange={e => { setWhatIfMonthlyExpense(e.target.value); setWhatIfResult(null); }} />
          <p>Nhập số tiền không có dấu phân cách hàng nghìn. Có thể nhập 0; để trống là chưa nhập.</p>
          {simulationError && <p role="alert">{simulationError}</p>}
          <Button variant="primary" loading={whatIfSimulating} disabled={!currentVersion || !!currentVersion.preview.reforecast} onClick={handleRunWhatIfSimulation}>Tính phương án thử</Button>
          {whatIfResult?.candidate.status === "READY" && whatIfResult.candidate.calculation && (
            <section aria-label="Kết quả mô phỏng">
              <h3>Kết quả theo giá trị tại ngày lập số liệu</h3>
              <p>Kế hoạch đang áp dụng: {formatDateVN(whatIfResult.baseline.preview.valuationDate)}. Phương án thử: {formatDateVN(whatIfResult.candidate.valuationDate)}.</p>
              <table className="ai-comparison-table"><thead><tr><th>Khoản tiền</th><th>Đang áp dụng</th><th>Phương án thử</th><th>Chênh lệch</th></tr></thead>
                <tbody>{([
                  ["Tiền dự kiến có", "projectedFund", "projectedFundAtValuation"],
                  ["Tiền cần có", "requiredFund", "requiredFundAtValuation"],
                  ["Thiếu hụt (âm là dư)", "fundingGap", "fundingGapAtValuation"],
                ] as const).map(([label, field, delta]) => <tr key={field}><th>{label}</th>
                  <td>{formatVNDCurrency(whatIfResult.baseline.preview.calculation?.summary.atValuation[field] ?? null)}</td>
                  <td>{formatVNDCurrency(whatIfResult.candidate.calculation!.summary.atValuation[field])}</td>
                  <td>{formatVNDCurrency(whatIfResult.comparison.delta?.[delta] ?? null)}</td></tr>)}</tbody>
              </table>
              {whatIfResult.comparison.status !== "COMPARABLE" && <p>Hai phương án khác cơ sở tính nên chưa thể lấy chênh lệch trực tiếp.</p>}
              <p>Tháng bắt đầu thiếu tiền: {whatIfResult.candidate.calculation.summary.firstShortfallMonth ?? "Chưa thấy trong thời gian đã tính"}.</p>
              <Button variant="secondary" onClick={() => { setWhatIfModalOpen(false); navigate("/user/simulation"); }}>Mở trang mô phỏng để lập và lưu phương án</Button>
            </section>
          )}
        </div>
      </Modal>
      <Modal open={deleteTarget !== null} onClose={() => { if (!deleting) setDeleteTarget(null); }} title={deleteTarget === "ALL" ? "Xóa toàn bộ lịch sử?" : "Xóa hội thoại này?"}>
        <p>Nội dung đã xóa không thể khôi phục. Hồ sơ tài chính và kế hoạch của bạn vẫn được giữ nguyên.</p>
        <Button variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Giữ lại</Button>
        <Button variant="primary" loading={deleting} onClick={() => deleteTarget && handleDelete(deleteTarget)}>Xác nhận xóa</Button>
      </Modal>
      <Modal open={editingMessage !== null} onClose={() => { if (!savingEdit) setEditingMessage(null); }} title="Sửa câu hỏi đã lưu">
        <p>Câu trả lời cũ của câu hỏi này sẽ được bỏ. Sau khi lưu, bạn có thể gửi lại câu hỏi đã sửa.</p>
        <textarea aria-label="Nội dung câu hỏi đã sửa" className="input" value={editedQuestion} maxLength={2000} onChange={e => setEditedQuestion(e.target.value)} />
        <Button loading={savingEdit} disabled={!editedQuestion.trim()} onClick={handleEditMessage}>Lưu câu hỏi đã sửa</Button>
      </Modal>
    </div>
  );
}
