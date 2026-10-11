import { useEffect, useId, useRef, useState } from "react";
import { computeContentHash, type InsuranceEvidence } from "../services/insurance";
import "./insurance-form.css";

export type EvidenceDraft = InsuranceEvidence & { content: string };
export const emptyEvidence = (): EvidenceDraft => ({ reference: "", content: "", contentHash: "", confirmedOn: "" });
export async function submittedEvidence(draft: EvidenceDraft): Promise<InsuranceEvidence[]> {
  if (!draft.reference.trim() || !draft.confirmedOn || (!draft.content.trim() && !draft.contentHash)) {
    throw new Error("Vui lòng nhập tên căn cứ, ngày xác nhận và nội dung trích dẫn hoặc chọn tài liệu.");
  }
  return [{ reference: draft.reference.trim(), confirmedOn: draft.confirmedOn,
    contentHash: draft.contentHash || await computeContentHash(draft.content) }];
}

/** Files are hashed locally; neither file bytes nor excerpts are uploaded. */
export function EvidenceEditor({ title, value, onChange, isVi = true, description }: {
  title: string; value: EvidenceDraft; onChange: (value: EvidenceDraft) => void; isVi?: boolean; description?: string;
}) {
  const id = useId(), request = useRef(0), latest = useRef(value);
  latest.current = value;
  useEffect(() => () => { ++request.current; }, []);
  const [error, setError] = useState("");
  return <fieldset className="evidence-editor" style={{ minWidth: 0, margin: "12px 0", padding: "12px", border: "1px solid var(--color-border)", borderRadius: "8px" }}>
    <legend style={{ fontWeight: 600 }}>{title}</legend>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
      <label htmlFor={`${id}-ref`}>{isVi ? "Tên / số hiệu căn cứ" : "Evidence reference"}
        <input id={`${id}-ref`} className="input" value={value.reference} onChange={e => onChange({ ...value, reference: e.target.value })} /></label>
      <label htmlFor={`${id}-date`}>{isVi ? "Ngày xác nhận căn cứ" : "Evidence confirmation date"}
        <input id={`${id}-date`} className="input" type="date" value={value.confirmedOn} onChange={e => onChange({ ...value, confirmedOn: e.target.value })} /></label>
    </div>
    <label htmlFor={`${id}-content`} style={{ display: "block", marginTop: "12px" }}>{isVi ? "Trích nội dung từ hồ sơ / mô tả giả định" : "Document excerpt / scenario description"}</label>
    <textarea id={`${id}-content`} className="input" rows={3} value={value.content} onChange={e => {
      ++request.current; setError(""); onChange({ ...value, content: e.target.value, contentHash: "" });
    }} style={{ width: "100%", resize: "vertical" }} />
    <label htmlFor={`${id}-file`} style={{ display: "block", marginTop: "8px" }}>{isVi ? "Hoặc chọn tài liệu gốc (chỉ xử lý trên máy)" : "Or select the original document (processed locally)"}</label>
    <input id={`${id}-file`} type="file" style={{ maxWidth: "100%" }} onChange={async e => {
      const file = e.target.files?.[0], version = ++request.current;
      onChange({ ...value, content: "", contentHash: "" }); setError("");
      if (!file) return;
      try {
        const contentHash = await computeContentHash(await file.arrayBuffer());
        if (version === request.current) onChange({ ...latest.current, content: "", contentHash });
      } catch (err) { if (version === request.current) setError(err instanceof Error ? err.message : "Không đọc được tài liệu."); }
    }} />
    <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: 0 }}>{description ?? (isVi
      ? "Chỉ mã kiểm tra nội dung được gửi lên. Thông tin do bạn khai báo, không thay xác minh của cơ quan BHXH. Với kịch bản giả định, ghi rõ các giả định của bạn."
      : "Only the content fingerprint is submitted. Your declaration does not replace official verification. Describe your assumptions for a hypothetical scenario.")}</p>
    {value.contentHash && <p role="status">{isVi ? "Đã đọc tài liệu." : "Document read."}</p>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
