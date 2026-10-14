import { useEffect, useState } from "react";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import AdminActionButton from "./AdminActionButton";
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Modal,
  useNotification,
} from "../../components/ui";
import { useI18n } from "../../i18n";
import {
  createAdminLegalRule,
  listAdminLegalRules,
  patchAdminLegalRule,
  transitionAdminLegalRule,
  type AdminLegalRuleItem,
  type LegalRuleDraftInput,
} from "../../services/legalRules";
import { ApiError } from "../../services/api";

const statusTone = (status: AdminLegalRuleItem["status"]): "warning" | "info" | "success" | "neutral" => {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "REVIEWED":
      return "info";
    case "VALIDATED":
      return "info";
    case "DRAFT":
    default:
      return "warning";
  }
};

const statusLabel = (status: AdminLegalRuleItem["status"], isEn: boolean) => {
  switch (status) {
    case "PUBLISHED":
      return isEn ? "Published (Operational)" : "Đã công bố (Vận hành)";
    case "REVIEWED":
      return isEn ? "Reviewed (Ready to Publish)" : "Đã phê duyệt (Chờ công bố)";
    case "VALIDATED":
      return isEn ? "Validated (Ready for Review)" : "Đã kiểm chứng (Chờ duyệt)";
    case "DRAFT":
    default:
      return isEn ? "Draft (Non-calculable)" : "Bản nháp (Chưa kiểm chứng)";
  }
};

const DEFAULT_STARTER_DOC = {
  schemaVersion: 1,
  engineCode: "vn-pension-compulsory-2025",
  coverage: [
    {
      branch: "BH1_COMPULSORY_NORMAL",
      strategyCode: "STANDARD_RETIREMENT_2025",
      citationIds: ["ND135_2020_NDCP", "LUAT_BHXH_2024_ART98"],
      requiredTableKeys: ["RETIREMENT_AGE_TABLE_MALE", "RETIREMENT_AGE_TABLE_FEMALE"],
    },
  ],
  citations: [
    {
      id: "LUAT_BHXH_2024_ART98",
      instrument: "Luật Bảo hiểm xã hội số 41/2024/QH15",
      locator: "Điều 98",
      url: "https://thuvienphapluat.vn/van-ban/Bao-hiem/Luat-Bao-hiem-xa-hoi-2024-41-2024-QH15-562705.aspx",
      contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      effectiveFrom: "2025-07-01",
      effectiveTo: null,
    },
    {
      id: "ND135_2020_NDCP",
      instrument: "Nghị định 135/2020/NĐ-CP quy định về tuổi nghỉ hưu",
      locator: "Điều 4, Điều 5",
      url: "https://thuvienphapluat.vn/van-ban/Lao-dong-Tien-luong/Nghi-dinh-135-2020-ND-CP-tuoi-nghi-huu-457813.aspx",
      contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      effectiveFrom: "2021-01-01",
      effectiveTo: null,
    },
  ],
  tables: [
    {
      kind: "AGE_MONTHS",
      key: "RETIREMENT_AGE_TABLE_MALE",
      value: "744",
      effectiveFrom: "2025-01-01",
      effectiveTo: null,
      citationId: "ND135_2020_NDCP",
    },
    {
      kind: "AGE_MONTHS",
      key: "RETIREMENT_AGE_TABLE_FEMALE",
      value: "680",
      effectiveFrom: "2025-01-01",
      effectiveTo: null,
      citationId: "ND135_2020_NDCP",
    },
  ],
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderRadius: "6px",
  border: "1px solid var(--color-border, #cbd5e1)",
  backgroundColor: "var(--color-bg, #ffffff)",
  color: "var(--color-text, #0f172a)",
  fontSize: "0.875rem",
  boxSizing: "border-box",
};

export default function AdminLegalRulesPage() {
  const { notify } = useNotification();
  const { language } = useI18n();
  const isEn = language === "en";

  const [rules, setRules] = useState<AdminLegalRuleItem[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createEffectiveFrom, setCreateEffectiveFrom] = useState("2026-01-01");
  const [createEffectiveTo, setCreateEffectiveTo] = useState("");
  const [createSupersedesId, setCreateSupersedesId] = useState("");
  const [createDocJson, setCreateDocJson] = useState(JSON.stringify(DEFAULT_STARTER_DOC, null, 2));
  const [createError, setCreateError] = useState("");

  // Edit Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [editEffectiveFrom, setEditEffectiveFrom] = useState("");
  const [editEffectiveTo, setEditEffectiveTo] = useState("");
  const [editSupersedesId, setEditSupersedesId] = useState("");
  const [editDocJson, setEditDocJson] = useState("");
  const [editError, setEditError] = useState("");

  // Review Modal State
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState("");

  // Publish Modal State
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [publishError, setPublishError] = useState("");

  const selectedRule = rules.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    let active = true;
    const fetchRules = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await listAdminLegalRules();
        if (active) {
          setRules(res.items);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError && err.status === 403
              ? (isEn ? "Access denied: Administrator role required." : "Truy cập bị từ chối: Cần quyền Quản trị viên.")
              : (err instanceof Error ? err.message : String(err))
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchRules();
    return () => {
      active = false;
    };
  }, [reloadKey, isEn]);

  // Validation transition
  const handleValidate = async (rule: AdminLegalRuleItem) => {
    if (busy) return;
    setSelectedId(rule.id);
    setDetailOpen(true);
    setBusy(true);
    setError("");
    try {
      const updated = await transitionAdminLegalRule(rule.id, {
        action: "VALIDATE",
        expectedRevision: rule.revision,
        expectedDocumentHash: rule.documentHash,
        confirm: true,
      });
      notify.success(
        isEn ? "Validation executed" : "Đã thực hiện kiểm chứng",
        updated.validation?.valid
          ? (isEn ? "Rule set is valid and ready for review." : "Bộ luật hợp lệ, sẵn sàng chuyển bước duyệt.")
          : (isEn ? "Rule set has validation errors." : "Bộ luật còn lỗi kiểm chứng.")
      );
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Review transition
  const handleConfirmReview = async () => {
    if (!selectedRule || !reviewNote.trim()) {
      setReviewError(isEn ? "Review note is required." : "Vui lòng nhập căn cứ và ghi chú phê duyệt.");
      return;
    }
    if (!selectedRule.validation?.validationHash) {
      setReviewError(isEn ? "Validation hash missing. Run validate first." : "Thiếu mã kiểm chứng. Cần kiểm chứng trước khi duyệt.");
      return;
    }

    setBusy(true);
    setReviewError("");
    try {
      const updated = await transitionAdminLegalRule(selectedRule.id, {
        action: "REVIEW",
        expectedRevision: selectedRule.revision,
        expectedDocumentHash: selectedRule.documentHash,
        validationHash: selectedRule.validation.validationHash,
        reviewNote: reviewNote.trim(),
        confirm: true,
      });
      notify.success(
        isEn ? "Rule set reviewed" : "Đã phê duyệt bộ luật",
        isEn ? "Approved independently. Ready for publishing." : "Đã phê duyệt độc lập. Sẵn sàng công bố."
      );
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReviewOpen(false);
      setReviewNote("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setReviewError(
          isEn
            ? "Review rejected: Reviewer must be independent from authors and cannot review own draft."
            : "Từ chối duyệt: Người duyệt phải độc lập với người soạn và không được tự duyệt dự thảo của chính mình."
        );
      } else {
        setReviewError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  // Publish transition
  const handleConfirmPublish = async () => {
    if (!selectedRule || !publishConfirm) {
      setPublishError(isEn ? "Please confirm operational publishing." : "Vui lòng xác nhận công bố vận hành.");
      return;
    }
    if (!selectedRule.validation?.validationHash || !selectedRule.review?.reviewHash) {
      setPublishError(isEn ? "Validation and review hashes required." : "Cần đủ mã kiểm chứng và biên bản duyệt trước khi công bố.");
      return;
    }

    setBusy(true);
    setPublishError("");
    try {
      const updated = await transitionAdminLegalRule(selectedRule.id, {
        action: "PUBLISH",
        expectedRevision: selectedRule.revision,
        expectedDocumentHash: selectedRule.documentHash,
        validationHash: selectedRule.validation.validationHash,
        reviewHash: selectedRule.review.reviewHash,
        confirm: true,
      });
      notify.success(
        isEn ? "Rule set published" : "Đã công bố bộ luật",
        isEn ? "Active and locked for pension calculations." : "Đã có hiệu lực và khóa chỉnh sửa phục vụ tính lương hưu."
      );
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setPublishOpen(false);
      setPublishConfirm(false);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Open Edit Draft modal
  const handleOpenEdit = (rule: AdminLegalRuleItem) => {
    setSelectedId(rule.id);
    setEditEffectiveFrom(rule.draft.effectiveFrom);
    setEditEffectiveTo(rule.draft.effectiveTo || "");
    setEditSupersedesId(rule.draft.supersedesId || "");
    setEditDocJson(JSON.stringify(rule.draft.document, null, 2));
    setEditError("");
    setEditOpen(true);
  };

  // Confirm Edit Draft
  const handleConfirmEdit = async () => {
    if (!selectedRule) return;
    setEditError("");
    let parsedDoc: any;
    try {
      parsedDoc = JSON.parse(editDocJson);
    } catch {
      setEditError(isEn ? "Invalid JSON document format." : "Định dạng JSON tài liệu không hợp lệ.");
      return;
    }

    setBusy(true);
    try {
      const draft: LegalRuleDraftInput = {
        code: selectedRule.draft.code,
        effectiveFrom: editEffectiveFrom,
        effectiveTo: editEffectiveTo.trim() ? editEffectiveTo.trim() : null,
        supersedesId: editSupersedesId.trim() ? editSupersedesId.trim() : null,
        document: parsedDoc,
      };
      const updated = await patchAdminLegalRule(selectedRule.id, selectedRule.revision, draft);
      notify.success(
        isEn ? "Draft updated" : "Đã cập nhật dự thảo",
        isEn ? "Revision incremented. Status reset to DRAFT." : "Đã tăng revision. Trạng thái trở về DRAFT (cần kiểm chứng lại)."
      );
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEditError(
          isEn
            ? "Revision conflict (409): Rule was modified by another user. Reload and re-apply."
            : "Xung đột phiên bản (409): Bộ luật đã bị thay đổi bởi tác vụ khác. Hãy tải lại và áp dụng lại."
        );
      } else {
        setEditError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  // Confirm Create Draft
  const handleConfirmCreate = async () => {
    setCreateError("");
    if (!createCode.trim()) {
      setCreateError(isEn ? "Rule code is required (e.g. BH2_VOLUNTARY_2026)." : "Vui lòng nhập mã luật (ví dụ: BH2_VOLUNTARY_2026).");
      return;
    }
    let parsedDoc: any;
    try {
      parsedDoc = JSON.parse(createDocJson);
    } catch {
      setCreateError(isEn ? "Invalid JSON document format." : "Định dạng JSON tài liệu không hợp lệ.");
      return;
    }

    setBusy(true);
    try {
      const draft: LegalRuleDraftInput = {
        code: createCode.trim().toUpperCase(),
        effectiveFrom: createEffectiveFrom,
        effectiveTo: createEffectiveTo.trim() ? createEffectiveTo.trim() : null,
        supersedesId: createSupersedesId.trim() ? createSupersedesId.trim() : null,
        document: parsedDoc,
      };
      const created = await createAdminLegalRule(draft);
      notify.success(
        isEn ? "Draft created" : "Đã tạo dự thảo luật mới",
        `${created.draft.code} v${created.version}`
      );
      setRules((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setDetailOpen(true);
      setCreateOpen(false);
      setCreateCode("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const ruleActions = (rule: AdminLegalRuleItem, showDetails = true) => (
    <div className="admin-management-actions">
      {showDetails && <AdminActionButton icon="eye" label={isEn ? "View details" : "Xem chi tiết"} context={rule.draft.code}
        disabled={busy} onClick={() => { setSelectedId(rule.id); setDetailOpen(true); }} />}
      {rule.status !== "PUBLISHED" && <AdminActionButton icon="edit" label={isEn ? "Edit draft" : "Sửa dự thảo"} context={rule.draft.code}
        disabled={busy} onClick={() => handleOpenEdit(rule)} />}
      {(rule.status === "DRAFT" || rule.status === "VALIDATED") && <AdminActionButton icon="circle-check"
        label={isEn ? "Validate rule" : "Kiểm chứng bộ luật"} context={rule.draft.code} disabled={busy} onClick={() => handleValidate(rule)} />}
      {rule.status === "VALIDATED" && <AdminActionButton icon="shield" label={isEn ? "Independent review" : "Phê duyệt độc lập"} context={rule.draft.code}
        disabled={busy} onClick={() => { setSelectedId(rule.id); setReviewNote(""); setReviewError(""); setReviewOpen(true); }} />}
      {rule.status === "REVIEWED" && <AdminActionButton icon="upload" label={isEn ? "Publish rule" : "Công bố luật vận hành"} context={rule.draft.code}
        emphasis disabled={busy} onClick={() => { setSelectedId(rule.id); setPublishConfirm(false); setPublishError(""); setPublishOpen(true); }} />}
    </div>
  );

  return (
    <div className="admin-page legal-rules-page admin-management-page">
      <header className="admin-page-header">
        <div>
          <span>{isEn ? "SOCIAL INSURANCE GOVERNANCE" : "QUẢN TRỊ BẢO HIỂM XÃ HỘI"}</span>
          <h1>
            {isEn ? "Social Insurance Legal Rules Management" : "Quản trị luật Bảo hiểm xã hội"}
          </h1>
          <p style={{ color: "var(--color-text-muted, #64748b)", margin: "0.25rem 0 0" }}>
            {isEn
              ? "Strict governance of statutory formulas, contribution tables, and pension engines."
              : "Quản trị nghiêm ngặt các bộ luật BHXH, bảng tham số và chiến lược tính lương hưu."}
          </p>
        </div>
        <div className="admin-management-actions">
          <AdminActionButton icon={faRotateRight} label={isEn ? "Refresh" : "Tải lại"} onClick={() => setReloadKey((k) => k + 1)} disabled={loading || busy} />
          <AdminActionButton icon="plus" label={isEn ? "Create new draft" : "Tạo dự thảo luật mới"} emphasis onClick={() => setCreateOpen(true)} disabled={loading || busy} />
        </div>
      </header>

      {error && (
        <Alert tone="error" title={isEn ? "Error" : "Lỗi"} style={{ marginBottom: "1.5rem" }}>
          {error}
        </Alert>
      )}

      <div className="admin-management-summary">
        <Card><span>{isEn ? "Total rule sets" : "Tổng bộ luật"}</span><strong>{loading ? "…" : rules.length}</strong></Card>
        <Card><span>{isEn ? "Drafts / pending approval" : "Bản nháp / Chờ duyệt"}</span><strong>{loading ? "…" : rules.filter((rule) => rule.status !== "PUBLISHED").length}</strong></Card>
        <Card><span>{isEn ? "Published rule sets" : "Đã công bố"}</span><strong>{loading ? "…" : rules.filter((rule) => rule.status === "PUBLISHED").length}</strong></Card>
      </div>
      <Card className="admin-management-table-card">
        <div className="admin-management-section-header">
          <div><h2>{isEn ? "Legal rule sets" : "Danh sách bộ luật"}</h2><p>{isEn ? "Review each version and its effective period." : "Theo dõi từng phiên bản và thời gian hiệu lực của bộ luật."}</p></div>
          <Badge tone="soft">{rules.length}</Badge>
        </div>
        <div className="table-scroll">
          <table className="admin-management-table">
            <thead><tr>
              <th>{isEn ? "Rule set" : "Bộ luật"}</th><th>{isEn ? "Version" : "Phiên bản"}</th>
              <th>{isEn ? "Status" : "Trạng thái"}</th><th>{isEn ? "Effective period" : "Thời gian hiệu lực"}</th>
              <th>{isEn ? "Actions" : "Thao tác"}</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="admin-management-empty">{isEn ? "Loading legal rules…" : "Đang tải danh sách bộ luật…"}</td></tr>
                : !rules.length ? <tr><td colSpan={5} className="admin-management-empty">{isEn ? "No legal rule sets yet." : "Chưa có bộ luật nào."}</td></tr>
                : rules.map((rule) => <tr key={rule.id}>
                  <td><strong>{rule.draft.code}</strong><small>{rule.draft.document.citations.length} {isEn ? "legal citations" : "căn cứ pháp lý"}</small></td>
                  <td><strong>v{rule.version}</strong><small>{isEn ? "Revision" : "Bản sửa"} {rule.revision}</small></td>
                  <td><Badge tone={statusTone(rule.status)}>{statusLabel(rule.status, isEn)}</Badge></td>
                  <td>{rule.draft.effectiveFrom}<small>{isEn ? "Until" : "Đến"} {rule.draft.effectiveTo || (isEn ? "Ongoing" : "Không giới hạn")}</small></td>
                  <td>{ruleActions(rule)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={detailOpen && !editOpen && !reviewOpen && !publishOpen && !createOpen}
        title={isEn ? "Social insurance rule details" : "Chi tiết bộ luật BHXH"} className="admin-management-modal"
        onClose={() => !busy && setDetailOpen(false)}>
        {error && <Alert tone="danger" title={isEn ? "Action failed" : "Không thể thực hiện thao tác"}>{error}</Alert>}
        {/* Right column: Selected Rule Details & Actions */}
        {selectedRule ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Status & Transitions Header Card */}
            <Card style={{ padding: "1.25rem" }}>
              <div className="legal-detail-heading">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                      {selectedRule.draft.code} (v{selectedRule.version})
                    </h2>
                    <Badge tone={statusTone(selectedRule.status)}>
                      {statusLabel(selectedRule.status, isEn)}
                    </Badge>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted, #64748b)", marginTop: "0.25rem" }}>
                    ID: <code>{selectedRule.id}</code> · Revision: <b>{selectedRule.revision}</b> · Hash: <code>{selectedRule.documentHash.slice(0, 16)}…</code>
                  </div>
                </div>

                {ruleActions(selectedRule, false)}
              </div>

              {/* Corpus Status Message Banner */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "6px",
                  fontSize: "0.875rem",
                  backgroundColor:
                    selectedRule.status === "PUBLISHED"
                      ? "rgba(34, 197, 94, 0.1)"
                      : selectedRule.status === "REVIEWED"
                      ? "rgba(147, 51, 234, 0.1)"
                      : selectedRule.status === "VALIDATED"
                      ? "rgba(59, 130, 246, 0.1)"
                      : "rgba(245, 158, 11, 0.1)",
                  color:
                    selectedRule.status === "PUBLISHED"
                      ? "var(--color-success, #16a34a)"
                      : selectedRule.status === "REVIEWED"
                      ? "#7e22ce"
                      : selectedRule.status === "VALIDATED"
                      ? "var(--color-info, #2563eb)"
                      : "var(--color-warning, #d97706)",
                }}
              >
                {selectedRule.status === "PUBLISHED" && (
                  <span>
                    <b>{isEn ? "Operational Status: Active" : "Trạng thái vận hành: Đang áp dụng"}.</b>{" "}
                    {isEn
                      ? "Calculations will use this rule set for matching benefit dates. Rule is immutable."
                      : "Các tính toán lương hưu sẽ áp dụng bộ luật này theo ngày hưởng phù hợp. Bộ luật chỉ đọc, không thể chỉnh sửa."}
                  </span>
                )}
                {selectedRule.status === "REVIEWED" && (
                  <span>
                    <b>{isEn ? "Reviewed & Ready" : "Đã duyệt độc lập"}.</b>{" "}
                    {isEn
                      ? `Reviewed by ${selectedRule.review?.actor}. Sẵn sàng công bố.`
                      : `Đã được phê duyệt bởi ${selectedRule.review?.actor}. Cần công bố để đưa vào tính toán thực tế.`}
                  </span>
                )}
                {selectedRule.status === "VALIDATED" && (
                  <span>
                    <b>{isEn ? "Validated Structure" : "Đã kiểm chứng cấu trúc"}.</b>{" "}
                    {isEn
                      ? "All coverage branches and tables verified. An independent administrator must review before publish."
                      : "Cấu trúc và bảng tham số đã kiểm chứng thành công. Cần một Quản trị viên độc lập phê duyệt."}
                  </span>
                )}
                {selectedRule.status === "DRAFT" && (
                  <span>
                    <b>{isEn ? "Draft Status" : "Trạng thái: Bản nháp"}.</b>{" "}
                    {isEn
                      ? "Not yet validated. Cannot be used for official calculations."
                      : "Chưa kiểm chứng. Không thể dùng để tính toán lương hưu thực tế."}
                  </span>
                )}
              </div>

              {/* Validation Errors if any */}
              {selectedRule.validation && !selectedRule.validation.valid && (
                <Alert tone="error" title={isEn ? "Validation Issues Detected:" : "Phát hiện lỗi kiểm chứng:"} style={{ marginTop: "1rem" }}>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
                    {selectedRule.validation.coverageErrors?.map((err, i) => <li key={i}>{err}</li>)}
                    {selectedRule.validation.tableErrors?.map((err, i) => <li key={i}>{err}</li>)}
                    {selectedRule.validation.strategyErrors?.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </Alert>
              )}
            </Card>

            {/* Document Details: Coverage, Citations, Tables */}
            <Card style={{ padding: "1.25rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 600 }}>
                {isEn ? "Coverage & Formula Strategies" : "Phạm vi áp dụng & Chiến lược tính"}
              </h3>
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted, #64748b)", marginBottom: "0.5rem" }}>
                  {isEn ? "Engine Code:" : "Mã động cơ:"} <b>{selectedRule.draft.document.engineCode}</b> · Schema Version: <b>{selectedRule.draft.document.schemaVersion}</b>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "0.75rem" }}>
                  {selectedRule.draft.document.coverage.map((cov, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "0.75rem",
                        borderRadius: "6px",
                        backgroundColor: "var(--color-bg-secondary, #f8fafc)",
                        border: "1px solid var(--color-border, #e2e8f0)",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{cov.branch}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)", marginTop: "0.25rem" }}>
                        Strategy: <code>{cov.strategyCode}</code>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #64748b)", marginTop: "0.25rem" }}>
                        Citations: {cov.citationIds.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Citations section */}
              <div style={{ marginTop: "1.5rem" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                  {isEn ? "Legal Citations" : "Căn cứ pháp lý"} ({selectedRule.draft.document.citations.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {selectedRule.draft.document.citations.map((cite) => (
                    <div
                      key={cite.id}
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderRadius: "4px",
                        border: "1px solid var(--color-border, #e2e8f0)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {cite.locator} - {cite.instrument}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #64748b)", marginTop: "0.2rem" }}>
                        <a href={cite.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary, #2563eb)" }}>
                          {cite.url}
                        </a>{" "}
                        · Hiệu lực: {cite.effectiveFrom} → {cite.effectiveTo || "Vô thời hạn"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tables section */}
              <div style={{ marginTop: "1.5rem" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                  {isEn ? "Lookup Tables & Statutory Factors" : "Bảng tra & Hệ số quy định"} ({selectedRule.draft.document.tables.length})
                </h4>
                <div style={{ maxHeight: "280px", overflow: "auto", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "6px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "var(--color-bg-secondary, #f8fafc)", textAlign: "left" }}>
                        <th style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>Loại</th>
                        <th style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>Khóa</th>
                        <th style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>Giá trị</th>
                        <th style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>Hiệu lực</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRule.draft.document.tables.map((t, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>
                          <td style={{ padding: "0.5rem 0.75rem" }}>
                            <Badge tone="neutral">{t.kind}</Badge>
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500 }}>{t.key}</td>
                          <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace" }}>{t.value}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-muted, #64748b)" }}>
                            {t.effectiveFrom} → {t.effectiveTo || "…"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>
        ) : <p>{isEn ? "This rule is no longer available." : "Bộ luật này không còn trong danh sách."}</p>}
      </Modal>

      {/* Review Dialog Modal */}
      {reviewOpen && (
        <Modal
          open={reviewOpen}
          onClose={() => !busy && setReviewOpen(false)}
          title={isEn ? "Independent Legal Review & Approval" : "Phê duyệt pháp lý độc lập"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted, #64748b)", margin: 0 }}>
              {isEn
                ? "Approval confirms the statutory alignment and test completeness. Note: Authors cannot approve their own drafts."
                : "Phê duyệt xác nhận tính phù hợp pháp lý và kết quả kiểm thử. Lưu ý: Người soạn không được tự phê duyệt dự thảo của chính mình."}
            </p>

            {reviewError && <Alert tone="error" title={isEn ? "Error" : "Lỗi"}>{reviewError}</Alert>}

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                {isEn ? "Review note & legal basis *" : "Ghi chú & căn cứ phê duyệt *"}
              </label>
              <textarea
                rows={4}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={isEn ? "e.g., Reviewed against Official Gazette and statutory test suite." : "Ví dụ: Đã đối chiếu với Công báo và kết quả test suite chiến lược."}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <Button variant="secondary" onClick={() => setReviewOpen(false)} disabled={busy}>
                {isEn ? "Cancel" : "Hủy"}
              </Button>
              <Button variant="primary" onClick={handleConfirmReview} disabled={busy || !reviewNote.trim()}>
                {isEn ? "Confirm Approval" : "Xác nhận phê duyệt"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Publish Dialog Modal */}
      {publishOpen && (
        <Modal
          open={publishOpen}
          onClose={() => !busy && setPublishOpen(false)}
          title={isEn ? "Publish Operational Legal Rule Set" : "Công bố bộ luật vào vận hành"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Alert tone="warning" title={isEn ? "Irreversible Operation:" : "Thao tác không thể hoàn tác:"}>
              {isEn
                ? "Publishing activates this rule set for all user pension calculations. The rule set will become strictly READ-ONLY."
                : "Việc công bố sẽ kích hoạt bộ luật này cho mọi phép tính lương hưu của người dùng. Sau khi công bố, bộ luật sẽ bị KHÓA CHỈ ĐỌC hoàn toàn."}
            </Alert>

            {publishError && <Alert tone="error" title={isEn ? "Error" : "Lỗi"}>{publishError}</Alert>}

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={publishConfirm}
                onChange={(e) => setPublishConfirm(e.target.checked)}
              />
              <span>
                {isEn
                  ? "I confirm that this rule set has been reviewed and verified for production use."
                  : "Tôi xác nhận bộ luật này đã qua rà soát và kiểm chứng đầy đủ để vận hành."}
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <Button variant="secondary" onClick={() => setPublishOpen(false)} disabled={busy}>
                {isEn ? "Cancel" : "Hủy"}
              </Button>
              <Button variant="primary" onClick={handleConfirmPublish} disabled={busy || !publishConfirm}>
                {isEn ? "Publish Rule Set" : "Công bố bộ luật"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Draft Modal */}
      {editOpen && (
        <Modal
          open={editOpen}
          className="admin-management-modal"
          onClose={() => !busy && setEditOpen(false)}
          title={`${isEn ? "Edit Draft" : "Chỉnh sửa dự thảo"}: ${selectedRule?.draft.code}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Alert tone="info" title={isEn ? "Notice" : "Lưu ý"}>
              {isEn
                ? "Saving edits increments revision and resets status back to DRAFT (clearing previous validation and approval)."
                : "Lưu thay đổi sẽ tăng số revision và đưa trạng thái trở lại DRAFT (hủy kết quả kiểm chứng và phê duyệt trước đó)."}
            </Alert>

            {editError && <Alert tone="error" title={isEn ? "Error" : "Lỗi"}>{editError}</Alert>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {isEn ? "Effective From (YYYY-MM-DD)" : "Hiệu lực từ ngày"}
                </label>
                <input
                  type="date"
                  value={editEffectiveFrom}
                  onChange={(e) => setEditEffectiveFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {isEn ? "Effective To (Optional)" : "Đến ngày (Tùy chọn)"}
                </label>
                <input
                  type="date"
                  value={editEffectiveTo}
                  onChange={(e) => setEditEffectiveTo(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {isEn ? "Supersedes ID (UUID, optional)" : "ID bản luật thay thế (UUID, tùy chọn)"}
              </label>
              <input
                type="text"
                value={editSupersedesId}
                onChange={(e) => setEditSupersedesId(e.target.value)}
                placeholder="UUID of published rule being replaced"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {isEn ? "Legal Document JSON" : "Tài liệu luật JSON"}
              </label>
              <textarea
                rows={12}
                value={editDocJson}
                onChange={(e) => setEditDocJson(e.target.value)}
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8rem" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={busy}>
                {isEn ? "Cancel" : "Hủy"}
              </Button>
              <Button variant="primary" onClick={handleConfirmEdit} disabled={busy}>
                {isEn ? "Save Changes" : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create New Draft Modal */}
      {createOpen && (
        <Modal
          open={createOpen}
          className="admin-management-modal"
          onClose={() => !busy && setCreateOpen(false)}
          title={isEn ? "Create New Legal Rule Draft" : "Tạo dự thảo luật BHXH mới"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {createError && <Alert tone="error" title={isEn ? "Error" : "Lỗi"}>{createError}</Alert>}

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {isEn ? "Rule Code *" : "Mã định danh luật *"}
              </label>
              <input
                type="text"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                placeholder="BH2_VOLUNTARY_2026"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {isEn ? "Effective From (YYYY-MM-DD) *" : "Hiệu lực từ ngày *"}
                </label>
                <input
                  type="date"
                  value={createEffectiveFrom}
                  onChange={(e) => setCreateEffectiveFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {isEn ? "Effective To (Optional)" : "Đến ngày (Tùy chọn)"}
                </label>
                <input
                  type="date"
                  value={createEffectiveTo}
                  onChange={(e) => setCreateEffectiveTo(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {isEn ? "Supersedes Rule ID (Optional)" : "ID bản luật thay thế (Tùy chọn)"}
              </label>
              <input
                type="text"
                value={createSupersedesId}
                onChange={(e) => setCreateSupersedesId(e.target.value)}
                placeholder="UUID"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {isEn ? "Document JSON *" : "Tài liệu JSON *"}
              </label>
              <textarea
                rows={10}
                value={createDocJson}
                onChange={(e) => setCreateDocJson(e.target.value)}
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8rem" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
                {isEn ? "Cancel" : "Hủy"}
              </Button>
              <Button variant="primary" onClick={handleConfirmCreate} disabled={busy || !createCode.trim()}>
                {isEn ? "Create Draft" : "Tạo dự thảo"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
