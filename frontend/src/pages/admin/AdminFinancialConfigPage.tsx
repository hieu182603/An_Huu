import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Icon, useNotification } from "../../components/ui";
import { useI18n } from "../../i18n";
import {
  approveAssumption,
  fetchAdminAssumptionDetail,
  fetchAdminAssumptions,
  previewAssumptionImpact,
  publishAssumption,
  validateAdminAssumption,
  type AssumptionDetail,
  type AssumptionsListResponse,
} from "../../services/assumptions";

const statusTone = (status: AssumptionDetail["status"]): "warning" | "info" | "success" =>
  status === "PUBLISHED" ? "success" : status === "APPROVED" ? "info" : "warning";

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

  const approveSelected = () => detail && run(async () => {
    const validation = await validateAdminAssumption(detail.id);
    if (validation.status !== "VALID") {
      setError((isEn ? "Resolve these issues before approval: " : "Cần xử lý trước khi duyệt: ") + validation.issues.map((issue) => `${issue.path}: ${issue.code}`).join(", "));
      return;
    }
    const impact = await previewAssumptionImpact(detail.id, detail.revision);
    const confirmed = window.confirm(isEn
      ? `Impact review completed. Current plans changed: ${impact.currentPlansChanged}. Continue to approval?`
      : `Đã xem tác động. Số kế hoạch hiện tại bị thay đổi: ${impact.currentPlansChanged}. Tiếp tục phê duyệt?`);
    if (!confirmed) return;
    const note = window.prompt(isEn ? "Approval note" : "Ghi chú phê duyệt");
    if (!note?.trim()) return;
    const updated = await approveAssumption(detail.id, detail.revision, impact.impactToken, note.trim());
    setDetail(updated);
    setReload((value) => value + 1);
    notify.success(isEn ? "Assumption set approved" : "Đã phê duyệt bộ giả định", updated.data.title);
  });

  const publishSelected = () => detail && run(async () => {
    if (!window.confirm(isEn ? "Publish this approved version?" : "Công bố phiên bản đã duyệt này?")) return;
    const updated = await publishAssumption(detail.id, detail.revision);
    setDetail(updated);
    setReload((value) => value + 1);
    notify.success(isEn ? "Assumption set published" : "Đã công bố bộ giả định", updated.data.title);
  });

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString(isEn ? "en-US" : "vi-VN") : "-";
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
          <div><h2>{isEn ? "Stored versions" : "Các phiên bản đã lưu"}</h2><p>{isEn ? "Select a version to inspect its server document and workflow state." : "Chọn phiên bản để xem tài liệu máy chủ và trạng thái quy trình."}</p></div>
          <Badge tone="soft">{versions?.total || 0}</Badge>
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
        <Card className="change-history-card">
          <div className="ai-section-header">
            <div><h2>{detail.data.title}</h2><p>{detail.data.reason}</p></div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button variant="secondary" disabled={busy} onClick={validateSelected}>{isEn ? "Validate" : "Kiểm tra"}</Button>
              {detail.status === "DRAFT" && <Button disabled={busy} onClick={approveSelected}>{isEn ? "Review & approve" : "Xem tác động & duyệt"}</Button>}
              {detail.status === "APPROVED" && <Button disabled={busy} onClick={publishSelected}>{isEn ? "Publish" : "Công bố"}</Button>}
            </div>
          </div>

          <div className="financial-version-grid" style={{ marginTop: "var(--space-5)" }}>
            <Card>
              <h3>{isEn ? "Configuration coverage" : "Phạm vi cấu hình"}</h3>
              <p>{detail.data.projectionStartYear}-{detail.data.projectionEndYear} · {detail.data.currency}</p>
              <p>{detail.data.inflation.length} {isEn ? "inflation rows" : "dòng lạm phát"} · {detail.data.assetClasses.length} {isEn ? "asset classes" : "nhóm tài sản"} · {detail.data.returns.length} {isEn ? "return rows" : "dòng lợi suất"}</p>
              <small>{isEn ? "Created" : "Tạo lúc"}: {formatDate(detail.createdAt)} · {isEn ? "Effective" : "Hiệu lực"}: {formatDate(detail.effectiveAt)}</small>
            </Card>
            <Card>
              <h3>{isEn ? "Approval record" : "Thông tin phê duyệt"}</h3>
              {detail.approval ? <><p>{detail.approval.reviewNote}</p><small>{detail.approval.actor} · {formatDate(detail.approval.approvedAt)}</small></> : <p>{isEn ? "This version has not been approved." : "Phiên bản này chưa được phê duyệt."}</p>}
            </Card>
          </div>

          <div className="financial-table-scroll" style={{ marginTop: "var(--space-5)" }}>
            <table className="financial-assumptions-table">
              <thead><tr><th>{isEn ? "Source" : "Nguồn"}</th><th>{isEn ? "Publisher" : "Đơn vị phát hành"}</th><th>{isEn ? "Kind" : "Loại"}</th><th>{isEn ? "Coverage" : "Phạm vi"}</th><th>{isEn ? "Release" : "Ấn bản"}</th></tr></thead>
              <tbody>{detail.data.sources.map((source) => <tr key={source.id}><td><strong>{source.title}</strong><small>{source.id}</small></td><td>{source.publisher}</td><td><Badge tone="soft">{source.kind}</Badge></td><td>{source.fromYear}-{source.toYear}</td><td>{source.release}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
