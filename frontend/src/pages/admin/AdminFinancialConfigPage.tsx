import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Icon, Input, Modal, Textarea, useNotification } from "../../components/ui";
import { useI18n } from "../../i18n";
import {
  approveAssumption,
  createAdminAssumptionDraft,
  fetchAdminAssumptionDetail,
  fetchAdminAssumptions,
  previewAssumptionImpact,
  publishAssumption,
  validateAdminAssumption,
  type AssumptionDetail,
  type AssumptionDocument,
  type AssumptionImpact,
  type AssumptionsListResponse,
} from "../../services/assumptions";

const statusTone = (status: AssumptionDetail["status"]): "warning" | "info" | "success" =>
  status === "PUBLISHED" ? "success" : status === "APPROVED" ? "info" : "warning";

const getSourceKindInfo = (kind: string, isEn: boolean): { label: string; tone: "info" | "warning" | "success" | "neutral" } => {
  switch (kind) {
    case "HISTORICAL_OFFICIAL":
      return {
        label: isEn ? "Official Historical" : "Số liệu lịch sử chính thức",
        tone: "info",
      };
    case "FORECAST":
      return {
        label: isEn ? "International Forecast" : "Dự báo quốc tế",
        tone: "warning",
      };
    case "AN_HUU_LONG_TERM":
      return {
        label: isEn ? "An Huu Long-term" : "Giả định dài hạn An Hưu",
        tone: "neutral",
      };
    case "ASSET_RESEARCH":
      return {
        label: isEn ? "Capital Market Research" : "Nghiên cứu thị trường vốn",
        tone: "success",
      };
    default:
      return { label: kind, tone: "neutral" };
  }
};

export default function AdminFinancialConfigPage() {
  const { notify } = useNotification();
  const { language } = useI18n();
  const isEn = language === "en";
  const [versions, setVersions] = useState<AssumptionsListResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssumptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  // U1: Approval Modal state
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [impactData, setImpactData] = useState<AssumptionImpact | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  // U1: Publish Modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  // U9: Create New Version Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createStartYear, setCreateStartYear] = useState(new Date().getFullYear());
  const [createEndYear, setCreateEndYear] = useState(new Date().getFullYear() + 25);
  const [createReason, setCreateReason] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchAdminAssumptions(1, 100)
      .then((result) => {
        if (!active) return;
        setVersions(result);
        setSelectedId((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id || null);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : (isEn ? "Could not load assumption versions." : "Không thể tải các phiên bản giả định.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, isEn]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    setDetailLoading(true);
    setError("");
    fetchAdminAssumptionDetail(selectedId)
      .then((result) => { if (active) setDetail(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : (isEn ? "Could not load assumption details." : "Không thể tải chi tiết bộ giả định.")); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, reload, isEn]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : (isEn ? "The server rejected this action." : "Máy chủ từ chối thao tác này.")); }
    finally { setBusy(false); }
  };

  const validateSelected = () => detail && run(async () => {
    const result = await validateAdminAssumption(detail.id);
    if (result.status === "VALID") notify.success(isEn ? "Configuration is valid" : "Cấu hình hợp lệ", detail.data.title);
    else setError((isEn ? "Incomplete configuration: " : "Cấu hình chưa đầy đủ: ") + result.issues.map((issue) => `${issue.path}: ${issue.code}`).join(", "));
  });

  // U1: Open real Approval Modal instead of window.confirm/prompt
  const approveSelected = () => detail && run(async () => {
    const validation = await validateAdminAssumption(detail.id);
    if (validation.status !== "VALID") {
      setError((isEn ? "Resolve these issues before approval: " : "Cần xử lý trước khi duyệt: ") + validation.issues.map((issue) => `${issue.path}: ${issue.code}`).join(", "));
      return;
    }
    const impact = await previewAssumptionImpact(detail.id, detail.revision);
    setImpactData(impact);
    setApprovalNote("");
    setApprovalError("");
    setApprovalModalOpen(true);
  });

  const handleConfirmApproval = async () => {
    if (!detail || !impactData) return;
    if (approvalNote.trim().length < 3) {
      setApprovalError(isEn ? "Approval note must be at least 3 characters." : "Ghi chú phê duyệt phải có ít nhất 3 ký tự.");
      return;
    }
    setApprovalLoading(true);
    setApprovalError("");
    try {
      const updated = await approveAssumption(detail.id, detail.revision, impactData.impactToken, approvalNote.trim());
      setDetail(updated);
      setReload((value) => value + 1);
      setApprovalModalOpen(false);
      notify.success(isEn ? "Assumption set approved" : "Đã phê duyệt bộ giả định", updated.data.title);
    } catch (cause) {
      setApprovalError(cause instanceof Error ? cause.message : (isEn ? "Could not approve assumption." : "Không thể phê duyệt bộ giả định."));
    } finally {
      setApprovalLoading(false);
    }
  };

  // U1: Open real Publish Modal instead of window.confirm
  const publishSelected = () => {
    if (!detail) return;
    setPublishModalOpen(true);
  };

  const handleConfirmPublish = async () => {
    if (!detail) return;
    setPublishLoading(true);
    try {
      const updated = await publishAssumption(detail.id, detail.revision);
      setDetail(updated);
      setReload((value) => value + 1);
      setPublishModalOpen(false);
      notify.success(isEn ? "Assumption set published" : "Đã công bố bộ giả định", updated.data.title);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isEn ? "Could not publish assumption." : "Không thể công bố bộ giả định."));
    } finally {
      setPublishLoading(false);
    }
  };

  // U9: Open Create Version Modal
  const openCreateModal = () => {
    const startYear = detail?.data.projectionStartYear || new Date().getFullYear();
    const endYear = detail?.data.projectionEndYear || (startYear + 25);
    setCreateTitle(detail ? `${detail.data.title} (Draft v${(versions?.total || 1) + 1})` : `Bộ giả định tài chính ${startYear}–${endYear}`);
    setCreateStartYear(startYear);
    setCreateEndYear(endYear);
    setCreateReason(isEn ? "Periodic macroeconomic review and return update." : "Cập nhật định kỳ tham số kinh tế vĩ mô và lợi suất thị trường.");
    setCreateError("");
    setCreateModalOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (createTitle.trim().length < 3) {
      setCreateError(isEn ? "Title must have at least 3 characters." : "Tiêu đề phải có ít nhất 3 ký tự.");
      return;
    }
    if (createReason.trim().length < 3) {
      setCreateError(isEn ? "Reason must have at least 3 characters." : "Lý do phải có ít nhất 3 ký tự.");
      return;
    }
    if (createStartYear > createEndYear) {
      setCreateError(isEn ? "Start year cannot be greater than end year." : "Năm bắt đầu không được lớn hơn năm kết thúc.");
      return;
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      const doc: AssumptionDocument = {
        schemaVersion: 2,
        title: createTitle.trim(),
        currency: "VND",
        effectiveFrom: new Date().toISOString().split("T")[0],
        projectionStartYear: Number(createStartYear),
        projectionEndYear: Number(createEndYear),
        reason: createReason.trim(),
        sources: detail?.data.sources || [],
        historicalCpi: detail?.data.historicalCpi || [],
        inflation: detail?.data.inflation || [],
        assetClasses: detail?.data.assetClasses || [],
        returns: detail?.data.returns || [],
      };
      const created = await createAdminAssumptionDraft(doc);
      setCreateModalOpen(false);
      setReload((v) => v + 1);
      setSelectedId(created.id);
      notify.success(isEn ? "New assumption version created" : "Đã tạo phiên bản giả định mới", created.data.title);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : (isEn ? "Failed to create draft." : "Không thể tạo bản nháp."));
    } finally {
      setCreateLoading(false);
    }
  };

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("vi-VN") : "-";
  const publishedCount = versions?.items.filter((item) => item.status === "PUBLISHED").length || 0;

  return (
    <div className="admin-page financial-config-page">
      <header className="admin-page-header">
        <div>
          <span>{isEn ? "RISK GOVERNANCE & MATHEMATICAL MODELS" : "QUẢN TRỊ RỦI RO & MÔ HÌNH TOÁN"}</span>
          <h1>{isEn ? "Financial Assumption Versions" : "Các phiên bản giả định tài chính"}</h1>
          <p>{isEn ? "Review, approve and publish server-managed annual assumption series." : "Rà soát, phê duyệt và công bố chuỗi giả định theo năm được quản lý trên máy chủ."}</p>
        </div>
      </header>

      <Alert tone="warning" title={isEn ? "Governed configuration" : "Cấu hình có kiểm soát"}>
        {isEn ? "Published versions are immutable and selectable by plans. Approval requires validation and an impact review." : "Phiên bản đã công bố là bất biến và có thể được kế hoạch lựa chọn. Phê duyệt yêu cầu kiểm tra cấu hình và xem tác động."}
      </Alert>
      {error && <Alert tone="danger" title={isEn ? "Assumption service error" : "Lỗi dịch vụ giả định"}>{error}</Alert>}

      <div className="financial-version-grid">
        <Card className="formula-version-card">
          <span className="formula-icon"><Icon name="target" size="large" /></span>
          <div>
            <Badge tone={detail ? statusTone(detail.status) : "neutral"}>{detail?.status || (loading ? (isEn ? "Loading" : "Đang tải") : (isEn ? "Unconfigured" : "Chưa cấu hình"))}</Badge>
            <h2>{detail?.data.title || (isEn ? "No assumption version selected" : "Chưa chọn phiên bản giả định")}</h2>
            <p>{detail ? `${isEn ? "Version" : "Phiên bản"} ${detail.version} · ${isEn ? "Revision" : "Bản sửa"} ${detail.revision} · ${detail.data.projectionStartYear}-${detail.data.projectionEndYear}` : (isEn ? "Create a server draft before running the approval workflow." : "Hãy tạo bản nháp trên máy chủ trước khi thực hiện quy trình phê duyệt.")}</p>
          </div>
          <Button variant="secondary" icon="download" onClick={() => window.print()}>{isEn ? "Print" : "In"}</Button>
        </Card>

        <Card className="financial-governance-card">
          <header><Icon name="circle-check" /><div><h2>{isEn ? "Server workflow" : "Quy trình máy chủ"}</h2><p>{isEn ? "Actual stored versions" : "Phiên bản đang lưu thực tế"}</p></div></header>
          <div>
            <span><Icon name="check" /> {versions?.total || 0} {isEn ? "total versions" : "phiên bản"}</span>
            <span><Icon name="check" /> {publishedCount} {isEn ? "published versions" : "phiên bản đã công bố"}</span>
            <span><Icon name="check" /> {detail?.data.sources.length || 0} {isEn ? "documented sources" : "nguồn tham chiếu"}</span>
            <span><Icon name="check" /> {detail?.data.returns.length || 0} {isEn ? "annual return rows" : "dòng lợi suất theo năm"}</span>
          </div>
        </Card>
      </div>

      <Card className="financial-assumptions-card">
        <div className="ai-section-header">
          <div>
            <h2>{isEn ? "Stored versions" : "Các phiên bản đã lưu"}</h2>
            <p>{isEn ? "Select a version to inspect its server document and workflow state." : "Chọn phiên bản để xem tài liệu máy chủ và trạng thái quy trình."}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Badge tone="soft">{versions?.total || 0}</Badge>
            <Button variant="secondary" size="small" onClick={openCreateModal}>
              {isEn ? "Adjust parameters" : "Điều chỉnh tham số"}
            </Button>
            <Button variant="primary" size="small" icon="plus" onClick={openCreateModal}>
              {isEn ? "New Version" : "Tạo phiên bản mới"}
            </Button>
          </div>
        </div>
        <div className="financial-table-scroll">
          <table className="financial-assumptions-table">
            <thead><tr><th>{isEn ? "Version" : "Phiên bản"}</th><th>{isEn ? "Title" : "Tiêu đề"}</th><th>{isEn ? "Status" : "Trạng thái"}</th><th>{isEn ? "Projection" : "Giai đoạn dự phóng"}</th><th>{isEn ? "Effective" : "Hiệu lực"}</th><th /></tr></thead>
            <tbody>
              {!loading && !versions?.items.length && <tr><td colSpan={6}>{isEn ? "No assumption versions configured." : "Chưa có phiên bản giả định nào."}</td></tr>}
              {versions?.items.map((item) => (
                <tr key={item.id}>
                  <td><strong>v{item.version}</strong><small>r{item.revision}</small></td>
                  <td><strong>{item.title}</strong></td>
                  <td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                  <td>{item.projectionStartYear}-{item.projectionEndYear}</td>
                  <td>{formatDate(item.effectiveAt)}</td>
                  <td><Button variant="secondary" size="small" disabled={detailLoading || selectedId === item.id} onClick={() => setSelectedId(item.id)}>{selectedId === item.id ? (isEn ? "Selected" : "Đang chọn") : (isEn ? "View" : "Xem")}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && (
        <Card className="change-history-card assumption-detail-card">
          <div className="ai-section-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 4 }}>
                <h2>{detail.data.title}</h2>
                <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
              </div>
              <p>{detail.data.reason}</p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button variant="secondary" disabled={busy} onClick={validateSelected}>{isEn ? "Validate" : "Kiểm tra"}</Button>
              {detail.status === "DRAFT" && <Button disabled={busy} onClick={approveSelected}>{isEn ? "Review & approve" : "Xem tác động & duyệt"}</Button>}
              {detail.status === "APPROVED" && <Button disabled={busy} onClick={publishSelected}>{isEn ? "Publish" : "Công bố"}</Button>}
            </div>
          </div>

          <div className="financial-version-grid" style={{ marginTop: "var(--space-5)" }}>
            <div className="assumption-info-card">
              <div className="assumption-info-header">
                <div className="assumption-info-title">
                  <Icon name="target" size="small" />
                  <h4>{isEn ? "Configuration coverage" : "Phạm vi cấu hình"}</h4>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge tone="neutral">{detail.data.projectionStartYear}–{detail.data.projectionEndYear}</Badge>
                  <Badge tone="soft">{detail.data.currency}</Badge>
                </div>
              </div>

              <div className="assumption-metrics-row">
                <div className="assumption-metric-pill">
                  <span className="assumption-metric-num">{detail.data.inflation.length}</span>
                  <span className="assumption-metric-label">{isEn ? "inflation rows" : "dòng lạm phát"}</span>
                </div>
                <div className="assumption-metric-pill">
                  <span className="assumption-metric-num">{detail.data.assetClasses.length}</span>
                  <span className="assumption-metric-label">{isEn ? "asset classes" : "nhóm tài sản"}</span>
                </div>
                <div className="assumption-metric-pill">
                  <span className="assumption-metric-num">{detail.data.returns.length}</span>
                  <span className="assumption-metric-label">{isEn ? "return rows" : "dòng lợi suất"}</span>
                </div>
              </div>

              <div className="assumption-info-meta">
                <span>{isEn ? "Created" : "Tạo lúc"}: {formatDate(detail.createdAt)}</span>
                <span>·</span>
                <span>{isEn ? "Effective" : "Hiệu lực"}: {formatDate(detail.effectiveAt)}</span>
              </div>
            </div>

            <div className="assumption-info-card">
              <div className="assumption-info-header">
                <div className="assumption-info-title">
                  <Icon name="shield" size="small" />
                  <h4>{isEn ? "Approval record" : "Thông tin phê duyệt"}</h4>
                </div>
                {detail.approval ? (
                  <Badge tone="success">{isEn ? "Approved" : "Đã phê duyệt"}</Badge>
                ) : (
                  <Badge tone="warning">{isEn ? "Pending" : "Chưa phê duyệt"}</Badge>
                )}
              </div>

              {detail.approval ? (
                <div className="assumption-approval-content">
                  <div className="assumption-review-note">
                    <p>{detail.approval.reviewNote}</p>
                  </div>
                  <div className="assumption-info-meta">
                    <span title={detail.approval.actor} className="assumption-actor-tag">
                      <code>{detail.approval.actor.length > 20 ? `${detail.approval.actor.slice(0, 8)}...${detail.approval.actor.slice(-6)}` : detail.approval.actor}</code>
                    </span>
                    <span>·</span>
                    <span>{formatDate(detail.approval.approvedAt)}</span>
                  </div>
                </div>
              ) : (
                <div className="assumption-empty-approval">
                  <p>{isEn ? "This version has not been approved." : "Phiên bản này đang chờ xem xét và phê duyệt."}</p>
                </div>
              )}
            </div>
          </div>

          <div className="financial-table-scroll" style={{ marginTop: "var(--space-5)" }}>
            <table className="financial-assumptions-table modern-sources-table">
              <thead>
                <tr>
                  <th>{isEn ? "Source" : "Nguồn dữ liệu"}</th>
                  <th>{isEn ? "Publisher" : "Đơn vị phát hành"}</th>
                  <th>{isEn ? "Type" : "Phân loại"}</th>
                  <th>{isEn ? "Coverage" : "Phạm vi"}</th>
                  <th>{isEn ? "Release" : "Ấn bản"}</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.sources.map((source) => {
                  const kindInfo = getSourceKindInfo(source.kind, isEn);
                  return (
                    <tr key={source.id}>
                      <td>
                        <div className="source-title-cell">
                          <strong>{source.title}</strong>
                          <code className="source-id-tag">{source.id}</code>
                        </div>
                      </td>
                      <td>
                        <span className="source-publisher-cell">{source.publisher}</span>
                      </td>
                      <td>
                        <Badge tone={kindInfo.tone}>{kindInfo.label}</Badge>
                      </td>
                      <td>
                        <span className="assumption-period-tag">{source.fromYear}–{source.toYear}</span>
                      </td>
                      <td>
                        <span className="assumption-release-tag" title={source.release}>{source.release}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* U1: Modal Phê Duyệt Thật */}
      <Modal
        open={approvalModalOpen}
        title={isEn ? "Approve Financial Assumption Set" : "Phê duyệt bộ giả định tài chính"}
        onClose={() => !approvalLoading && setApprovalModalOpen(false)}
      >
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <div style={{ background: "rgba(23, 59, 87, 0.04)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
            <h4 style={{ margin: "0 0 var(--space-1) 0", color: "var(--color-midnight-900)" }}>{detail?.data.title}</h4>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "13px", color: "var(--color-text-muted)" }}>
              <span>{isEn ? "Projection:" : "Giai đoạn dự phóng:"} <strong>{detail?.data.projectionStartYear}–{detail?.data.projectionEndYear}</strong></span>
              <span>·</span>
              <span>{isEn ? "Revision:" : "Bản sửa:"} <strong>r{detail?.revision}</strong></span>
            </div>
          </div>

          <div style={{ padding: "var(--space-3)", background: impactData && impactData.currentPlansChanged > 0 ? "rgba(229, 169, 60, 0.12)" : "rgba(34, 197, 94, 0.08)", borderRadius: "var(--radius-sm)", border: `1px solid ${impactData && impactData.currentPlansChanged > 0 ? "rgba(229, 169, 60, 0.3)" : "rgba(34, 197, 94, 0.2)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: 600, fontSize: "13px" }}>
              <Icon name={impactData && impactData.currentPlansChanged > 0 ? "alert" : "circle-check"} size="small" />
              <span>{isEn ? "Impact Review Result" : "Kết quả đánh giá tác động"}</span>
            </div>
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "13px", color: "var(--color-text-strong)" }}>
              {isEn
                ? `Active retirement plans affected: ${impactData?.currentPlansChanged ?? 0}`
                : `Số kế hoạch hưu trí hiện tại bị ảnh hưởng: ${impactData?.currentPlansChanged ?? 0}`}
            </p>
          </div>

          <div>
            <Textarea
              label={isEn ? "Approval Review Note (Required)" : "Ghi chú phê duyệt (Bắt buộc)"}
              rows={3}
              placeholder={isEn ? "Enter rationale, board approval code or committee note..." : "Nhập căn cứ, số quyết định phê duyệt hoặc ghi chú của hội đồng..."}
              value={approvalNote}
              onChange={setApprovalNote}
            />
            {approvalError && <small style={{ color: "var(--color-danger)", display: "block", marginTop: 4 }}>{approvalError}</small>}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <Button variant="secondary" disabled={approvalLoading} onClick={() => setApprovalModalOpen(false)}>
              {isEn ? "Cancel" : "Hủy"}
            </Button>
            <Button
              variant="primary"
              disabled={approvalLoading || approvalNote.trim().length < 3}
              onClick={handleConfirmApproval}
            >
              {approvalLoading ? (isEn ? "Approving..." : "Đang phê duyệt...") : (isEn ? "Confirm Approval" : "Xác nhận phê duyệt")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* U1: Modal Công Bố Thật */}
      <Modal
        open={publishModalOpen}
        title={isEn ? "Publish Assumption Version" : "Công bố phiên bản giả định"}
        onClose={() => !publishLoading && setPublishModalOpen(false)}
      >
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <Alert tone="warning" title={isEn ? "Irreversible Governance Action" : "Lưu ý quản trị quan trọng"}>
            {isEn
              ? "Once published, this assumption version becomes permanently immutable. Member retirement plans can select it as an official calculation basis."
              : "Sau khi công bố, phiên bản giả định này sẽ trở thành bất biến vĩnh viễn (immutable). Các kế hoạch hưu trí của người dùng sẽ có thể chọn phiên bản này làm cơ sở tính toán chính thức."}
          </Alert>

          <div style={{ background: "rgba(23, 59, 87, 0.04)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
            <strong style={{ display: "block", color: "var(--color-midnight-900)" }}>{detail?.data.title}</strong>
            <small style={{ color: "var(--color-text-muted)" }}>
              {isEn ? "Version" : "Phiên bản"} v{detail?.version} · {isEn ? "Revision" : "Bản sửa"} r{detail?.revision} · {detail?.data.projectionStartYear}–{detail?.data.projectionEndYear}
            </small>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <Button variant="secondary" disabled={publishLoading} onClick={() => setPublishModalOpen(false)}>
              {isEn ? "Cancel" : "Hủy"}
            </Button>
            <Button
              variant="primary"
              disabled={publishLoading}
              onClick={handleConfirmPublish}
            >
              {publishLoading ? (isEn ? "Publishing..." : "Đang công bố...") : (isEn ? "Publish Now" : "Công bố ngay")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* U9: Modal Tạo Phiên Bản Mới */}
      <Modal
        open={createModalOpen}
        title={isEn ? "Create New Financial Assumption Version" : "Tạo phiên bản giả định mới"}
        onClose={() => !createLoading && setCreateModalOpen(false)}
      >
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}>
            {isEn
              ? "Draft a new server-governed assumption model. You can inherit parameters from the active version."
              : "Khởi tạo bản nháp mô hình giả định mới trên máy chủ. Bạn có thể kế thừa các tham số từ phiên bản đang hoạt động."}
          </p>

          {createError && <Alert tone="danger" title={createError} />}

          <Input
            label={isEn ? "Version Title" : "Tiêu đề phiên bản"}
            value={createTitle}
            onChange={setCreateTitle}
            placeholder={isEn ? "e.g. Financial Assumptions 2026-2050" : "Ví dụ: Giả định tài chính giai đoạn 2026-2050"}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <Input
              label={isEn ? "Start Year" : "Năm bắt đầu dự phóng"}
              type="number"
              value={String(createStartYear)}
              onChange={(val) => setCreateStartYear(Number(val) || 2026)}
            />
            <Input
              label={isEn ? "End Year" : "Năm kết thúc dự phóng"}
              type="number"
              value={String(createEndYear)}
              onChange={(val) => setCreateEndYear(Number(val) || 2050)}
            />
          </div>

          <Textarea
            label={isEn ? "Update Rationale / Notes" : "Lý do cập nhật / Căn cứ"}
            rows={3}
            value={createReason}
            onChange={setCreateReason}
            placeholder={isEn ? "State the macro-economic baseline or policy update reason..." : "Mô tả căn cứ cập nhật kinh tế vĩ mô, điều chỉnh lãi suất hoặc chính sách..."}
          />

          {detail && (
            <div style={{ padding: "var(--space-3)", background: "rgba(23, 59, 87, 0.04)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--color-text-muted)" }}>
              <Icon name="check" size="small" /> {isEn ? `Inherits ${detail.data.sources.length} sources and asset definitions from "${detail.data.title}"` : `Kế thừa ${detail.data.sources.length} nguồn tham chiếu và định nghĩa tài sản từ "${detail.data.title}"`}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <Button variant="secondary" disabled={createLoading} onClick={() => setCreateModalOpen(false)}>
              {isEn ? "Cancel" : "Hủy"}
            </Button>
            <Button
              variant="primary"
              disabled={createLoading || createTitle.trim().length < 3 || createReason.trim().length < 3 || createStartYear > createEndYear}
              onClick={handleConfirmCreate}
            >
              {createLoading ? (isEn ? "Creating..." : "Đang tạo...") : (isEn ? "Create Draft" : "Tạo bản nháp")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
