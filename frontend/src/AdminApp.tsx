import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { adminNavigation, settingsNavigation } from "./routes";
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
  type IconName,
} from "./components/ui";
import { useAuth } from "./context/AuthContext";

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
  const [tickets, setTickets] = useState(initialTickets);
  const [templates, setTemplates] = useState(initialTemplates);
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
    setTickets(tickets.map((ticket) => ticket.id === selectedTicket.id ? { ...ticket, status: draftStatus, assigned: draftAssigned, messages: reply.trim() ? [...ticket.messages, { from: "Lê Lan Anh", content: reply.trim(), time: "Vừa xong", admin: true }] : ticket.messages } : ticket));
    setSelectedTicket(null);
  };
  const openTemplate = (template: Template) => {
    setEditingTemplate(template); setTemplateSubject(template.subject); setTemplateBody(template.body);
  };
  const saveTemplate = () => {
    if (!editingTemplate) return;
    setTemplates(templates.map((template) => template.id === editingTemplate.id ? { ...template, subject: templateSubject, body: templateBody, updated: "18/08/2025" } : template));
    setEditingTemplate(null);
  };
  const chooseTemplate = (name: string) => {
    setSelectedTemplate(name);
    setNotificationBody(templates.find((template) => template.name === name)?.body ?? "");
  };
  const sendNotification = () => {
    setSentMessage(`Đã gửi thông báo “${selectedTemplate}” đến ${audience.toLowerCase()} qua ${sendChannel.toLowerCase()}.`);
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

function ReportLineChart({ variant = "growth" }: { variant?: "growth" | "engagement" }) {
  return <div className="report-line-chart" role="img" aria-label={variant === "growth" ? "Người dùng tăng từ 9.840 lên 12.482 trong sáu tháng" : "Tỷ lệ người dùng hoạt động tăng từ 42 lên 58 phần trăm"}><svg viewBox="0 0 640 230"><path className="report-grid-lines" d="M0 25H640M0 85H640M0 145H640M0 205H640" /><path className={variant === "growth" ? "report-area-primary" : "report-area-secondary"} d={variant === "growth" ? "M0 184 C80 174 130 155 205 150 S340 120 425 105 S540 70 640 48 V205H0Z" : "M0 170 C90 182 140 154 220 158 S350 121 430 130 S550 92 640 82 V205H0Z"} /><path className={variant === "growth" ? "report-line-primary" : "report-line-secondary"} d={variant === "growth" ? "M0 184 C80 174 130 155 205 150 S340 120 425 105 S540 70 640 48" : "M0 170 C90 182 140 154 220 158 S350 121 430 130 S550 92 640 82"} /></svg><div><span>Tháng 3</span><span>Tháng 4</span><span>Tháng 5</span><span>Tháng 6</span><span>Tháng 7</span><span>Tháng 8</span></div></div>;
}

function ReportBars({ kind }: { kind: "profile" | "plan" | "ai" | "consultation" }) {
  const labels = kind === "consultation" ? ["Mới", "Xử lý", "Đặt lịch", "Hoàn tất"] : ["Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8"];
  return <div className={`report-bars report-bars-${kind}`} role="img" aria-label={`Biểu đồ ${kind} trong bốn kỳ gần nhất`}>{["bar-a", "bar-b", "bar-c", "bar-d"].map((bar, index) => <div key={bar}><span className={bar} /><small>{labels[index]}</small></div>)}</div>;
}

function ReportCard({ title, subtitle, value, trend, children, summary }: { title: string; subtitle: string; value: string; trend: string; children: React.ReactNode; summary: string }) {
  return <Card className="report-chart-card"><header><div><h2>{title}</h2><p>{subtitle}</p></div><div><strong>{value}</strong><small>{trend}</small></div></header>{children}<footer><Icon name="info" size="small" /><span>{summary}</span></footer></Card>;
}

export function ReportsPage() {
  const [period, setPeriod] = useState("6 tháng gần nhất");
  return (
    <div className="admin-page reports-page">
      <AdminHeader title="Báo cáo hệ thống" description="Theo dõi tăng trưởng, mức độ hoàn thiện và hoạt động trên toàn bộ hành trình người dùng."><Button icon="download">Xuất báo cáo</Button></AdminHeader>
      <Card className="report-filter-bar"><div><Icon name="info" /><span><strong>Dữ liệu tổng hợp</strong><small>Cập nhật lần cuối 18/08/2025, 10:30</small></span></div><Select label="Khoảng thời gian" options={["30 ngày gần nhất", "3 tháng gần nhất", "6 tháng gần nhất", "12 tháng gần nhất"]} value={period} onChange={setPeriod} /></Card>
      <section className="report-summary-grid">{[
        ["Tổng người dùng", "12.482", "+12,4%", "users"],
        ["Hồ sơ hoàn tất", "8.946", "71,7%", "circle-check"],
        ["Kế hoạch đã tạo", "7.215", "+184", "target"],
        ["Người dùng hoạt động", "58%", "+6,2%", "chart"],
        ["Lượt dùng AI", "1.842", "+18,2%", "sparkles"],
        ["Yêu cầu tư vấn", "146", "84 hoàn tất", "message"],
      ].map(([label, value, trend, icon]) => <Card className="report-summary-card" key={label}><span><Icon name={icon as IconName} /></span><div><small>{label}</small><strong>{value}</strong><b>{trend}</b></div></Card>)}</section>
      <section className="reports-grid">
        <ReportCard title="Tăng trưởng người dùng" subtitle={period} value="+2.642" trend="+12,4%" summary="Tăng trưởng ổn định, trung bình 440 người dùng mới mỗi tháng."><ReportLineChart /></ReportCard>
        <ReportCard title="Hoàn thiện hồ sơ" subtitle="Tỷ lệ hồ sơ đủ dữ liệu" value="71,7%" trend="+4,8%" summary="Dữ liệu BHXH và khoản nợ là hai phần thường còn thiếu."><ReportBars kind="profile" /></ReportCard>
        <ReportCard title="Kế hoạch nghỉ hưu" subtitle="Số kế hoạch được tạo mới" value="7.215" trend="+184 tháng này" summary="80,6% người dùng có hồ sơ hoàn tất đã tạo ít nhất một kế hoạch."><ReportBars kind="plan" /></ReportCard>
        <ReportCard title="Mức độ tương tác" subtitle="Người dùng hoạt động hàng tháng" value="58%" trend="+6,2%" summary="Theo dõi kế hoạch và mô phỏng là hai hoạt động quay lại phổ biến nhất."><ReportLineChart variant="engagement" /></ReportCard>
        <ReportCard title="Sử dụng AI" subtitle="Lượt hội thoại theo tháng" value="1.842" trend="+18,2%" summary="86% phản hồi được đánh giá hữu ích; 2,4% cần đội ngũ xem lại."><ReportBars kind="ai" /></ReportCard>
        <ReportCard title="Yêu cầu tư vấn" subtitle="Phân bổ theo trạng thái" value="146" trend="84 hoàn tất" summary="Thời gian phản hồi đầu tiên trung bình là 42 phút."><ReportBars kind="consultation" /></ReportCard>
      </section>
    </div>
  );
}

function SettingNav() {
  return <nav className="settings-section-nav" aria-label="Nhóm cấu hình">{settingsNavigation.map(({ label, icon, path }) => <NavLink className={({ isActive }) => isActive ? "is-active" : ""} key={path} to={path}><Icon name={icon} /><span>{label}</span><Icon name="chevron-right" size="small" /></NavLink>)}</nav>;
}

function SettingsCard({ title, description, saved, onSave, children }: { title: string; description: string; saved: boolean; onSave: () => void; children: React.ReactNode }) {
  return <Card className="system-setting-card"><header><div><h2>{title}</h2><p>{description}</p></div>{saved && <Badge tone="success">Đã lưu</Badge>}</header><div className="system-setting-body">{children}</div><footer><span><Icon name="info" size="small" /> Thay đổi được ghi vào nhật ký kiểm toán.</span><Button onClick={onSave}>Lưu thay đổi</Button></footer></Card>;
}

export function GeneralSettings() {
  const [saved, setSaved] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  return <SettingsCard title="Cài đặt chung" description="Thông tin hiển thị và hành vi chung của hệ thống." saved={saved} onSave={() => setSaved(true)}><div className="settings-form-grid"><Input label="Tên hệ thống" defaultValue="An Hưu" /><Select label="Ngôn ngữ mặc định" options={["Tiếng Việt", "English"]} value="Tiếng Việt" /><Select label="Múi giờ" options={["GMT+7 · Việt Nam", "GMT+8", "GMT+9"]} value="GMT+7 · Việt Nam" /><Input label="Email hỗ trợ" defaultValue="hotro@anhuu.vn" type="email" /></div><div className="setting-toggle-row"><div><strong>Chế độ bảo trì</strong><small>Hiển thị thông báo và tạm dừng thao tác ghi dữ liệu.</small></div><Switch checked={maintenance} label={maintenance ? "Đang bật" : "Đang tắt"} onChange={(value) => { setMaintenance(value); setSaved(false); }} /></div>{maintenance && <Alert tone="warning" title="Chế độ bảo trì đang bật">Người dùng sẽ không thể cập nhật hồ sơ hoặc kế hoạch cho đến khi tắt chế độ này.</Alert>}</SettingsCard>;
}

export function IntegrationSettings() {
  const [saved, setSaved] = useState(false);
  const [integrations, setIntegrations] = useState([true, true, false]);
  const items = [["Dịch vụ email", "Gửi email giao dịch và báo cáo", "Đã kết nối"], ["Kho lưu trữ báo cáo", "Lưu trữ an toàn các tệp PDF", "Đã kết nối"], ["Đồng bộ dữ liệu đối tác", "Cập nhật thông tin sản phẩm theo lịch", "Chưa kết nối"]];
  return <SettingsCard title="Tích hợp" description="Kết nối các dịch vụ vận hành được An Hưu sử dụng." saved={saved} onSave={() => setSaved(true)}><div className="integration-list">{items.map(([name, detail, status], index) => <div key={name}><span className="integration-icon"><Icon name={index === 0 ? "message" : index === 1 ? "file-text" : "briefcase"} /></span><div><strong>{name}</strong><small>{detail}</small></div><Badge tone={integrations[index] ? "success" : "neutral"}>{status}</Badge><Switch checked={integrations[index]} label={integrations[index] ? "Đang bật" : "Đang tắt"} onChange={(value) => { setIntegrations(integrations.map((item, itemIndex) => itemIndex === index ? value : item)); setSaved(false); }} /></div>)}</div></SettingsCard>;
}

export function NotificationSettings() {
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [critical, setCritical] = useState(true);
  return <SettingsCard title="Thông báo hệ thống" description="Cấu hình kênh mặc định và cảnh báo vận hành." saved={saved} onSave={() => setSaved(true)}><div className="settings-form-grid"><Input label="Email nhận cảnh báo" defaultValue="operations@anhuu.vn" type="email" /><Select label="Tần suất tổng hợp" options={["Hàng ngày", "Hàng tuần", "Không gửi tổng hợp"]} value="Hàng ngày" /></div><div className="setting-toggle-list"><div><span><strong>Email giao dịch</strong><small>Gửi xác nhận cho các hành động quan trọng.</small></span><Switch checked={email} label={email ? "Đang bật" : "Đang tắt"} onChange={(value) => { setEmail(value); setSaved(false); }} /></div><div><span><strong>Thông báo trong ứng dụng</strong><small>Hiển thị cập nhật trực tiếp trong An Hưu.</small></span><Switch checked={inApp} label={inApp ? "Đang bật" : "Đang tắt"} onChange={(value) => { setInApp(value); setSaved(false); }} /></div><div><span><strong>Cảnh báo vận hành quan trọng</strong><small>Luôn thông báo khi có sự cố ảnh hưởng dữ liệu.</small></span><Switch checked={critical} label={critical ? "Đang bật" : "Đang tắt"} onChange={(value) => { setCritical(value); setSaved(false); }} /></div></div></SettingsCard>;
}

export function PrivacySettings() {
  const [saved, setSaved] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [exportApproval, setExportApproval] = useState(true);
  return <SettingsCard title="Quyền riêng tư" description="Quản lý thời gian lưu trữ và cách dữ liệu được sử dụng." saved={saved} onSave={() => setSaved(true)}><Alert tone="warning" title="Cấu hình có ảnh hưởng đến dữ liệu người dùng">Chỉ thay đổi sau khi đã kiểm tra chính sách và nghĩa vụ lưu trữ hiện hành.</Alert><div className="settings-form-grid"><Select label="Thời gian lưu hồ sơ đã đóng" options={["3 năm", "5 năm", "7 năm", "10 năm"]} value="5 năm" /><Select label="Thời gian lưu audit log" options={["1 năm", "3 năm", "5 năm"]} value="3 năm" /></div><div className="setting-toggle-list"><div><span><strong>Phân tích dữ liệu ẩn danh</strong><small>Dùng dữ liệu đã loại bỏ định danh để cải thiện sản phẩm.</small></span><Switch checked={analytics} label={analytics ? "Đang bật" : "Đang tắt"} onChange={(value) => { setAnalytics(value); setSaved(false); }} /></div><div><span><strong>Phê duyệt trước khi xuất dữ liệu</strong><small>Yêu cầu quản trị viên thứ hai xác nhận yêu cầu xuất dữ liệu.</small></span><Switch checked={exportApproval} label={exportApproval ? "Bắt buộc" : "Không bắt buộc"} onChange={(value) => { setExportApproval(value); setSaved(false); }} /></div></div></SettingsCard>;
}

export function AuditLog() {
  const [filter, setFilter] = useState("Tất cả hoạt động");
  const rows = [["Lê Lan Anh", "Gửi thông báo hệ thống", "Tất cả người dùng", "18/08/2025, 10:42", "Thành công"], ["Nguyễn Thu Hương", "Cập nhật giả định tài chính", "Lợi suất kỳ vọng", "18/08/2025, 09:15", "Thành công"], ["Phạm Minh Tú", "Thay đổi trạng thái tích hợp", "Đồng bộ dữ liệu đối tác", "17/08/2025, 16:30", "Thành công"], ["Lê Lan Anh", "Xuất báo cáo", "Báo cáo người dùng tháng 8", "17/08/2025, 14:05", "Thành công"], ["Hệ thống", "Đăng nhập thất bại", "Tài khoản quản trị", "17/08/2025, 08:20", "Cần kiểm tra"]];
  return <Card className="audit-log-card"><header><div><h2>Nhật ký kiểm toán</h2><p>Lịch sử các hành động quản trị quan trọng.</p></div><div><Select label="Loại hoạt động" options={["Tất cả hoạt động", "Cấu hình", "Dữ liệu", "Bảo mật", "Thông báo"]} value={filter} onChange={setFilter} /><Button variant="secondary" icon="download">Xuất nhật ký</Button></div></header><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Thời gian</th><th>Kết quả</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row[0]}-${row[3]}`}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td><td><Badge tone={row[4] === "Thành công" ? "success" : "warning"}>{row[4]}</Badge></td></tr>)}</tbody></table></div></Card>;
}

export function SettingsPage() {
  return <div className="admin-page settings-page"><AdminHeader title="Cấu hình hệ thống" description="Quản lý từng nhóm thiết lập vận hành, tích hợp và quyền riêng tư." /><div className="settings-layout"><SettingNav /><div className="settings-content"><Outlet /></div></div></div>;
}

function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const current = adminNavigation.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return <header className="admin-topbar"><div className="admin-mobile-brand"><IconButton icon="grid" label="Mở menu quản trị" onClick={onMenu} /><Brand /></div><SearchField label="Tìm kiếm toàn hệ thống" placeholder="Tìm ticket, báo cáo hoặc cấu hình..." hideLabel /><div className="admin-topbar-context"><span>{current?.label ?? "Quản trị"}</span><small>Dữ liệu minh họa · Bản demo</small></div><div className="admin-topbar-actions"><Link className="icon-button" to="/" aria-label="Chọn khu vực demo" title="Chọn khu vực demo"><Icon name="home" /></Link><Tooltip content="3 ticket cần chú ý"><Link className="icon-button" to="/admin/support" aria-label="Công việc cần chú ý"><Icon name="alert" /></Link></Tooltip><Tooltip content="Mẫu thông báo"><Link className="icon-button" to="/admin/support?tab=templates" aria-label="Thông báo"><Icon name="bell" /></Link></Tooltip><Avatar initials={user?.initials || "LA"} name={user?.name || "Lê Lan Anh"} detail={user?.detail || "Quản trị viên"} onLogout={handleLogout} /></div></header>;
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMobileMenu(false), [pathname]);
  return <div className={`admin-app-shell ${collapsed ? "admin-is-collapsed" : ""}`}><AdminSidebar collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} /><div className="admin-workspace"><AdminTopbar onMenu={() => setMobileMenu(true)} /><main className="admin-main" id="main-content"><Outlet /></main></div><Drawer open={mobileMenu} title="Admin Console" onClose={() => setMobileMenu(false)}><AdminNav onNavigate={() => setMobileMenu(false)} /><Link className="demo-home-link" to="/">Chọn khu vực demo</Link></Drawer></div>;
}
