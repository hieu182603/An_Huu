import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card } from "../../../components/ui";
import {
  ACCOUNT_STATUS_LABEL, OVERRIDE_KIND_LABEL, adminBilling, billingErrorMessage, currentPeriod, formatDate, formatDateTime, formatPeriod, formatVnd, markBillingDisabled,
  type AdminOverride, type AdminUserBilling,
} from "../../../services/adminBilling";
import { ApiError } from "../../../services/api";
import { OrderBadge, PermissionHint, StatementBadge, usePerms } from "./billingShared";
import { CreateOverrideDialog, RevokeOverrideDialog, overrideValueText } from "./OverrideDialogs";

const StatementDrawer = lazy(() => import("./StatementDrawer"));

function overrideState(o: AdminOverride, period: string): { label: string; tone: "success" | "neutral" | "info"; active: boolean } {
  if (o.revokedAt) return { label: "Đã thu hồi", tone: "neutral", active: false };
  if (o.toPeriod && o.toPeriod < period) return { label: "Đã hết hạn", tone: "neutral", active: false };
  if (o.fromPeriod > period) return { label: "Sắp có hiệu lực", tone: "info", active: true };
  return { label: "Đang hiệu lực", tone: "success", active: true };
}

/** "Phí dịch vụ" block of the admin user detail (GET /admin/users/:id/billing). */
export default function AdminUserBillingSection({ userId }: { userId: string | undefined }) {
  const perms = usePerms();
  const [data, setData] = useState<AdminUserBilling | null>(null);
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<AdminOverride | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);
  const period = currentPeriod();

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try { setData(await adminBilling.userBilling(userId)); }
    catch (err) {
      if (err instanceof ApiError && err.code === "BILLING_DISABLED") { markBillingDisabled(err); setDisabled(true); }
      else setError(billingErrorMessage(err));
    } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { setData(null); setDisabled(false); void load(); }, [load]);

  if (disabled) {
    return <Card className="admin-list-card" ><h2 style={{ margin: 0, fontSize: 18 }}>Phí dịch vụ</h2><p className="ab-note" role="status" style={{ marginTop: 8 }}>Chức năng phí dịch vụ chưa được bật.</p></Card>;
  }

  return (
    <Card className="admin-list-card ab-user-billing">
      <div className="admin-management-section-header" style={{ padding: 0, border: 0 }}>
        <div><h2>Phí dịch vụ</h2><p>Trạng thái thu phí, kỳ phí, giao dịch và ưu đãi của tài khoản này.</p></div>
        {perms.canOperate && data && <Button size="small" icon="plus" onClick={() => setCreating(true)}>Tạo ưu đãi</Button>}
      </div>
      {!perms.canOperate && <PermissionHint need="OPERATIONS" />}
      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}
      {error && <Alert tone="danger" title="Không tải được phí dịch vụ" action={<Button size="small" variant="secondary" onClick={() => void load()}>Thử lại</Button>}>{error}</Alert>}
      {loading && !data && !error && <p className="ab-note" role="status">Đang tải phí dịch vụ…</p>}

      {data && (
        <div style={{ display: "grid", gap: 20 }} aria-busy={loading}>
          <dl className="ab-facts">
            <div><dt>Trạng thái tài khoản phí</dt><dd>{data.account ? ACCOUNT_STATUS_LABEL[data.account.status] : "Chưa đồng ý điều khoản phí"}</dd></div>
            {data.account?.trialEndsAt && <div><dt>Hết dùng thử</dt><dd>{formatDate(data.account.trialEndsAt)}</dd></div>}
            {data.account && <div><dt>Đồng ý điều khoản</dt><dd>{formatDate(data.account.termsAcceptedAt)} · v{data.account.termsVersion}</dd></div>}
            {data.account?.stoppedFromPeriod && <div className="is-warn"><dt>Ngừng từ kỳ</dt><dd>{formatPeriod(data.account.stoppedFromPeriod)}</dd></div>}
          </dl>

          <section className="ab-section" aria-label="Kỳ phí gần nhất">
            <h4>Kỳ phí gần nhất ({data.statements.length})</h4>
            {!data.statements.length ? <p className="ab-note">Chưa có kỳ phí.</p> : (
              <div className="admin-users-table-wrap">
                <table className="admin-users-table admin-stack-table ab-table">
                  <thead><tr><th>Kỳ</th><th className="ab-num">Phí phải thu</th><th className="ab-num col-optional">Đã thu</th><th className="ab-num">Còn phải thu</th><th className="col-optional">Hạn</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {data.statements.map((row) => (
                      <tr key={row.id} className="ab-row-click" tabIndex={0} onClick={() => setOpenId(row.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) setOpenId(row.id); }}>
                        <td data-label="Kỳ">{formatPeriod(row.period)}</td>
                        <td className="ab-num" data-label="Phí phải thu">{formatVnd(row.amountVnd)}</td>
                        <td className="ab-num col-optional" data-label="Đã thu">{formatVnd(row.paidVnd)}</td>
                        <td className="ab-num" data-label="Còn phải thu">{formatVnd(row.amountDueVnd)}</td>
                        <td className="col-optional" data-label="Hạn">{formatDate(row.dueDate)}</td>
                        <td data-label="Trạng thái"><StatementBadge status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ab-section" aria-label="Giao dịch gần nhất">
            <h4>Giao dịch payOS gần nhất ({data.orders.length})</h4>
            {!data.orders.length ? <p className="ab-note">Chưa có giao dịch.</p> : (
              <ul className="ab-list">
                {data.orders.map((order) => (
                  <li key={order.id}>
                    <div className="ab-list-row"><strong>#{order.orderCode} · {formatVnd(order.amountVnd)}</strong><OrderBadge status={order.status} /></div>
                    <small>Tạo {formatDateTime(order.createdAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ab-section" aria-label="Ưu đãi">
            <h4>Ưu đãi ({data.overrides.length})</h4>
            {!data.overrides.length ? <p className="ab-note">Chưa có ưu đãi riêng.</p> : (
              <ul className="ab-list">
                {data.overrides.map((o) => {
                  const state = overrideState(o, period);
                  return (
                    <li key={o.id}>
                      <div className="ab-list-row">
                        <strong>{overrideValueText(o)} <small>({OVERRIDE_KIND_LABEL[o.kind]})</small></strong>
                        <span className="ab-row-actions">
                          <Badge tone={state.tone}>{state.label}</Badge>
                          {perms.canOperate && state.active && <Button size="small" variant="secondary" onClick={() => setRevoking(o)}>Thu hồi</Button>}
                        </span>
                      </div>
                      <small>Từ kỳ {formatPeriod(o.fromPeriod)} đến {o.toPeriod ? `kỳ ${formatPeriod(o.toPeriod)}` : "khi thu hồi"} · Lý do: {o.reason}</small>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {openId && (
        <Suspense fallback={null}>
          <StatementDrawer statementId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
        </Suspense>
      )}
      {creating && data && (
        <CreateOverrideDialog user={{ id: data.user.id, fullName: data.user.fullName, email: data.user.email }} onClose={() => setCreating(false)}
          onDone={(text) => { setCreating(false); setNotice({ tone: "success", text }); void load(); }} />
      )}
      {revoking && <RevokeOverrideDialog override={revoking} onClose={() => setRevoking(null)} onDone={(tone, text) => { setRevoking(null); setNotice({ tone, text }); void load(); }} />}
    </Card>
  );
}
