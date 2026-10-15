import { HorizonWarnings } from "./AnalysisResults";
import type { ReadWarning } from "../../services/planningAnalysis";
import { useEffect, useRef, useState } from "react";
import ResponsiveDialog from "../ResponsiveDialog";
import "./plan-dialogs.css";
import { Badge, Button, Card, Icon } from "../ui";
import { useI18n } from "../../i18n";
import { formatVNDCurrency } from "../../services/retirement";
import { formatDateVN, formatMonthVN } from "../../utils/date";
import type { PlanDetail, PlanHistoryItem, ReplayResult } from "../../services/plans";

interface PlanVersionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  plan: PlanDetail | null;
  versions: PlanHistoryItem[];
  onSelectVersion?: (versionId: string) => void;
  onApplyVersion: (versionId: string) => Promise<void>;
  onReplayVersion: (versionId: string) => Promise<ReplayResult | null>;
  isApplying?: boolean;
}

export function PlanVersionDrawer({
  isOpen,
  onClose,
  plan,
  versions,
  onSelectVersion,
  onApplyVersion,
  onReplayVersion,
  isApplying = false,
}: PlanVersionDrawerProps) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [readWarnings, setReadWarnings] = useState<ReadWarning[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<{ id: string; matched: boolean; error?: string } | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<string | null>(null);
  const replaySequence = useRef(0);

  useEffect(() => {
    setReadWarnings([]); setReplayResult(null); setReplayingId(null); setConfirmVersion(null);
    ++replaySequence.current;
    return () => { ++replaySequence.current; };
  }, [isOpen, plan?.id]);

  if (!isOpen) return null;

  const handleReplay = async (versionId: string) => {
    if (replayingId || isApplying) return;
    const seq = ++replaySequence.current;
    setReadWarnings([]);
    setReplayingId(versionId);
    setReplayResult(null);
    try {
      const res = await onReplayVersion(versionId);
      if (seq !== replaySequence.current) return;
      if (!res) throw new Error(isEn ? "Could not verify. Please check the connection and retry." : "Chưa kiểm chứng được. Hãy kiểm tra kết nối và thử lại.");
      setReadWarnings(res.readWarnings ?? []);
      if (res && res.replay.matched) {
        setReplayResult({ id: versionId, matched: true });
      } else {
        setReplayResult({
          id: versionId,
          matched: false,
          error: isEn
            ? "Recalculation results do not match full integrity."
            : "Kết quả tính toán lại không trùng khớp toàn vẹn.",
        });
      }
    } catch (e) {
      if (seq !== replaySequence.current) return;
      setReplayResult({
        id: versionId,
        matched: false,
        error: e instanceof Error ? e.message : (isEn ? "Cannot verify snapshot." : "Chưa kiểm tra lại được kết quả đã lưu. Hãy thử lại."),
      });
    } finally {
      if (seq === replaySequence.current) setReplayingId(null);
    }
  };

  const activeVersion = versions.find(v => v.id === plan?.currentVersionId);
  const formatCoverage = (value: string | null) => {
    const number = value == null || value.trim() === "" ? NaN : Number(value);
    return Number.isFinite(number)
      ? `${new Intl.NumberFormat(isEn ? "en-US" : "vi-VN", { maximumFractionDigits: 2 }).format(number)}%`
      : (isEn ? "Undetermined" : "Chưa xác định");
  };

  return (
    <ResponsiveDialog open={isOpen} title={isEn ? "Saved plan versions" : "Các phương án đã lưu"} onClose={() => { if (!isApplying) onClose(); }} className="plan-wide-dialog plan-version-dialog">
      <p className="plan-versions-intro">{isEn ? "Review saved results and choose the version you want to use. Applying a version requires confirmation." : "Xem lại kết quả đã lưu và chọn phiên bản bạn muốn sử dụng. Bạn sẽ xác nhận trước khi thay kế hoạch đang áp dụng."}</p>
      <HorizonWarnings warnings={readWarnings} />
      <div className="plan-versions-overview">
        <span>{isEn ? "Saved versions: " : "Số phiên bản đã lưu: "}<strong>{versions.length}</strong></span>
        <span>{isEn ? "Currently applied: " : "Đang áp dụng: "}<strong>{activeVersion ? `v${activeVersion.version}` : (isEn ? "Undetermined" : "Chưa xác định")}</strong></span>
        {plan?.stale && <span className="plan-stale-note"><Icon name="alert" size="small" /> {isEn ? "Profile or assumptions have changed and need review." : "Hồ sơ hoặc giả định đã có thay đổi cần rà soát lại."}</span>}
      </div>
      {versions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-text-muted)" }}>
          <Icon name="file-text" size="large" />
          <p>{isEn ? "No versions have been saved for this plan yet." : "Chưa có phiên bản nào được lưu trong kế hoạch này."}</p>
        </div>
      ) : (
        <div className="plan-versions-grid">
          {versions.map(v => {
            const isCurrent = plan?.currentVersionId === v.id;
            const isBaseline = plan?.baselineVersionId === v.id;
            return (
              <Card key={v.id} className={`plan-version-card${isCurrent ? " is-current" : ""}`}>
                <div className="plan-version-heading">
                  <div>
                    <strong>{isEn ? `Version v${v.version}` : `Phiên bản v${v.version}`}</strong>
                    {isCurrent && <Badge tone="info">{isEn ? "Active" : "Đang áp dụng"}</Badge>}
                    {isBaseline && <Badge tone="success">{isEn ? "Baseline" : "Bản gốc ban đầu"}</Badge>}
                  </div>
                  <time dateTime={v.createdAt}>{formatDateVN(v.createdAt)}</time>
                </div>
                <dl className="plan-version-metrics">
                  <div><dt>{isEn ? "Projected fund at retirement" : "Quỹ dự kiến lúc nghỉ hưu"}</dt><dd>{formatVNDCurrency(v.summary.atRetirement.projectedFund)}</dd></div>
                  <div><dt>{isEn ? "Required fund at retirement" : "Quỹ cần lúc nghỉ hưu"}</dt><dd>{formatVNDCurrency(v.summary.atRetirement.requiredFund)}</dd></div>
                  <div><dt>{isEn ? "Fund coverage" : "Mức bao phủ quỹ"}</dt><dd>{formatCoverage(v.summary.atRetirement.coveragePercent)}</dd></div>
                  <div><dt>{isEn ? "Retirement month" : "Tháng nghỉ hưu"}</dt><dd>{formatMonthVN(v.summary.retirementMonth)}</dd></div>
                </dl>
                <details className="plan-version-technical">
                  <summary>{isEn ? "Verification details" : "Thông tin đối chiếu"}</summary>
                  {plan && <p>{isEn ? "Plan ID" : "Mã kế hoạch"}<code>{plan.id}</code></p>}
                  {plan && <p>{isEn ? "Plan revision" : "Lần cập nhật kế hoạch"}: {plan.revision}</p>}
                  <p>{isEn ? "Snapshot hash" : "Mã kiểm tra bản lưu"}<code>{v.snapshotHash}</code></p>
                </details>
                {replayResult?.id === v.id && (
                  <div role="status" style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "var(--color-surface-subtle)", color: replayResult.matched ? "var(--color-success)" : "var(--color-danger)", fontSize: 14 }}>
                    <Icon name={replayResult.matched ? "check" : "alert"} size="small" /> {replayResult.matched ? (isEn ? "Recalculation matches the saved result 100%." : "Kết quả tính lại khớp 100% với bản đã lưu.") : replayResult.error}
                  </div>
                )}
                <div className="plan-version-actions">
                  <Button variant="ghost" disabled={Boolean(replayingId) || isApplying} onClick={() => handleReplay(v.id)}>
                    <Icon name="sparkles" size="small" /> {replayingId === v.id ? (isEn ? "Verifying..." : "Đang kiểm tra...") : (isEn ? "Verify result" : "Kiểm tra kết quả")}
                  </Button>
                  {!isCurrent && <Button variant="primary" disabled={isApplying || Boolean(replayingId)} onClick={() => setConfirmVersion(v.id)}>
                    <Icon name="check" size="small" /> {isEn ? "Apply This Version" : "Áp dụng bản này"}
                  </Button>}
                </div>
                {confirmVersion === v.id && !isCurrent && <div className="plan-history-confirm">
                  <p>{isEn ? `Replace the official plan with saved version v${v.version}?` : `Thay kế hoạch chính thức bằng phiên bản đã lưu v${v.version}?`}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Button variant="secondary" disabled={isApplying} onClick={() => setConfirmVersion(null)}>{isEn ? "Cancel" : "Hủy bỏ"}</Button>
                    <Button loading={isApplying} disabled={Boolean(replayingId)} onClick={() => void onApplyVersion(v.id)}>{isEn ? `Confirm apply v${v.version}` : `Dùng làm kế hoạch hiện tại v${v.version}`}</Button>
                  </div>
                </div>}
              </Card>
            );
          })}
        </div>
      )}
    </ResponsiveDialog>
  );
}
