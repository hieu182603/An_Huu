import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { adminNavigation, settingsNavigation } from "../../routes";
import {
  Alert,
  Avatar,
  Badge,
  BrandLogo,
  Button,
  Card,
  Drawer,
  Icon,
  IconButton,
  Input,
  Modal,
  SearchField,
  Select,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useNotification,
  type IconName,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";

const ADMIN_SETTINGS_KEY = "anhuu_demo_admin_settings";
const ADMIN_AUDIT_KEY = "anhuu_demo_admin_audit";
type AdminSettings = {
  systemName: string; language: string; timezone: string; supportEmail: string; maintenance: boolean;
  integrations: boolean[]; digest: string; notificationEmail: string; emailEnabled: boolean; inApp: boolean; critical: boolean;
  profileRetention: string; auditRetention: string; analytics: boolean; exportApproval: boolean;
};
const defaultAdminSettings: AdminSettings = {
  systemName: "An Hưu", language: "Tiếng Việt", timezone: "GMT+7 · Việt Nam", supportEmail: "hotro@anhuu.vn", maintenance: false,
  integrations: [false, false, false], digest: "Hàng ngày", notificationEmail: "operations@anhuu.vn", emailEnabled: false, inApp: true, critical: true,
  profileRetention: "5 năm", auditRetention: "3 năm", analytics: true, exportApproval: true,
};
type AuditEntry = { actor: string; action: string; target: string; time: string; result: string; category: string; before?: string; after?: string };

function loadAdminSettings(): AdminSettings {
  try { return { ...defaultAdminSettings, ...JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "{}") }; } catch { return defaultAdminSettings; }
}
function recordAudit(entry: Omit<AuditEntry, "time">) {
  try {
    const previous = JSON.parse(localStorage.getItem(ADMIN_AUDIT_KEY) || "[]") as AuditEntry[];
    localStorage.setItem(ADMIN_AUDIT_KEY, JSON.stringify([{ ...entry, time: new Date().toLocaleString("vi-VN") }, ...previous].slice(0, 100)));
  } catch {}
}
function persistAdminSettings(settings: AdminSettings, target: string) {
  const before = loadAdminSettings();
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  recordAudit({ actor: "Lê Lan Anh", action: "Cập nhật cấu hình", target, result: "Thành công", category: "Cấu hình", before: JSON.stringify(before), after: JSON.stringify(settings) });
}
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

type TicketStatus = "Mới" | "Đang xử lý" | "Đang chờ" | "Đã giải quyết" | "Đã đóng";

type Ticket = {
  id: string;
  user: string;
  initials: string;
  email: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: "Thông thường" | "Cần chú ý" | "Khẩn";
  updated: string;
  assigned: string;
  messages: { from: string; content: string; time: string; admin?: boolean }[];
};

type Template = {
  id: string;
  name: string;
  channel: "Email" | "Trong ứng dụng" | "Email + Trong ứng dụng";
  purpose: string;
  status: "Đang dùng" | "Bản nháp";
  updated: string;
  subject: string;
  body: string;
};


const initialTickets: Ticket[] = [
  { id: "TK-2084", user: "Nguyễn Minh An", initials: "NA", email: "minhan@example.com", subject: "Không thấy dữ liệu BHXH vừa cập nhật", category: "Dữ liệu tài chính", status: "Mới", priority: "Cần chú ý", updated: "5 phút trước", assigned: "Chưa phân công", messages: [{ from: "Nguyễn Minh An", content: "Tôi đã bổ sung dữ liệu BHXH sáng nay nhưng kế hoạch vẫn chưa hiển thị thay đổi.", time: "Hôm nay, 10:24" }] },
  { id: "TK-2081", user: "Trần Thu Hà", initials: "TH", email: "thuha@example.com", subject: "Cần giải thích kết quả kế hoạch", category: "Kế hoạch nghỉ hưu", status: "Đang xử lý", priority: "Thông thường", updated: "32 phút trước", assigned: "Lê Lan Anh", messages: [{ from: "Trần Thu Hà", content: "Khoản còn thiếu trong kế hoạch được tính dựa trên những giả định nào?", time: "Hôm nay, 09:10" }, { from: "Lê Lan Anh", content: "An Hưu đã tiếp nhận và đang kiểm tra các giả định trong kế hoạch của bạn.", time: "Hôm nay, 09:34", admin: true }] },
  { id: "TK-2078", user: "Lê Hoàng Nam", initials: "LN", email: "hoangnam@example.com", subject: "Yêu cầu tải lại báo cáo PDF", category: "Báo cáo", status: "Đang chờ", priority: "Thông thường", updated: "2 giờ trước", assigned: "Phạm Minh Tú", messages: [{ from: "Lê Hoàng Nam", content: "Bản PDF tải về bị thiếu trang giả định.", time: "Hôm nay, 07:45" }] },
  { id: "TK-2073", user: "Phạm Ngọc Mai", initials: "PM", email: "ngocmai@example.com", subject: "Cập nhật email tài khoản", category: "Tài khoản", status: "Đã giải quyết", priority: "Thông thường", updated: "Hôm qua", assigned: "Lê Lan Anh", messages: [{ from: "Phạm Ngọc Mai", content: "Tôi muốn đổi email đăng nhập.", time: "17/08/2025, 14:20" }, { from: "Lê Lan Anh", content: "Email đã được cập nhật theo yêu cầu và xác minh thành công.", time: "17/08/2025, 15:05", admin: true }] },
  { id: "TK-2069", user: "Vũ Đức Long", initials: "VL", email: "duclong@example.com", subject: "Không đăng nhập được sau nhiều lần thử", category: "Bảo mật", status: "Đã đóng", priority: "Khẩn", updated: "2 ngày trước", assigned: "Nguyễn Thu Hương", messages: [{ from: "Vũ Đức Long", content: "Tài khoản báo tạm khóa sau khi tôi nhập sai mật khẩu.", time: "16/08/2025, 08:10" }] },
];

const initialTemplates: Template[] = [
  { id: "NT-01", name: "Xác nhận tiếp nhận yêu cầu", channel: "Email + Trong ứng dụng", purpose: "Tự động gửi khi ticket mới được tạo", status: "Đang dùng", updated: "16/08/2025", subject: "An Hưu đã nhận yêu cầu của bạn", body: "Chào {{user_name}}, yêu cầu {{ticket_id}} đã được tiếp nhận. Đội ngũ An Hưu sẽ phản hồi trong thời gian sớm nhất." },
  { id: "NT-02", name: "Nhắc bổ sung hồ sơ", channel: "Trong ứng dụng", purpose: "Nhắc người dùng hoàn thiện dữ liệu còn thiếu", status: "Đang dùng", updated: "12/08/2025", subject: "Hồ sơ của bạn cần thêm thông tin", body: "Bổ sung {{missing_section}} để kết quả kế hoạch phản ánh đầy đủ hơn tình hình hiện tại." },
  { id: "NT-03", name: "Kế hoạch đã được cập nhật", channel: "Email", purpose: "Thông báo sau khi kế hoạch được tính lại", status: "Đang dùng", updated: "10/08/2025", subject: "Kế hoạch nghỉ hưu của bạn đã được cập nhật", body: "Các thay đổi mới nhất đã được áp dụng. Bạn có thể đăng nhập để xem kết quả và giả định liên quan." },
  { id: "NT-04", name: "Bảo trì hệ thống", channel: "Email + Trong ứng dụng", purpose: "Thông báo gián đoạn dịch vụ có kế hoạch", status: "Bản nháp", updated: "08/08/2025", subject: "Thông báo bảo trì An Hưu", body: "An Hưu dự kiến bảo trì từ {{start_time}} đến {{end_time}}. Dữ liệu của bạn vẫn được bảo vệ trong thời gian này." },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`dashboard-brand ${compact ? "is-compact" : ""}`} style={{ alignItems: "center", display: "inline-flex", gap: "6px" }}>
      <BrandLogo compact={compact} />
      {!compact && (
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-primary-600)", textTransform: "uppercase", background: "var(--color-primary-50)", padding: "2px 6px", borderRadius: "4px" }}>
          ADMIN
        </span>
      )}
    </div>
  );
}

function AdminNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="admin-nav" aria-label="Điều hướng quản trị">
      {!collapsed && <span className="sidebar-label">VẬN HÀNH HỆ THỐNG</span>}
      {adminNavigation.map((item) => (
        <NavLink
          className={({ isActive }) => isActive ? "is-active" : ""}
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          aria-label={item.label}
          title={item.label}
        >
          <Icon name={item.icon} />
          {!collapsed && <span>{item.label}</span>}
          {!collapsed && item.path === "/admin/support" && <small>3</small>}
        </NavLink>
      ))}
    </nav>
  );
}

function AdminSidebar({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: () => void }) {
  return (
    <aside className={`admin-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="admin-sidebar-brand"><Brand compact={collapsed} />{!collapsed && <IconButton icon="panel-left" label="Thu gọn điều hướng" onClick={onCollapse} />}</div>
      <AdminNav collapsed={collapsed} />
      <div className="admin-sidebar-footer">{!collapsed && <Link className="demo-home-link" to="/" aria-label="Chọn khu vực demo" title="Chọn khu vực demo"><Icon name="home" /><span>Chọn khu vực demo</span></Link>}{collapsed && <IconButton icon="panel-right" label="Mở rộng điều hướng" onClick={onCollapse} />}</div>
    </aside>
  );
}

function AdminHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <header className="admin-page-header"><div><span>ADMIN AREA</span><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}

function ticketTone(status: TicketStatus): "info" | "warning" | "success" | "neutral" {
  if (status === "Mới") return "info";
  if (status === "Đang xử lý" || status === "Đang chờ") return "warning";
  if (status === "Đã giải quyết") return "success";
  return "neutral";
}

function priorityTone(priority: Ticket["priority"]): "neutral" | "warning" | "danger" {
  if (priority === "Khẩn") return "danger";
  if (priority === "Cần chú ý") return "warning";
  return "neutral";
}

export function SupportPage() {
  const { notify } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "templates" ? "Mẫu thông báo" : "Tickets";
  const setTab = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "Mẫu thông báo") next.set("tab", "templates");
      else next.delete("tab");
      return next;
    });
  };
  const [tickets, setTickets] = useState<Ticket[]>(() => { try { return JSON.parse(localStorage.getItem("anhuu_demo_support_tickets") || "null") || initialTickets; } catch { return initialTickets; } });
  const [templates, setTemplates] = useState<Template[]>(() => { try { return JSON.parse(localStorage.getItem("anhuu_demo_support_templates") || "null") || initialTemplates; } catch { return initialTemplates; } });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tất cả trạng thái");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [draftStatus, setDraftStatus] = useState<TicketStatus>("Mới");
  const [draftAssigned, setDraftAssigned] = useState("Chưa phân công");
  const [reply, setReply] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [audience, setAudience] = useState("Tất cả người dùng");
  const [sendChannel, setSendChannel] = useState("Email + Trong ứng dụng");
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplates[0].name);
  const [notificationBody, setNotificationBody] = useState(initialTemplates[0].body);
  const [sentMessage, setSentMessage] = useState("");

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets.filter((ticket) => (filter === "Tất cả trạng thái" || ticket.status === filter) && (!normalized || `${ticket.user} ${ticket.subject} ${ticket.id}`.toLowerCase().includes(normalized)));
  }, [filter, query, tickets]);

  const openTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket); setDraftStatus(ticket.status); setDraftAssigned(ticket.assigned); setReply("");
  };
  const saveTicket = () => {
    if (!selectedTicket) return;
    const nextTickets = tickets.map((ticket) => ticket.id === selectedTicket.id ? { ...ticket, status: draftStatus, assigned: draftAssigned, messages: reply.trim() ? [...ticket.messages, { from: "Lê Lan Anh", content: reply.trim(), time: "Vừa xong", admin: true }] : ticket.messages } : ticket);
    setTickets(nextTickets);
    localStorage.setItem("anhuu_demo_support_tickets", JSON.stringify(nextTickets));
    notify.success("Cập nhật ticket thành công", `Trạng thái ticket ${selectedTicket.id} đã được cập nhật thành "${draftStatus}".`);
    setSelectedTicket(null);
  };
  const openTemplate = (template: Template) => {
    setEditingTemplate(template); setTemplateSubject(template.subject); setTemplateBody(template.body);
  };
  const saveTemplate = () => {
    if (!editingTemplate) return;
    const nextTemplates = templates.map((template) => template.id === editingTemplate.id ? { ...template, subject: templateSubject, body: templateBody, updated: new Date().toLocaleDateString("vi-VN") } : template);
    setTemplates(nextTemplates);
    localStorage.setItem("anhuu_demo_support_templates", JSON.stringify(nextTemplates));
    notify.success("Lưu mẫu thành công", `Mẫu thông báo "${editingTemplate.name}" đã được lưu.`);
    setEditingTemplate(null);
  };
  const chooseTemplate = (name: string) => {
    setSelectedTemplate(name);
    setNotificationBody(templates.find((template) => template.name === name)?.body ?? "");
  };
  const sendNotification = () => {
    setSentMessage(`Chưa gửi thông báo “${selectedTemplate}”. Dịch vụ ${sendChannel.toLowerCase()} chưa được cấu hình trong bản demo.`);
    notify.info("Gửi thông báo", `Đã lập lệnh phát sóng "${selectedTemplate}" tới nhóm ${audience}.`);
    setSendOpen(false);
  };

  return (
    <div className="admin-page support-page">
      <AdminHeader title="Hỗ trợ & thông báo" description="Xử lý ticket, quản lý mẫu và gửi thông báo đến đúng nhóm người dùng.">
        <Button icon="message" onClick={() => setSendOpen(true)}>Gửi thông báo</Button>
      </AdminHeader>
      {sentMessage && <Alert tone="success" title="Đã gửi thông báo">{sentMessage}</Alert>}
      <section className="business-summary-grid">
        {[
          ["Ticket mới", "12", "Chờ tiếp nhận", "message", "tone-info"],
          ["Đang xử lý", "24", "Trong SLA", "settings", "tone-warning"],
          ["Giải quyết hôm nay", "38", "92% đúng hạn", "circle-check", "tone-success"],
          ["Mẫu đang dùng", String(templates.filter((item) => item.status === "Đang dùng").length), "Email & in-app", "bell", ""],
        ].map(([label, value, detail, icon, tone]) => <Card className="business-summary-card support-summary-card" key={label}><span className={`summary-card-icon ${tone}`}><Icon name={icon as IconName} /></span><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></Card>)}
      </section>
      <Card className="admin-table-card support-workspace">
        <div className="support-tabs"><Tabs items={["Tickets", "Mẫu thông báo"]} active={tab} onChange={(value) => { setTab(value); setQuery(""); setFilter("Tất cả trạng thái"); }} /></div>
        {tab === "Tickets" ? (
          <>
            <div className="admin-table-toolbar">
              <div className="support-search"><SearchField label="Tìm ticket" placeholder="Mã, người dùng hoặc nội dung..." value={query} onChange={setQuery} /></div>
              <div className="admin-filters"><Select label="Trạng thái" options={["Tất cả trạng thái", "Mới", "Đang xử lý", "Đang chờ", "Đã giải quyết", "Đã đóng"]} value={filter} onChange={setFilter} /></div>
            </div>
            <div className="admin-results-summary"><span><strong>{filteredTickets.length}</strong> ticket phù hợp</span></div>
            <TicketList tickets={filteredTickets} onOpen={openTicket} />
          </>
        ) : <TemplateList templates={templates} onEdit={openTemplate} onSend={(template) => { setSelectedTemplate(template.name); setNotificationBody(template.body); setSendChannel(template.channel); setSendOpen(true); }} />}
      </Card>

      <Drawer open={Boolean(selectedTicket)} title={selectedTicket ? `${selectedTicket.id} · ${selectedTicket.user}` : "Chi tiết ticket"} onClose={() => setSelectedTicket(null)}>
        {selectedTicket && <div className="ticket-detail">
          <div className="ticket-detail-heading"><div><Badge tone={ticketTone(selectedTicket.status)}>{selectedTicket.status}</Badge><Badge tone={priorityTone(selectedTicket.priority)}>{selectedTicket.priority}</Badge></div><h2>{selectedTicket.subject}</h2><p>{selectedTicket.email} · {selectedTicket.category} · Cập nhật {selectedTicket.updated}</p></div>
          <div className="ticket-conversation">{selectedTicket.messages.map((message, index) => <div className={message.admin ? "is-admin" : ""} key={`${message.time}-${index}`}><Avatar initials={message.admin ? "LA" : selectedTicket.initials} /><span><strong>{message.from}</strong><p>{message.content}</p><small>{message.time}</small></span></div>)}</div>
          <Select label="Trạng thái" options={["Mới", "Đang xử lý", "Đang chờ", "Đã giải quyết", "Đã đóng"]} value={draftStatus} onChange={(value) => setDraftStatus(value as TicketStatus)} />
          <Select label="Admin phụ trách" options={["Chưa phân công", "Lê Lan Anh", "Phạm Minh Tú", "Nguyễn Thu Hương"]} value={draftAssigned} onChange={setDraftAssigned} />
          <Textarea label="Phản hồi người dùng" placeholder="Nhập phản hồi rõ ràng và hữu ích..." rows={5} value={reply} onChange={setReply} />
          <div className="drawer-actions"><Button variant="secondary" onClick={() => setSelectedTicket(null)}>Hủy</Button><Button onClick={saveTicket}>Lưu & gửi phản hồi</Button></div>
        </div>}
      </Drawer>

      <Modal open={Boolean(editingTemplate)} title="Chỉnh sửa mẫu thông báo" onClose={() => setEditingTemplate(null)}>
        {editingTemplate && <div className="template-editor"><div className="template-editor-meta"><Badge tone={editingTemplate.status === "Đang dùng" ? "success" : "neutral"}>{editingTemplate.status}</Badge><span>{editingTemplate.channel} · {editingTemplate.purpose}</span></div><Input label="Tiêu đề" value={templateSubject} onChange={setTemplateSubject} /><Textarea label="Nội dung mẫu" rows={7} value={templateBody} onChange={setTemplateBody} /><Alert tone="info" title="Biến nội dung được hỗ trợ">Có thể dùng các biến như {"{{user_name}}"}, {"{{ticket_id}}"} hoặc {"{{start_time}}"}.</Alert><div className="modal-actions"><Button variant="secondary" onClick={() => setEditingTemplate(null)}>Hủy</Button><Button disabled={!templateSubject.trim() || !templateBody.trim()} onClick={saveTemplate}>Lưu mẫu</Button></div></div>}
      </Modal>

      <Modal open={sendOpen} title="Gửi thông báo" onClose={() => setSendOpen(false)}>
        <div className="notification-send-form">
          <Alert tone="warning" title="Kiểm tra đối tượng trước khi gửi">Thông báo sẽ được gửi ngay sau khi xác nhận.</Alert>
          <div><Select label="Đối tượng" options={["Tất cả người dùng", "Người dùng chưa hoàn thiện hồ sơ", "Người dùng có kế hoạch", "Người dùng đang có ticket"]} value={audience} onChange={setAudience} /><Select label="Kênh gửi" options={["Email", "Trong ứng dụng", "Email + Trong ứng dụng"]} value={sendChannel} onChange={setSendChannel} /></div>
          <Select label="Mẫu thông báo" options={templates.map((template) => template.name)} value={selectedTemplate} onChange={chooseTemplate} />
          <Textarea label="Nội dung" rows={7} value={notificationBody} onChange={setNotificationBody} />
          <div className="notification-preview"><Icon name="info" /><span><strong>Xem trước phạm vi</strong><small>{audience} · {sendChannel}</small></span></div>
          <div className="modal-actions"><Button variant="secondary" onClick={() => setSendOpen(false)}>Hủy</Button><Button disabled={!notificationBody.trim()} onClick={sendNotification}>Xác nhận gửi</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function TicketList({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (ticket: Ticket) => void }) {
  if (!tickets.length) return <div className="admin-empty"><span><Icon name="search" size="large" /></span><h2>Không tìm thấy ticket</h2><p>Thử thay đổi từ khóa hoặc bộ lọc hiện tại.</p></div>;
  return (
    <>
      <div className="support-table-scroll"><table className="support-table"><thead><tr><th>Ticket</th><th>Người dùng</th><th>Danh mục</th><th>Ưu tiên</th><th>Trạng thái</th><th>Phụ trách</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td><strong>{ticket.subject}</strong><small>{ticket.id}</small></td><td><div className="support-user"><Avatar initials={ticket.initials} /><span><strong>{ticket.user}</strong><small>{ticket.email}</small></span></div></td><td>{ticket.category}</td><td><Badge tone={priorityTone(ticket.priority)}>{ticket.priority}</Badge></td><td><Badge tone={ticketTone(ticket.status)}>{ticket.status}</Badge></td><td>{ticket.assigned}</td><td>{ticket.updated}</td><td><Tooltip content="Mở ticket"><IconButton icon="chevron-right" label={`Mở ${ticket.id}`} onClick={() => onOpen(ticket)} /></Tooltip></td></tr>)}</tbody></table></div>
      <div className="support-mobile-list">{tickets.map((ticket) => <Card className="support-mobile-card" key={ticket.id}><header><span>{ticket.id}</span><Badge tone={ticketTone(ticket.status)}>{ticket.status}</Badge></header><h2>{ticket.subject}</h2><p>{ticket.user} · {ticket.category}</p><div><Badge tone={priorityTone(ticket.priority)}>{ticket.priority}</Badge><small>{ticket.updated}</small></div><Button variant="secondary" size="small" onClick={() => onOpen(ticket)}>Mở ticket</Button></Card>)}</div>
    </>
  );
}

function TemplateList({ templates, onEdit, onSend }: { templates: Template[]; onEdit: (template: Template) => void; onSend: (template: Template) => void }) {
  return <div className="template-grid">{templates.map((template) => <Card className="notification-template-card" key={template.id}><header><span className="template-icon"><Icon name="bell" /></span><Badge tone={template.status === "Đang dùng" ? "success" : "neutral"}>{template.status}</Badge></header><small>{template.channel}</small><h2>{template.name}</h2><p>{template.purpose}</p><div className="template-preview"><strong>{template.subject}</strong><span>{template.body}</span></div><footer><Button variant="ghost" size="small" onClick={() => onEdit(template)}>Chỉnh sửa</Button><Button variant="secondary" size="small" onClick={() => onSend(template)}>Dùng mẫu</Button></footer></Card>)}</div>;
}

function reportLabels(period: string) {
  if (period.startsWith("30")) return ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4"];
  if (period.startsWith("3")) return ["Tháng 1", "Tháng 2", "Tháng 3"];
  if (period.startsWith("12")) return ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
  return ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6"];
}
function ReportLineChart({ variant = "growth", period }: { variant?: "growth" | "engagement"; period: string }) {
  return <div className="report-line-chart" role="img" aria-label={`Biểu đồ ${variant === "growth" ? "tăng trưởng" : "tương tác"} cho ${period}`}><svg viewBox="0 0 640 230"><path className="report-grid-lines" d="M0 25H640M0 85H640M0 145H640M0 205H640" /><path className={variant === "growth" ? "report-area-primary" : "report-area-secondary"} d={variant === "growth" ? "M0 184 C80 174 130 155 205 150 S340 120 425 105 S540 70 640 48 V205H0Z" : "M0 170 C90 182 140 154 220 158 S350 121 430 130 S550 92 640 82 V205H0Z"} /><path className={variant === "growth" ? "report-line-primary" : "report-line-secondary"} d={variant === "growth" ? "M0 184 C80 174 130 155 205 150 S340 120 425 105 S540 70 640 48" : "M0 170 C90 182 140 154 220 158 S350 121 430 130 S550 92 640 82"} /></svg><div>{reportLabels(period).map(label => <span key={label}>{label}</span>)}</div></div>;
}

function ReportBars({ kind, period }: { kind: "profile" | "plan" | "ai" | "consultation"; period: string }) {
  const labels = kind === "consultation" ? ["Mới", "Xử lý", "Đặt lịch", "Hoàn tất"] : reportLabels(period).slice(-4);
  return <div className={`report-bars report-bars-${kind}`} role="img" aria-label={`Biểu đồ ${kind} cho ${period}`}>{labels.map((label, index) => <div key={`${label}-${index}`}><span className={`bar-${String.fromCharCode(97 + index)}`} /><small>{label}</small></div>)}</div>;
}

function ReportCard({ title, subtitle, value, trend, children, summary }: { title: string; subtitle: string; value: string; trend: string; children: React.ReactNode; summary: string }) {
  return <Card className="report-chart-card"><header><div><h2>{title}</h2><p>{subtitle}</p></div><div><strong>{value}</strong><small>{trend}</small></div></header>{children}<footer><Icon name="info" size="small" /><span>{summary}</span></footer></Card>;
}

export function ReportsPage() {
  const [period, setPeriod] = useState("6 tháng gần nhất");
  const periodData: Record<string, { users: string; profiles: string; plans: string; active: string; ai: string; consultations: string; points: number[] }> = {
    "30 ngày gần nhất": { users: "624", profiles: "438", plans: "361", active: "61%", ai: "392", consultations: "28", points: [18, 24, 21, 31] },
    "3 tháng gần nhất": { users: "1.482", profiles: "1.046", plans: "846", active: "60%", ai: "876", consultations: "67", points: [32, 45, 41] },
    "6 tháng gần nhất": { users: "2.642", profiles: "1.894", plans: "1.521", active: "58%", ai: "1.842", consultations: "146", points: [30, 38, 44, 51, 58, 64] },
    "12 tháng gần nhất": { users: "5.108", profiles: "3.621", plans: "2.940", active: "56%", ai: "3.506", consultations: "283", points: [22, 25, 29, 34, 38, 41, 45, 48, 52, 56, 61, 66] },
  };
  const data = periodData[period];
  const exportReport = () => downloadCsv("bao-cao-an-huu.csv", [["Khoảng thời gian", period], ["Chỉ số", "Giá trị"], ["Người dùng", data.users], ["Hồ sơ hoàn tất", data.profiles], ["Kế hoạch", data.plans], ["Người dùng hoạt động", data.active], ["Lượt AI", data.ai], ["Yêu cầu tư vấn", data.consultations]]);
  return (
    <div className="admin-page reports-page">
      <AdminHeader title="Báo cáo hệ thống" description="Theo dõi tăng trưởng, mức độ hoàn thiện và hoạt động trên toàn bộ hành trình người dùng."><Button icon="download" onClick={exportReport}>Xuất CSV</Button></AdminHeader>
      <Card className="report-filter-bar"><div><Icon name="info" /><span><strong>Dữ liệu tổng hợp</strong><small>Cập nhật lần cuối 18/08/2025, 10:30</small></span></div><Select label="Khoảng thời gian" options={["30 ngày gần nhất", "3 tháng gần nhất", "6 tháng gần nhất", "12 tháng gần nhất"]} value={period} onChange={setPeriod} /></Card>
      <section className="report-summary-grid">{[
        ["Người dùng mới", data.users, period, "users"],
        ["Hồ sơ hoàn tất", data.profiles, period, "circle-check"],
        ["Kế hoạch đã tạo", data.plans, period, "target"],
        ["Người dùng hoạt động", data.active, period, "chart"],
        ["Lượt dùng AI", data.ai, period, "sparkles"],
        ["Yêu cầu tư vấn", data.consultations, period, "message"],
      ].map(([label, value, trend, icon]) => <Card className="report-summary-card" key={label}><span><Icon name={icon as IconName} /></span><div><small>{label}</small><strong>{value}</strong><b>{trend}</b></div></Card>)}</section>
      <section className="reports-grid">
        <ReportCard title="Tăng trưởng người dùng" subtitle={period} value={data.users} trend={`${data.points.length} mốc dữ liệu`} summary={`Biểu đồ và số liệu đang phản ánh ${period.toLowerCase()}.`}><ReportLineChart period={period} /></ReportCard>
        <ReportCard title="Hoàn thiện hồ sơ" subtitle={period} value={data.profiles} trend="Hồ sơ đủ dữ liệu" summary="Dữ liệu BHXH và khoản nợ là hai phần thường còn thiếu."><ReportBars kind="profile" period={period} /></ReportCard>
        <ReportCard title="Kế hoạch nghỉ hưu" subtitle={period} value={data.plans} trend="Kế hoạch mới" summary="Số liệu dùng cùng phạm vi thời gian đã chọn."><ReportBars kind="plan" period={period} /></ReportCard>
        <ReportCard title="Mức độ tương tác" subtitle={period} value={data.active} trend="Tỷ lệ hoạt động" summary="Theo dõi kế hoạch và mô phỏng là hai hoạt động quay lại phổ biến nhất."><ReportLineChart variant="engagement" period={period} /></ReportCard>
        <ReportCard title="Sử dụng AI" subtitle={period} value={data.ai} trend="Lượt hội thoại" summary="Đây là dữ liệu minh họa, chưa nối dịch vụ AI thật."><ReportBars kind="ai" period={period} /></ReportCard>
        <ReportCard title="Yêu cầu tư vấn" subtitle={period} value={data.consultations} trend="Theo trạng thái" summary="Dữ liệu demo chưa kết nối hệ thống gửi thông báo."><ReportBars kind="consultation" period={period} /></ReportCard>
      </section>
    </div>
  );
}

function SettingNav() {
  return <nav className="settings-section-nav" aria-label="Nhóm cấu hình">{settingsNavigation.map(({ label, icon, path }) => <NavLink className={({ isActive }) => isActive ? "is-active" : ""} key={path} to={path}><Icon name={icon} /><span>{label}</span><Icon name="chevron-right" size="small" /></NavLink>)}</nav>;
}

function SettingsCard({ title, description, saved, onSave, children }: { title: string; description: string; saved: boolean | null; onSave: () => void; children: React.ReactNode }) {
  const { notify } = useNotification();
  const handleSave = () => {
    onSave();
    notify.success("Cài đặt đã lưu", `Cấu hình "${title}" đã được cập nhật thành công.`);
  };
  return <Card className="system-setting-card"><header><div><h2>{title}</h2><p>{description}</p></div>{saved === true && <Badge tone="success">Đã lưu</Badge>}{saved === false && <Badge tone="warning">Có thay đổi chưa lưu</Badge>}</header><div className="system-setting-body">{children}</div><footer><span><Icon name="info" size="small" /> Thay đổi được ghi vào nhật ký kiểm toán.</span><Button onClick={handleSave}>Lưu thay đổi</Button></footer></Card>;
}

export function GeneralSettings() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const change = (updates: Partial<AdminSettings>) => { setSettings((value) => ({ ...value, ...updates })); setSaved(false); };
  return <SettingsCard title="Cài đặt chung" description="Thông tin hiển thị và hành vi chung của hệ thống." saved={saved} onSave={() => { persistAdminSettings(settings, "Cài đặt chung"); setSaved(true); }}><div className="settings-form-grid"><Input label="Tên hệ thống" value={settings.systemName} onChange={(value) => change({ systemName: value })} /><Select label="Ngôn ngữ mặc định" options={["Tiếng Việt", "English"]} value={settings.language} onChange={(value) => change({ language: value })} /><Select label="Múi giờ" options={["GMT+7 · Việt Nam", "GMT+8", "GMT+9"]} value={settings.timezone} onChange={(value) => change({ timezone: value })} /><Input label="Email hỗ trợ" value={settings.supportEmail} onChange={(value) => change({ supportEmail: value })} type="email" /></div><div className="setting-toggle-row"><div><strong>Chế độ bảo trì</strong><small>Trong bản demo, tùy chọn chỉ được lưu và chưa điều khiển máy chủ.</small></div><Switch checked={settings.maintenance} label={settings.maintenance ? "Đang bật" : "Đang tắt"} onChange={(value) => change({ maintenance: value })} /></div>{settings.maintenance && <Alert tone="warning" title="Đã chọn chế độ bảo trì">Cần backend triển khai mới có thể thực sự chặn thao tác ghi.</Alert>}</SettingsCard>;
}

export function IntegrationSettings() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const items = [["Dịch vụ email", "Gửi email giao dịch và báo cáo"], ["Kho lưu trữ báo cáo", "Lưu trữ các tệp xuất"], ["Đồng bộ dữ liệu đối tác", "Cập nhật sản phẩm theo lịch"]];
  return <SettingsCard title="Tích hợp" description="Tùy chọn tính năng demo; chưa có thông tin xác thực dịch vụ ngoài." saved={saved} onSave={() => { persistAdminSettings(settings, "Tích hợp"); setSaved(true); }}><Alert tone="info" title="Chưa kết nối dịch vụ">Bật tùy chọn không đồng nghĩa đã kết nối. Cần cấu hình máy chủ và thông tin xác thực riêng.</Alert><div className="integration-list">{items.map(([name, detail], index) => <div key={name}><span className="integration-icon"><Icon name={index === 0 ? "message" : index === 1 ? "file-text" : "briefcase"} /></span><div><strong>{name}</strong><small>{detail}</small></div><Badge tone="neutral">Chưa kết nối</Badge><Switch checked={settings.integrations[index]} label={settings.integrations[index] ? "Đã bật tùy chọn" : "Đang tắt"} onChange={(value) => { setSettings((current) => ({ ...current, integrations: current.integrations.map((item, itemIndex) => itemIndex === index ? value : item) })); setSaved(false); }} /></div>)}</div></SettingsCard>;
}

export function NotificationSettings() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const change = (updates: Partial<AdminSettings>) => { setSettings((value) => ({ ...value, ...updates })); setSaved(false); };
  return <SettingsCard title="Thông báo hệ thống" description="Cấu hình kênh mặc định và cảnh báo vận hành." saved={saved} onSave={() => { persistAdminSettings(settings, "Thông báo"); setSaved(true); }}><Alert tone="info" title="Giới hạn bản demo">Cài đặt được lưu cục bộ; email sẽ không được gửi khi chưa cấu hình dịch vụ máy chủ.</Alert><div className="settings-form-grid"><Input label="Email nhận cảnh báo" value={settings.notificationEmail} onChange={(value) => change({ notificationEmail: value })} type="email" /><Select label="Tần suất tổng hợp" options={["Hàng ngày", "Hàng tuần", "Không gửi tổng hợp"]} value={settings.digest} onChange={(value) => change({ digest: value })} /></div><div className="setting-toggle-list"><div><span><strong>Email giao dịch</strong><small>Chỉ có hiệu lực sau khi kết nối dịch vụ email.</small></span><Switch checked={settings.emailEnabled} label={settings.emailEnabled ? "Đã bật tùy chọn" : "Đang tắt"} onChange={(value) => change({ emailEnabled: value })} /></div><div><span><strong>Thông báo trong ứng dụng</strong><small>Hiển thị cập nhật trực tiếp trong An Hưu.</small></span><Switch checked={settings.inApp} label={settings.inApp ? "Đang bật" : "Đang tắt"} onChange={(value) => change({ inApp: value })} /></div><div><span><strong>Cảnh báo vận hành quan trọng</strong><small>Thông báo khi có sự cố ảnh hưởng dữ liệu.</small></span><Switch checked={settings.critical} label={settings.critical ? "Đang bật" : "Đang tắt"} onChange={(value) => change({ critical: value })} /></div></div></SettingsCard>;
}

export function PrivacySettings() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const change = (updates: Partial<AdminSettings>) => { setSettings((value) => ({ ...value, ...updates })); setSaved(false); };
  return <SettingsCard title="Quyền riêng tư" description="Quản lý thời gian lưu trữ và cách dữ liệu được sử dụng." saved={saved} onSave={() => { persistAdminSettings(settings, "Quyền riêng tư"); setSaved(true); }}><Alert tone="warning" title="Cấu hình demo">Các lựa chọn được lưu cục bộ và chưa thực thi xóa dữ liệu trên máy chủ.</Alert><div className="settings-form-grid"><Select label="Thời gian lưu hồ sơ đã đóng" options={["3 năm", "5 năm", "7 năm", "10 năm"]} value={settings.profileRetention} onChange={(value) => change({ profileRetention: value })} /><Select label="Thời gian lưu audit log" options={["1 năm", "3 năm", "5 năm"]} value={settings.auditRetention} onChange={(value) => change({ auditRetention: value })} /></div><div className="setting-toggle-list"><div><span><strong>Phân tích dữ liệu ẩn danh</strong><small>Dùng dữ liệu đã loại bỏ định danh để cải thiện sản phẩm.</small></span><Switch checked={settings.analytics} label={settings.analytics ? "Đang bật" : "Đang tắt"} onChange={(value) => change({ analytics: value })} /></div><div><span><strong>Phê duyệt trước khi xuất dữ liệu</strong><small>Yêu cầu quản trị viên thứ hai xác nhận yêu cầu xuất dữ liệu.</small></span><Switch checked={settings.exportApproval} label={settings.exportApproval ? "Bắt buộc" : "Không bắt buộc"} onChange={(value) => change({ exportApproval: value })} /></div></div></SettingsCard>;
}

export function AuditLog() {
  const { notify } = useNotification();
  const [filter, setFilter] = useState("Tất cả hoạt động");
  const stored = (() => { try { return JSON.parse(localStorage.getItem(ADMIN_AUDIT_KEY) || "[]") as AuditEntry[]; } catch { return []; } })();
  const seed: AuditEntry[] = [{ actor: "Hệ thống", action: "Đăng nhập thất bại", target: "Tài khoản quản trị", time: "17/08/2025, 08:20", result: "Cần kiểm tra", category: "Bảo mật" }];
  const rows = [...stored, ...seed].filter((row) => filter === "Tất cả hoạt động" || row.category === filter);
  const exportLog = () => {
    downloadCsv("nhat-ky-an-huu.csv", [["Người thực hiện", "Hành động", "Đối tượng", "Thời gian", "Giá trị trước", "Giá trị sau", "Kết quả"], ...rows.map((row) => [row.actor, row.action, row.target, row.time, row.before || "", row.after || "", row.result])]);
    notify.success("Xuất tệp thành công", "Nhật ký kiểm toán đã được trích xuất thành tệp CSV.");
  };
  return <Card className="audit-log-card"><header><div><h2>Nhật ký kiểm toán</h2><p>Lịch sử các hành động quản trị đã lưu trong bản demo.</p></div><div><Select label="Loại hoạt động" options={["Tất cả hoạt động", "Cấu hình", "Dữ liệu", "Bảo mật", "Thông báo"]} value={filter} onChange={setFilter} /><Button variant="secondary" icon="download" onClick={exportLog}>Xuất CSV</Button></div></header><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Thời gian</th><th>Kết quả</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.actor}-${row.time}-${row.target}`}><td><strong>{row.actor}</strong></td><td>{row.action}</td><td>{row.target}</td><td>{row.time}</td><td><Badge tone={row.result === "Thành công" ? "success" : "warning"}>{row.result}</Badge></td></tr>)}</tbody></table></div></Card>;
}

export function SettingsPage() {
  return <div className="admin-page settings-page"><AdminHeader title="Cấu hình hệ thống" description="Quản lý từng nhóm thiết lập vận hành, tích hợp và quyền riêng tư." /><div className="settings-layout"><SettingNav /><div className="settings-content"><Outlet /></div></div></div>;
}

function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const current = adminNavigation.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFeedback, setSearchFeedback] = useState("");

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    const match = [...adminNavigation, ...settingsNavigation].find((item) => item.label.toLocaleLowerCase("vi").includes(query));
    if (!query || !match) {
      setSearchFeedback(query ? "Không tìm thấy trang quản trị phù hợp." : "Hãy nhập nội dung cần tìm.");
      return;
    }
    setSearchFeedback("");
    navigate(match.path);
  };

  return <header className="admin-topbar"><div className="admin-mobile-brand"><IconButton icon="grid" label="Mở menu quản trị" onClick={onMenu} /><Brand /></div><form className="topbar-search-form" role="search" onSubmit={submitSearch}><SearchField label="Tìm kiếm toàn hệ thống" placeholder="Tìm người dùng, báo cáo hoặc cấu hình..." value={searchQuery} onChange={setSearchQuery} hideLabel /><button className="sr-only" type="submit">Tìm kiếm</button>{searchFeedback && <span className="topbar-search-feedback" role="status">{searchFeedback}</span>}</form><div className="admin-topbar-context"><span>{current?.label ?? "Quản trị"}</span><small>Dữ liệu minh họa · Bản demo</small></div><div className="admin-topbar-actions"><Link className="icon-button" to="/" aria-label="Chọn khu vực demo" title="Chọn khu vực demo"><Icon name="home" /></Link><Tooltip content="3 ticket cần chú ý"><Link className="icon-button" to="/admin/support" aria-label="Công việc cần chú ý"><Icon name="alert" /></Link></Tooltip><Tooltip content="Mẫu thông báo"><Link className="icon-button" to="/admin/support?tab=templates" aria-label="Thông báo"><Icon name="bell" /></Link></Tooltip><Avatar initials={user?.initials || "LA"} name={user?.name || "Lê Lan Anh"} detail={user?.detail || "Quản trị viên"} onLogout={handleLogout} /></div></header>;
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMobileMenu(false), [pathname]);
  return <div className={`admin-app-shell ${collapsed ? "admin-is-collapsed" : ""}`}><AdminSidebar collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} /><div className="admin-workspace"><AdminTopbar onMenu={() => setMobileMenu(true)} /><main className="admin-main" id="main-content"><Outlet /></main></div><Drawer open={mobileMenu} title="Admin Console" onClose={() => setMobileMenu(false)}><AdminNav onNavigate={() => setMobileMenu(false)} /><Link className="demo-home-link" to="/">Chọn khu vực demo</Link></Drawer></div>;
}
