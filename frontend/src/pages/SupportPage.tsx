import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Icon, Input, Pagination, Select } from "../components/ui";
import "./remaining-user-sync.css";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { authenticatedRequest } from "../services/api";
import { useI18n } from "../i18n";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

type Detail = Ticket & {
  messages: {
    id: string;
    body: string;
    createdAt: string;
    author: { fullName: string; role: string };
  }[];
};

const statusToneMap: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  OPEN: "danger",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export default function SupportPage({ admin = false }: { admin?: boolean }) {
  const { language } = useI18n();
  const isEn = language === "en";

  const base = admin ? "/admin/support" : "/me/support";
  const [params, setParams] = useSearchParams();
  const selected = params.get("ticket");

  const [page, setPage] = useState(1);
  const [statusFilterKey, setStatusFilterKey] = useState("ALL");
  const [categoryFilterKey, setCategoryFilterKey] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<{ items: Ticket[]; total: number; limit: number } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);

  // Form states
  const [confirmCancel,setConfirmCancel]=useState(false);
  const [discardReply,setDiscardReply]=useState(false);
  const [create, setCreate] = useState(false);
  const [subject, setSubject] = useState(admin?"":(params.get("subject")??"").slice(0,200));
  const [category, setCategory] = useState(admin ? "Kế hoạch" : (["Tài khoản","Sử dụng website","Nội dung","Khác"].includes(params.get("category")??"")?params.get("category")!:"Sử dụng website"));
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("OPEN");

  const statesMap: Record<string, string> = useMemo(() => ({
    OPEN: isEn ? "New" : "Mới",
    IN_PROGRESS: isEn ? "In Progress" : "Đang xử lý",
    RESOLVED: isEn ? "Resolved" : "Đã giải quyết",
    CLOSED: isEn ? "Closed" : "Đã đóng",
  }), [isEn]);

  const categoryOptions = useMemo(() => [
    { key: "ALL", label: isEn ? "All categories" : "Tất cả nhóm" },
    { key: "Tư vấn sản phẩm", label: isEn ? "Product consultation" : "Tư vấn sản phẩm" },
    { key: "Tài khoản", label: isEn ? "Account" : "Tài khoản" },
    { key: "Sử dụng website", label: isEn ? "Website Usage" : "Sử dụng website" },
    { key: "Nội dung", label: isEn ? "Content" : "Nội dung" },
    { key: "Khác", label: isEn ? "Other" : "Khác" },
  ], [isEn]);

  const statusFilterOptions = useMemo(() => [
    { key: "ALL", label: isEn ? "All statuses" : "Tất cả" },
    { key: "OPEN", label: statesMap.OPEN },
    { key: "IN_PROGRESS", label: statesMap.IN_PROGRESS },
    { key: "RESOLVED", label: statesMap.RESOLVED },
    { key: "CLOSED", label: statesMap.CLOSED },
  ], [isEn, statesMap]);

  const formCategoryOptions = useMemo(() => admin ? [
    { key: "Tài khoản", label: isEn ? "Account" : "Tài khoản" },
    { key: "Kế hoạch", label: isEn ? "Plan" : "Kế hoạch" },
    { key: "Tư vấn sản phẩm", label: isEn ? "Product consultation" : "Tư vấn sản phẩm" },
    { key: "Khác", label: isEn ? "Other" : "Khác" },
  ] : categoryOptions.filter(row=>row.key!=="ALL"&&row.key!=="Tư vấn sản phẩm"), [isEn,admin,categoryOptions]);

  // Load ticket list
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const query = new URLSearchParams({ page: String(page), limit: "20" });
    if (statusFilterKey !== "ALL") {
      query.set("status", statusFilterKey);
    }
    if (categoryFilterKey !== "ALL") query.set("category", categoryFilterKey);
    if(!admin&&searchTerm.trim())query.set("search",searchTerm.trim());

    authenticatedRequest<{ items: Ticket[]; total: number; limit: number }>(base + "?" + query,undefined,"GET",undefined,{skipCache:true})
      .then((v) => {
        if (active) { setData(v); if(!admin && page>Math.max(1,Math.ceil(v.total/v.limit)))setPage(Math.max(1,Math.ceil(v.total/v.limit))); }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });

    return () => {
      active = false;
    };
  }, [base, page, statusFilterKey, categoryFilterKey, reload, admin ? "" : searchTerm]);

  // Load ticket detail
  useEffect(() => {
    let active = true;
    setDetail(null);
    setDetailError("");
    if (selected) {
      authenticatedRequest<Detail>(base + "/" + encodeURIComponent(selected),undefined,"GET",undefined,{skipCache:true})
        .then((v) => {
          if (active) {
            setDetail(v);
            setStatus(v.status);
          }
        })
        .catch((e) => {
          if (active) setDetailError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [base, selected, reload]);

  useEffect(()=>{setReply("");setConfirmCancel(false);setDiscardReply(false);},[selected]);

  // Create ticket
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setDetailError("");
    try {
      const row = await authenticatedRequest<Ticket>(base, { subject, category, message });
      setCreate(false);
      setSubject("");
      setMessage("");
      setParams({ ticket: row.id });
      setReload((v) => v + 1);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : (isEn ? "Failed to send request." : "Không thể gửi yêu cầu."));
    } finally {
      setBusy(false);
    }
  };

  // Reply message
  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    setDetailError("");
    try {
      await authenticatedRequest(`${base}/${selected}/messages`, { message: reply });
      setReply("");
      setReload((v) => v + 1);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : (isEn ? "Failed to send reply." : "Không thể gửi phản hồi."));
    } finally {
      setBusy(false);
    }
  };

  // Status update
  const updateStatus = async () => {
    if (!detail || busy) return;
    setBusy(true);
    setDetailError("");
    try {
      await authenticatedRequest(
        `${base}/${detail.id}`,
        { expectedRevision: detail.revision, status },
        "PATCH"
      );
      setReload((v) => v + 1);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : (isEn ? "Failed to update status." : "Không thể cập nhật trạng thái."));
    } finally {
      setBusy(false);
    }
  };

  // Client-side search and category filtering
  const visibleItems = useMemo(() => {
    if (!data?.items) return [];
    if(!admin)return data.items;
    return data.items.filter((item) => {
      const matchesCategory =
        categoryFilterKey === "ALL" || item.category === categoryFilterKey;
      const matchesSearch =
        !searchTerm.trim() ||
        item.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [data?.items, categoryFilterKey, searchTerm, admin]);

  // KPI calculations
  const kpiStats = useMemo(() => {
    const items = data?.items || [];
    const openCount = items.filter((t) => t.status === "OPEN").length;
    const inProgressCount = items.filter((t) => t.status === "IN_PROGRESS").length;
    const resolvedCount = items.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;
    return {
      total: data?.total || 0,
      open: openCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
    };
  }, [data]);

  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    categoryOptions.forEach((opt) => {
      map[opt.key] = opt.label;
    });
    return map;
  }, [categoryOptions]);

  return (
    <div className={admin ? "admin-page support-admin-page" : "phase-eight-page"}>
      {/* Page Header */}
      {admin ? (
        <div className="admin-page-header">
          <div>
            <span>{isEn ? "SUPPORT & INTAKE CENTER" : "TRUNG TÂM TIẾP NHẬN & HỖ TRỢ"}</span>
            <h1>{isEn ? "Support & Ticket Management" : "Quản lý hỗ trợ & Ticket"}</h1>
            <p>
              {isEn ? "Track, categorize, and respond directly to member support requests." : "Theo dõi, phân loại và phản hồi trực tiếp các yêu cầu hỗ trợ từ hội viên An Hưu."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Button
              variant="secondary"
              onClick={() => setReload((v) => v + 1)}
            >
              {isEn ? "Refresh" : "Làm mới"}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 8px" }}>
            {isEn ? "Member support & requests" : "Hỗ trợ thành viên"}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--muted, #456B91)", margin: 0 }}>
            {isEn ? "Send support requests and review conversation history." : "Gửi yêu cầu hỗ trợ và xem lại lịch sử phản hồi."}
          </p>
        </div>
      )}

      {/* Admin KPI Summary Grid */}
      {admin && (
        <div className="admin-kpi-grid">
          <Card className="admin-kpi-card">
            <div>
              <span>{isEn ? "Total Requests" : "Tổng yêu cầu"}</span>
              <span className="admin-kpi-icon"><Icon name="life-buoy" /></span>
            </div>
            <strong>{kpiStats.total.toLocaleString(isEn ? "en-US" : "vi-VN")}</strong>
            <small>
              <Icon name="check" size="small" /> {isEn ? "Received by system" : "Hệ thống tiếp nhận"}
            </small>
          </Card>

          <Card className="admin-kpi-card">
            <div>
              <span>{isEn ? "New Requests (Open)" : "Yêu cầu mới (Mở)"}</span>
              <span className="admin-kpi-icon" style={{ color: "var(--color-danger)", background: "rgba(var(--color-danger-rgb), 0.12)" }}>
                <Icon name="alert" />
              </span>
            </div>
            <strong>{kpiStats.open}</strong>
            <small style={{ color: "var(--color-danger)" }}>
              {isEn ? "Requires immediate response" : "Cần phản hồi ngay"}
            </small>
          </Card>

          <Card className="admin-kpi-card">
            <div>
              <span>{isEn ? "In Progress" : "Đang xử lý"}</span>
              <span className="admin-kpi-icon" style={{ color: "var(--color-warning)", background: "var(--color-warning-soft)" }}>
                <Icon name="message" />
              </span>
            </div>
            <strong>{kpiStats.inProgress}</strong>
            <small style={{ color: "var(--color-warning)" }}>
              {isEn ? "Specialist is resolving" : "Chuyên viên đang giải quyết"}
            </small>
          </Card>

          <Card className="admin-kpi-card">
            <div>
              <span>{isEn ? "Completed" : "Đã hoàn tất"}</span>
              <span className="admin-kpi-icon" style={{ color: "var(--color-secondary-700)", background: "var(--color-success-soft)" }}>
                <Icon name="circle-check" />
              </span>
            </div>
            <strong>{kpiStats.resolved}</strong>
            <small style={{ color: "var(--color-secondary-700)" }}>
              {isEn ? "Resolved & closed" : "Đã giải quyết & đóng"}
            </small>
          </Card>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert
          tone="danger"
          title={isEn ? "Cannot load support requests" : "Không thể tải yêu cầu hỗ trợ"}
          action={
            <Button size="small" variant="secondary" onClick={() => setReload((v) => v + 1)}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* MEMBER VIEW: 2 Main Cards (Tạo yêu cầu & Yêu cầu đã ghi) */}
      {!admin ? (
        <div className="support-member-view" style={{ display: "grid", gap: "24px" }}>
          {/* Card 1: Tạo yêu cầu */}
          <Card className="support-create-card" style={{ border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-md, 16px)", padding: "28px", background: "#fff" }}>
            <header style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: 0, color: "var(--navy, #052659)", fontSize: "20px", fontWeight: 700 }}>
                {isEn ? "Create Support Request" : "Tạo yêu cầu"}
              </h2>
            </header>
            {detailError&&!selected&&<p role="alert">{detailError}</p>}
            <form onSubmit={send}>
              <fieldset className="account-api-fields" disabled={busy} style={{ display: "grid", gap: "16px", border: "none", padding: 0, margin: 0 }}>
                <Input
                  label={isEn ? "What do you need support with?" : "Bạn cần hỗ trợ về việc gì?"}
                  placeholder={isEn ? "E.g.: Cannot understand how to read results" : "Ví dụ: chưa hiểu cách đọc kết quả"}
                  value={subject}
                  onChange={setSubject}
                />
                <Select
                  label={isEn ? "Category" : "Nhóm yêu cầu"}
                  value={formCategoryOptions.find((c) => c.key === category)?.label || formCategoryOptions[0].label}
                  options={formCategoryOptions.map((c) => c.label)}
                  onChange={(v) => {
                    const found = formCategoryOptions.find((c) => c.label === v);
                    setCategory(found ? found.key : "Kế hoạch");
                  }}
                />
                <label className="form-field" style={{ display: "grid", gap: "6px" }}>
                  <span className="field-label" style={{ fontSize: "14px", fontWeight: 500, color: "var(--navy, #052659)" }}>{isEn ? "Detailed Message" : "Nội dung"}</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    required
                    style={{ width: "100%", borderRadius: "8px", padding: "10px 14px", border: "1px solid var(--border, #D0E4FE)", font: "inherit", fontSize: "14px" }}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => { setSubject(""); setMessage(""); }}
                    style={{ background: "transparent", border: 0, color: "var(--navy, #052659)", cursor: "pointer", fontSize: "14px" }}
                  >
                    {isEn ? "Cancel" : "Hủy"}
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !subject.trim()}
                    style={{
                      background: "var(--primary, #1D4ED8)",
                      color: "#fff",
                      border: 0,
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontWeight: 600,
                      fontSize: "14px",
                      cursor: busy || !subject.trim() ? "not-allowed" : "pointer",
                      opacity: busy || !subject.trim() ? 0.7 : 1
                    }}
                  >
                    {isEn ? "Send request" : "Gửi yêu cầu"}
                  </button>
                </div>
              </fieldset>
            </form>
          </Card>

          {/* Card 2: Yêu cầu đã ghi */}
          <Card className="support-history-card" style={{ border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-md, 16px)", padding: "28px", background: "#fff" }}>
            <h2 style={{ margin: "0 0 16px", color: "var(--navy, #052659)", fontSize: "20px", fontWeight: 700 }}>
              {isEn ? "Logged Requests" : "Yêu cầu đã ghi"}
            </h2>

            <div className="remaining-form"><label>{isEn?"Search support requests":"Tìm yêu cầu hỗ trợ"}<input value={searchTerm} maxLength={120} onChange={e=>{setSearchTerm(e.target.value);setPage(1);}}/></label></div>
            {error?<Alert tone="danger" title={error}><Button onClick={()=>setReload(n=>n+1)}>{isEn?"Retry":"Thử lại"}</Button></Alert>:!data?<p role="status">{isEn?"Loading requests…":"Đang tải yêu cầu…"}</p>:null}
            {!data||error ? null : visibleItems.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text, #10385b)", fontSize: "14px" }}>
                {isEn ? "No requests recorded." : "Chưa có yêu cầu nào."}
              </p>
            ) : (
              <div className="ledger-list" style={{ display: "grid", gap: "12px" }}>
                {visibleItems.map((t) => (
                  <div
                    key={t.id}
                    className="ledger-row"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 18px",
                      border: "1px solid var(--border, #D0E4FE)",
                      borderRadius: "10px",
                      background: "#F8FAFC"
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "15px", color: "var(--navy, #052659)" }}>{t.subject}</strong>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #64748B)" }}>
                        {t.category} · {statesMap[t.status] || (isEn ? "Received" : "Đã tiếp nhận")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setParams({ ticket: t.id })}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        background: "#fff",
                        color: "var(--navy, #052659)",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      {isEn ? "Open thread" : "Mở hội thoại"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {data&&<Pagination page={page} pageSize={data.limit} totalItems={data.total} totalPages={Math.max(1,Math.ceil(data.total/data.limit))} onPageChange={setPage}/>}
          </Card>
        </div>
      ) : (
        /* ADMIN VIEW: Full Table & Search */
        <Card className="admin-table-card">
          {/* Table Toolbar */}
          <div className="admin-table-toolbar">
            <div className="admin-search-input" style={{ flex: "1", maxWidth: "360px" }}>
              <Icon name="search" />
              <input
                type="text"
                placeholder={isEn ? "Search by title, ticket code..." : "Tìm theo tiêu đề, mã ticket..."}
                aria-label={isEn ? "Search support requests" : "Tìm yêu cầu hỗ trợ"}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="admin-search-clear"
                  onClick={() => setSearchTerm("")}
                  aria-label={isEn ? "Clear search" : "Xóa tìm kiếm"}
                >
                  <Icon name="x" size="small" />
                </button>
              )}
            </div>

            <div className="support-filters-row" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Select
                label={isEn ? "Request category" : "Nhóm yêu cầu"}
                hideLabel
                value={categoryOptions.find((c) => c.key === categoryFilterKey)?.label || categoryOptions[0].label}
                options={categoryOptions.map((c) => c.label)}
                onChange={(v) => {
                  const found = categoryOptions.find((c) => c.label === v);
                  setCategoryFilterKey(found ? found.key : "ALL");
                  setPage(1);
                }}
              />
              <Select
                label={isEn ? "Request status" : "Trạng thái yêu cầu"}
                hideLabel
                value={statusFilterOptions.find((s) => s.key === statusFilterKey)?.label || statusFilterOptions[0].label}
                options={statusFilterOptions.map((s) => s.label)}
                onChange={(v) => {
                  const found = statusFilterOptions.find((s) => s.label === v);
                  setStatusFilterKey(found ? found.key : "ALL");
                  setPage(1);
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchTerm("");
                  setCategoryFilterKey("ALL");
                  setStatusFilterKey("ALL");
                  setPage(1);
                }}
              >
                {isEn ? "Reset" : "Đặt lại"}
              </Button>
            </div>
          </div>

          {/* Table Content */}
          {!data && !error ? (
            <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-muted)" }}>
              {isEn ? "Loading support requests..." : "Đang tải dữ liệu yêu cầu hỗ trợ..."}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>{isEn ? "Ticket Code & Subject" : "Mã & Tiêu đề yêu cầu"}</th>
                    <th>{isEn ? "Category" : "Phân loại"}</th>
                    <th>{isEn ? "Status" : "Trạng thái"}</th>
                    <th>{isEn ? "Last Updated" : "Cập nhật lần cuối"}</th>
                    <th style={{ textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div>
                          <button
                            type="button"
                            className="admin-table-link-btn"
                            onClick={() => setParams({ ticket: t.id })}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              textAlign: "left",
                              color: "var(--color-primary-700)",
                              fontWeight: 600,
                              fontSize: "14px",
                            }}
                          >
                            {t.subject}
                          </button>
                          <div style={{ marginTop: "2px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                            <code style={{ fontSize: "11px", background: "var(--color-bg)", padding: "1px 6px", borderRadius: "4px" }}>
                              #{t.id.toUpperCase()}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="soft">{categoryLabelMap[t.category] || t.category}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusToneMap[t.status] || "neutral"}>
                          {statesMap[t.status] || t.status}
                        </Badge>
                      </td>
                      <td>
                        <small style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                          {new Date(t.updatedAt).toLocaleString(isEn ? "en-US" : "vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </small>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          size="small"
                          icon="message"
                          onClick={() => setParams({ ticket: t.id })}
                        >
                          {isEn ? "View & Process" : "Xem & Xử lý"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {visibleItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-8)" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)" }}>
                          <span style={{ color: "var(--color-text-muted)" }}>
                            <Icon name="life-buoy" size="large" />
                          </span>
                          <strong style={{ color: "var(--color-primary-700)" }}>
                            {isEn ? "No matching support requests" : "Chưa có yêu cầu hỗ trợ phù hợp"}
                          </strong>
                          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}>
                            {isEn
                              ? "No tickets matched the current search criteria or filter."
                              : "Không tìm thấy ticket nào khớp với điều kiện tìm kiếm hoặc bộ lọc hiện tại."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar */}
          {data && (
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
              totalItems={data.total}
              pageSize={data.limit}
              onPageChange={setPage}
              showRowsPerPage={false}
            />
          )}
        </Card>
      )}

      {/* Dialog Tạo yêu cầu mới */}
      <ResponsiveDialog
        open={create}
        title={isEn ? "Submit Support Request" : "Gửi yêu cầu hỗ trợ"}
        onClose={() => {
          if (!busy && (!message || window.confirm(isEn ? "Discard unsent support request?" : "Bỏ nội dung yêu cầu chưa gửi?"))) {
            setCreate(false);
          }
        }}
      >
        <form onSubmit={send}>
          <fieldset className="account-api-fields" disabled={busy}>
            <Input
              label={isEn ? "Request Subject" : "Tiêu đề yêu cầu"}
              value={subject}
              onChange={setSubject}
            />
            <Select
              label={isEn ? "Category" : "Nhóm yêu cầu"}
              value={formCategoryOptions.find((c) => c.key === category)?.label || formCategoryOptions[0].label}
              options={formCategoryOptions.map((c) => c.label)}
              onChange={(v) => {
                const found = formCategoryOptions.find((c) => c.label === v);
                setCategory(found ? found.key : "Tài khoản");
              }}
            />
            <label className="form-field">
              <span className="field-label">{isEn ? "Detailed Message" : "Nội dung chi tiết cần hỗ trợ"}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                minLength={3}
                maxLength={5000}
                required
                style={{ width: "100%", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", border: "1px solid var(--color-border)" }}
              />
            </label>
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "var(--space-2) 0" }}>
              {isEn
                ? "Do not include passwords, OTPs, or bank card information in your request."
                : "Không gửi mật khẩu, mã OTP hoặc thông tin thẻ ngân hàng trong nội dung yêu cầu."}
            </p>
            {detailError && <p role="alert" style={{ color: "var(--color-danger)" }}>{detailError}</p>}
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={subject.trim().length < 3 || message.trim().length < 3}
            >
              {isEn ? "Submit Request" : "Gửi yêu cầu"}
            </Button>
          </fieldset>
        </form>
      </ResponsiveDialog>

      {/* Dialog Chi tiết & Phản hồi ticket */}
      <ResponsiveDialog
        open={!!selected && !create && !confirmCancel && !discardReply}
        title={detail?.subject || (isEn ? "Support Request Details" : "Chi tiết yêu cầu hỗ trợ")}
        onClose={() => {
          if (!admin) { if(!busy) { if(reply) setDiscardReply(true); else setParams({}); } return; }
          if (!busy && (!reply || window.confirm(isEn ? "Discard unsent reply?" : "Bỏ phản hồi chưa gửi?"))) {
            setParams({});
          }
        }}
      >
        {detailError && (
          <Alert tone="danger" title={isEn ? "Cannot complete action" : "Chưa thể hoàn tất"}>
            {detailError}
            <Button size="small" onClick={() => setReload((v) => v + 1)}>
              {isEn ? "Reload" : "Tải lại"}
            </Button>
          </Alert>
        )}

        {detail && (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Badge tone={statusToneMap[detail.status] || "neutral"}>
                  {statesMap[detail.status] || detail.status}
                </Badge>
                <Badge tone="soft">{categoryLabelMap[detail.category] || detail.category}</Badge>
                <code style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                  #TK-{detail.id.slice(-6).toUpperCase()}
                </code>
              </div>
              <small style={{ color: "var(--color-text-muted)" }}>
                {isEn ? "Updated: " : "Cập nhật: "}
                {new Date(detail.updatedAt).toLocaleString(isEn ? "en-US" : "vi-VN")}
              </small>
            </div>

            {!admin&&["OPEN","IN_PROGRESS"].includes(detail.status)&&<Button variant="secondary" disabled={busy} onClick={()=>setConfirmCancel(true)}>{isEn?"Withdraw request":"Rút yêu cầu"}</Button>}
            {/* Admin status update controls */}
            {admin && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-bg)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ flex: "1" }}>
                  <Select
                    label={isEn ? "Processing Status" : "Trạng thái xử lý"}
                    options={Object.values(statesMap)}
                    value={statesMap[status]}
                    onChange={(v) => {
                      const foundKey = Object.keys(statesMap).find((k) => statesMap[k] === v);
                      if (foundKey) setStatus(foundKey);
                    }}
                  />
                </div>
                <Button
                  disabled={busy || status === detail.status}
                  onClick={() => void updateStatus()}
                  variant="primary"
                >
                  {isEn ? "Update Status" : "Cập nhật trạng thái"}
                </Button>
              </div>
            )}

            {/* Conversation Thread */}
            <div className="ticket-messages support-conversation messages-list support-thread" style={{ display: "grid", gap: "14px", maxHeight: "400px", overflowY: "auto", padding: "12px" }}>
              {detail.messages.map((m) => {
                const isAdmin = m.author.role === "ADMIN";
                return (
                  <article
                    key={m.id}
                    className={`chat-message ${isAdmin ? "assistant" : "user"}`}
                    style={{
                      padding: "14px 18px",
                      borderRadius: isAdmin ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                      background: isAdmin ? "var(--soft, #E8F2FE)" : "var(--navy, #052659)",
                      color: isAdmin ? "var(--navy, #052659)" : "#fff",
                      border: `1px solid ${isAdmin ? "var(--border, #D0E4FE)" : "var(--navy, #052659)"}`,
                      maxWidth: "85%",
                      marginLeft: isAdmin ? "0" : "auto",
                      marginRight: isAdmin ? "auto" : "0",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                      <strong style={{ color: isAdmin ? "var(--primary, #334DAF)" : "#fff", fontSize: "13px" }}>
                        {isAdmin ? (isEn ? "An Huu Support" : "Hỗ trợ An Hưu") : m.author.fullName}
                        {isAdmin && (
                          <span style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 6px", background: "var(--primary, #334DAF)", color: "#fff", borderRadius: "10px" }}>
                            Admin
                          </span>
                        )}
                      </strong>
                      <small style={{ color: isAdmin ? "var(--muted, #456B91)" : "rgba(255,255,255,0.75)", fontSize: "11px" }}>
                        {new Date(m.createdAt).toLocaleString(isEn ? "en-US" : "vi-VN")}
                      </small>
                    </div>
                    <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.6", color: isAdmin ? "var(--navy, #052659)" : "#fff", whiteSpace: "pre-wrap" }}>
                      {m.body}
                    </p>
                  </article>
                );
              })}
            </div>

            {/* Reply Form */}
            {detail.status !== "CLOSED" ? (
              <form onSubmit={sendReply} style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <label className="form-field">
                  <span className="field-label">{isEn ? "Reply Content" : "Nội dung phản hồi"}</span>
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={admin ? (isEn ? "Enter reply for member..." : "Nhập nội dung phản hồi cho hội viên...") : (isEn ? "Enter your reply to support..." : "Nhập nội dung gửi bộ phận hỗ trợ...")}
                    maxLength={5000}
                    required
                    disabled={busy}
                    style={{ width: "100%", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", border: "1px solid var(--color-border)" }}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={!reply.trim()}
                  >
                    {isEn ? "Send Reply" : "Gửi phản hồi"}
                  </Button>
                </div>
              </form>
            ) : (
              <div style={{ padding: "var(--space-3)", background: "var(--color-bg)", borderRadius: "var(--radius-sm)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>
                {isEn
                  ? "This ticket has been closed. To discuss further, please create a new support request."
                  : "Yêu cầu này đã được đóng. Để trao đổi thêm, vui lòng tạo yêu cầu hỗ trợ mới."}
              </div>
            )}
          </div>
        )}

        {!detail && !detailError && (
          <p role="status" style={{ textAlign: "center", padding: "var(--space-4)" }}>
            {isEn ? "Loading conversation data..." : "Đang tải dữ liệu trao đổi..."}
          </p>
        )}
      </ResponsiveDialog>
      <ResponsiveDialog className="user-workspace-dialog" open={!admin&&discardReply} title={isEn?"Discard unsent reply?":"Bỏ phản hồi chưa gửi?"} initialFocusSelector=".keep-reply" onClose={()=>setDiscardReply(false)}>
        <p>{isEn?"Your reply has not been sent. Keep editing or discard it before closing the conversation.":"Phản hồi chưa được gửi. Bạn có thể tiếp tục soạn hoặc bỏ nội dung trước khi đóng hội thoại."}</p>
        <div className="saved-actions"><Button className="keep-reply" variant="secondary" onClick={()=>setDiscardReply(false)}>{isEn?"Keep editing":"Tiếp tục soạn"}</Button><Button onClick={()=>{setReply("");setDiscardReply(false);setParams({});}}>{isEn?"Discard reply":"Bỏ phản hồi"}</Button></div>
      </ResponsiveDialog>
      <ResponsiveDialog className="user-workspace-dialog support-withdraw-dialog" open={!admin&&confirmCancel} title={isEn?"Withdraw support request?":"Rút yêu cầu hỗ trợ?"} onClose={()=>{if(!busy)setConfirmCancel(false);}}><p>{isEn?"The conversation remains available; no more replies can be sent to this request.":"Hội thoại vẫn được giữ; yêu cầu đã rút sẽ không nhận thêm phản hồi."}</p>{detailError&&<p role="alert">{detailError}</p>}<Button disabled={busy||!detail} onClick={async()=>{if(!detail||busy)return;setBusy(true);setDetailError("");try{await authenticatedRequest(`/me/support/${detail.id}/cancel`,{});setConfirmCancel(false);setReload(n=>n+1);}catch(e){setDetailError(e instanceof Error?e.message:"Không thể rút yêu cầu.");}finally{setBusy(false);}}}>{isEn?"Confirm withdrawal":"Xác nhận rút yêu cầu"}</Button></ResponsiveDialog>
    </div>
  );
}
