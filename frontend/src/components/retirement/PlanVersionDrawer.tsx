import { useState } from "react";
import { Badge, Button, Card, Icon } from "../ui";
import { useI18n } from "../../i18n";
import { formatVNDCurrency, formatPercentNumber } from "../../services/retirement";
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

  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<{ id: string; matched: boolean; error?: string } | null>(null);

  if (!isOpen) return null;

  const handleReplay = async (versionId: string) => {
    setReplayingId(versionId);
    setReplayResult(null);
    try {
      const res = await onReplayVersion(versionId);
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
      setReplayResult({
        id: versionId,
        matched: false,
        error: e instanceof Error ? e.message : (isEn ? "Cannot verify snapshot." : "Không thể kiểm chứng snapshot."),
      });
    } finally {
      setReplayingId(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "var(--color-surface)",
          height: "100%",
          overflowY: "auto",
          padding: "24px",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: "16px" }}>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {isEn ? "RETIREMENT PLAN HISTORY" : "LỊCH SỬ KẾ HOẠCH HƯU TRÍ"}
            </span>
            <h2 style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, color: "var(--color-text-main)" }}>
              {isEn ? "Saved Plan Versions" : "Các phiên bản đã lưu (Plan Versions)"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: "4px",
            }}
            aria-label={isEn ? "Close" : "Đóng"}
          >
            <Icon name="x" size="default" />
          </button>
        </div>

        {plan && (
          <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "8px", fontSize: "13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ color: "var(--color-text-muted)" }}>{isEn ? "Plan ID:" : "Mã kế hoạch:"}</span>
              <strong style={{ fontFamily: "monospace" }}>{plan.id.slice(0, 8)}...</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ color: "var(--color-text-muted)" }}>{isEn ? "Active Revision:" : "Revision hiện hành:"}</span>
              <strong>v{plan.revision}</strong>
            </div>
            {plan.stale && (
              <div style={{ marginTop: "6px", color: "var(--color-warning)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="alert" size="small" />
                <span>
                  {isEn
                    ? "Profile or assumptions have changed and need review."
                    : "Hồ sơ hoặc giả định đã có thay đổi cần rà soát lại."}
                </span>
              </div>
            )}
          </div>
        )}

        {versions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
            <Icon name="file-text" size="large" />
            <p style={{ marginTop: "12px" }}>
              {isEn ? "No versions have been saved for this plan yet." : "Chưa có phiên bản nào được lưu trong kế hoạch này."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {versions.map((v) => {
              const isCurrent = plan?.currentVersionId === v.id;
              const isBaseline = plan?.baselineVersionId === v.id;

              return (
                <Card
                  key={v.id}
                  style={{
                    border: isCurrent ? "2px solid var(--color-primary-700)" : isBaseline ? "1px solid var(--color-secondary-500)" : "1px solid var(--color-border-subtle)",
                    padding: "16px",
                    borderRadius: "10px",
                    background: isCurrent ? "rgba(21, 58, 82, 0.04)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "15px", color: "var(--color-text-main)" }}>
                        {isEn ? `Version v${v.version}` : `Phiên bản v${v.version}`}
                      </strong>
                      {isCurrent && <Badge tone="info">{isEn ? "Active" : "Đang áp dụng"}</Badge>}
                      {isBaseline && <Badge tone="success">{isEn ? "Baseline" : "Bản gốc ban đầu"}</Badge>}
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {new Date(v.createdAt).toLocaleDateString(isEn ? "en-US" : "vi-VN")}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px", marginBottom: "12px" }}>
                    <div>
                      <span style={{ color: "var(--color-text-muted)", display: "block" }}>{isEn ? "Projected Fund (A):" : "Quỹ dự kiến (A):"}</span>
                      <strong>{formatVNDCurrency(v.summary.atRetirement.projectedFund)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--color-text-muted)", display: "block" }}>{isEn ? "Required Capital (K):" : "Vốn cần (K):"}</span>
                      <strong>{formatVNDCurrency(v.summary.atRetirement.requiredFund)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--color-text-muted)", display: "block" }}>{isEn ? "Coverage Ratio:" : "Độ bao phủ:"}</span>
                      <strong>{formatPercentNumber(v.summary.atRetirement.coveragePercent)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--color-text-muted)", display: "block" }}>{isEn ? "Retirement Month:" : "Tháng nghỉ hưu:"}</span>
                      <strong>{v.summary.retirementMonth}</strong>
                    </div>
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "12px", borderTop: "1px dashed var(--color-border-subtle)", paddingTop: "8px" }}>
                    <span>{isEn ? "Snapshot Hash: " : "Mã băm snapshot: "}</span>
                    <code style={{ fontSize: "10px" }}>{v.snapshotHash.slice(0, 16)}...</code>
                  </div>

                  {replayResult?.id === v.id && (
                    <div style={{ marginBottom: "10px", padding: "8px", borderRadius: "6px", background: replayResult.matched ? "rgba(111, 155, 124, 0.15)" : "rgba(161, 77, 71, 0.15)", color: replayResult.matched ? "var(--color-success)" : "var(--color-danger)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name={replayResult.matched ? "check" : "alert"} size="small" />
                      <span>{replayResult.matched ? (isEn ? "Integrity verification matched 100% of snapshot." : "Xác thực tính toàn vẹn đạt 100% khớp snapshot.") : replayResult.error}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={replayingId === v.id}
                      onClick={() => handleReplay(v.id)}
                    >
                      <Icon name="sparkles" size="small" />
                      {replayingId === v.id
                        ? (isEn ? "Verifying..." : "Đang kiểm chứng...")
                        : (isEn ? "Verify Replay" : "Kiểm chứng replay")}
                    </Button>

                    {!isCurrent && (
                      <Button
                        variant="primary"
                        size="small"
                        disabled={isApplying}
                        onClick={() => onApplyVersion(v.id)}
                      >
                        <Icon name="check" size="small" />
                        {isEn ? "Apply This Version" : "Áp dụng bản này"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
