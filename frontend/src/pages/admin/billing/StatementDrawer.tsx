import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input } from "../../../components/ui";
import ResponsiveDialog from "../../../components/ResponsiveDialog";
import {
  AUDIT_ACTION_LABEL, BASE_ISSUE_LABEL, RECONCILE_OUTCOME_LABEL, WEBHOOK_OUTCOME_LABEL, adminBilling, billingErrorMessage, formatDate, formatDateTime,
  formatPeriod, formatVnd, formatVndText, markBillingDisabled,
  type AdminOrder, type AdminPayment, type AdminStatementDetail, type ReconcileOutcome, type StatementStatus,
} from "../../../services/adminBilling";
import { FieldError, OrderBadge, PermissionHint, StatementBadge, WriteDialog, usePerms, userText } from "./billingShared";

const decimalVnd = (value: string | null | undefined) => formatVnd(Math.round(Number(value ?? 0)));
const SOURCE_LABEL = { PAYOS: "payOS", MANUAL_TRANSFER: "Chuyển khoản thủ công" } as const;
const MAX_AMOUNT = 2_000_000_000;

/** datetime-local value (browser time zone) for a Date. */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const parseAmount = (text: string) => (/^\d{1,10}$/.test(text.trim()) ? Number(text.trim()) : NaN);
const validAmount = (amount: number, max = MAX_AMOUNT) => Number.isInteger(amount) && amount >= 1 && amount <= max;

type Dialog =
  | { kind: "manual" } | { kind: "adjust" } | { kind: "void" }
  | { kind: "refund"; payment: AdminPayment } | { kind: "reconcile"; order: AdminOrder };

export default function StatementDrawer({ statementId, onClose, onChanged }: { statementId: string | null; onClose: () => void; onChanged?: () => void }) {
  const perms = usePerms();
  const [detail, setDetail] = useState<AdminStatementDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "warning"; text: string } | null>(null);

  const load = useCallback(async (id: string, keepNotice = false) => {
    setLoading(true);
    setError("");
    if (!keepNotice) setNotice(null);
    try { setDetail(await adminBilling.statement(id)); }
    catch (err) { markBillingDisabled(err); setError(billingErrorMessage(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setDetail(null);
    setDialog(null);
    if (statementId) void load(statementId);
  }, [statementId, load]);

  if (!statementId) return null;
  const open = Boolean(statementId);
  const done = (tone: "success" | "info" | "warning", text: string) => {
    setDialog(null);
    setNotice({ tone, text });
    onChanged?.();
    void load(statementId, true);
  };

  const s = detail;
  const open_ = s && (s.status === "ISSUED" || s.status === "OVERDUE");
  const who = s?.user?.email ?? "tài khoản đã xóa";
  const canAdjust = perms.canOperate && open_ && s.amountDueVnd > 0;
  const canVoid = perms.canOperate && open_ && s.paidVnd === 0;
  const canManual = perms.canOperate && s && s.status !== "VOID";

  return (
    <>
      <ResponsiveDialog open={open} drawer className="ab-drawer" title={s ? `Kỳ phí ${formatPeriod(s.period)}` : "Chi tiết kỳ phí"} onClose={onClose}>
        {error && (
          <Alert tone="danger" title="Không tải được kỳ phí" action={<Button size="small" variant="secondary" onClick={() => void load(statementId)}>Thử lại</Button>}>{error}</Alert>
        )}
        {!s && !error && <p className="ab-note" role="status">Đang tải chi tiết kỳ phí…</p>}
        {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}
        {s && (
          <div aria-busy={loading} style={{ display: "grid", gap: 20 }}>
            <div className="ab-drawer-head">
              <h3>{userText(s.user)}</h3>
              <p>Kỳ {formatPeriod(s.period)} · hạn {formatDate(s.dueDate)} · tạo {formatDateTime(s.createdAt)}</p>
              <div><StatementBadge status={s.status} /></div>
              <div className="ab-actions">
                {canManual && <Button size="small" icon="wallet" onClick={() => setDialog({ kind: "manual" })}>Ghi nhận chuyển khoản</Button>}
                {canAdjust && <Button size="small" variant="secondary" onClick={() => setDialog({ kind: "adjust" })}>Giảm/Miễn kỳ này</Button>}
                {canVoid && <Button size="small" variant="danger" icon="trash" onClick={() => setDialog({ kind: "void" })}>Hủy kỳ phí</Button>}
              </div>
              {!perms.canOperate && <PermissionHint need="OPERATIONS" />}
            </div>

            <dl className="ab-facts">
              <div><dt>Phí phải thu</dt><dd>{formatVnd(s.amountVnd)}</dd></div>
              <div><dt>Giảm / miễn</dt><dd>{formatVnd(s.adjustedVnd)}</dd></div>
              <div><dt>Đã thu</dt><dd>{formatVnd(s.paidVnd)}</dd></div>
              <div><dt>Đã hoàn</dt><dd>{formatVnd(s.refundedVnd)}</dd></div>
              <div><dt>Còn phải thu</dt><dd>{formatVnd(s.amountDueVnd)}</dd></div>
              <div className={s.overpaidVnd > 0 ? "is-warn" : ""}><dt>Thu thừa</dt><dd>{formatVnd(s.overpaidVnd)}</dd></div>
              <div><dt>Thanh toán lúc</dt><dd>{formatDateTime(s.paidAt)}</dd></div>
            </dl>

            <section className="ab-section" aria-label="Căn cứ tính phí">
              <h4>Căn cứ tính phí</h4>
              <dl className="ab-facts">
                <div><dt>Tài sản tính phí</dt><dd>{decimalVnd(s.baseAmountVnd)}</dd></div>
                <div><dt>Phí theo công thức</dt><dd>{decimalVnd(s.rawFeeVnd)}</dd></div>
                <div><dt>Phí sau làm tròn / sàn / trần</dt><dd>{formatVnd(s.scheduleFeeVnd)}</dd></div>
                <div><dt>Ưu đãi theo người dùng</dt><dd>{s.overrideId ? "Có áp dụng" : "Không"}</dd></div>
              </dl>
              <p className="ab-note">
                Căn cứ: tài sản tài chính dành cho hưu trí trong hồ sơ
                {s.baseSource?.valuationDate ? `, định giá ${formatDate(s.baseSource.valuationDate)}` : ""}
                {typeof s.baseSource?.profileRevision === "number" ? `, hồ sơ bản ${s.baseSource.profileRevision}` : ""}.
              </p>
              {s.baseSource?.issues?.length ? (
                <ul className="ab-issue-list">
                  {s.baseSource.issues.map((issue) => <li key={issue}>{BASE_ISSUE_LABEL[issue] ?? `Lưu ý dữ liệu hồ sơ: ${issue}`}</li>)}
                </ul>
              ) : null}
              {s.schedule && (
                <p className="ab-note">
                  Biểu phí v{s.schedule.version}: {s.schedule.annualRatePercent}%/năm, tối thiểu {formatVnd(s.schedule.minMonthlyVnd)}/tháng,
                  {s.schedule.maxMonthlyVnd === null ? " không trần" : ` tối đa ${formatVnd(s.schedule.maxMonthlyVnd)}/tháng`}, làm tròn {formatVnd(s.schedule.roundingStepVnd)}, hạn ngày {s.schedule.dueDay}.
                </p>
              )}
            </section>

            <section className="ab-section" aria-label="Giảm và miễn">
              <h4>Giảm / miễn ({s.adjustments.length})</h4>
              {!s.adjustments.length ? <p className="ab-note">Chưa có khoản giảm hoặc miễn.</p> : (
                <ul className="ab-list">
                  {s.adjustments.map((item) => (
                    <li key={item.id}><div className="ab-list-row"><strong>{formatVnd(item.amountVnd)}</strong><small>{formatDateTime(item.createdAt)}</small></div><small>Lý do: {item.reason}</small></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ab-section" aria-label="Thanh toán">
              <h4>Thanh toán ({s.payments.length})</h4>
              {!s.payments.length ? <p className="ab-note">Chưa có khoản thanh toán.</p> : (
                <ul className="ab-list">
                  {s.payments.map((payment) => (
                    <li key={payment.id}>
                      <div className="ab-list-row">
                        <strong>{formatVnd(payment.amountVnd)} · {SOURCE_LABEL[payment.source]}</strong>
                        {perms.canOperate && payment.refundableVnd > 0 && (
                          <Button size="small" variant="secondary" onClick={() => setDialog({ kind: "refund", payment })}>Hoàn tiền</Button>
                        )}
                      </div>
                      <small>
                        Nhận {formatDateTime(payment.receivedAt)}{payment.bankReference ? ` · mã tham chiếu ${payment.bankReference}` : ""}
                        {" · "}đã hoàn {formatVnd(payment.refundedVnd)} · có thể hoàn {formatVnd(payment.refundableVnd)}
                      </small>
                      {payment.note && <small>Ghi chú: {payment.note}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ab-section" aria-label="Hoàn tiền">
              <h4>Hoàn tiền ({s.refunds.length})</h4>
              {!s.refunds.length ? <p className="ab-note">Chưa có khoản hoàn.</p> : (
                <ul className="ab-list">
                  {s.refunds.map((refund) => (
                    <li key={refund.id}><div className="ab-list-row"><strong>{formatVnd(refund.amountVnd)}</strong><small>{formatDateTime(refund.createdAt)} · mã {refund.bankReference}</small></div><small>Lý do: {refund.reason}</small></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ab-section" aria-label="Giao dịch payOS">
              <h4>Giao dịch payOS ({s.orders.length})</h4>
              {!s.orders.length ? <p className="ab-note">Chưa có mã thanh toán payOS.</p> : (
                <ul className="ab-list">
                  {s.orders.map((order) => (
                    <li key={order.id}>
                      <div className="ab-list-row">
                        <strong>#{order.orderCode} · {formatVnd(order.amountVnd)}</strong>
                        <span className="ab-row-actions">
                          <OrderBadge status={order.status} />
                          {perms.canOperate && (order.status === "PENDING" || order.status === "UNDERPAID") && (
                            <Button size="small" variant="secondary" onClick={() => setDialog({ kind: "reconcile", order })}>Kiểm tra lại payOS</Button>
                          )}
                        </span>
                      </div>
                      <small>Tạo {formatDateTime(order.createdAt)} · hết hạn {formatDateTime(order.expiredAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ab-section" aria-label="Sự kiện webhook">
              <h4>Sự kiện webhook payOS ({s.webhookEvents.length})</h4>
              {!s.webhookEvents.length ? <p className="ab-note">Chưa nhận sự kiện nào.</p> : (
                <ul className="ab-list">
                  {s.webhookEvents.map((event) => (
                    <li key={event.id}>
                      <div className="ab-list-row"><strong>#{event.orderCode} · {WEBHOOK_OUTCOME_LABEL[event.outcome] ?? event.outcome}</strong><small>{formatDateTime(event.receivedAt)}</small></div>
                      <small>Mã tham chiếu {event.reference} · chữ ký {event.signatureValid ? "hợp lệ" : "KHÔNG hợp lệ"}</small>
                      <details className="ab-details"><summary>Xem nội dung (đã che số tài khoản)</summary><pre>{JSON.stringify(event.payload, null, 2)}</pre></details>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ab-section" aria-label="Nhật ký thao tác">
              <h4>Nhật ký thao tác ({s.auditTrail.length})</h4>
              {!s.auditTrail.length ? <p className="ab-note">Chưa có thao tác nào được ghi.</p> : (
                <ul className="ab-list">
                  {s.auditTrail.map((entry) => {
                    const reason = typeof entry.details?.reason === "string" ? entry.details.reason : typeof entry.details?.note === "string" ? entry.details.note : "";
                    return (
                      <li key={entry.id}>
                        <div className="ab-list-row"><strong>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</strong><small>{formatDateTime(entry.createdAt)}</small></div>
                        <small>Người làm: {entry.performer?.fullName ?? entry.performerName}{entry.performer ? ` (${entry.performer.email})` : ""}</small>
                        {reason && <small>Lý do: {reason}</small>}
                        {entry.details && <details className="ab-details"><summary>Chi tiết</summary><pre>{JSON.stringify(entry.details, null, 2)}</pre></details>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </ResponsiveDialog>

      {s && dialog?.kind === "manual" && <ManualDialog s={s} who={who} onClose={() => setDialog(null)} onDone={done} />}
      {s && dialog?.kind === "adjust" && <AdjustDialog s={s} who={who} onClose={() => setDialog(null)} onDone={done} />}
      {s && dialog?.kind === "void" && <VoidDialog s={s} who={who} onClose={() => setDialog(null)} onDone={done} />}
      {s && dialog?.kind === "refund" && <RefundDialog s={s} payment={dialog.payment} who={who} onClose={() => setDialog(null)} onDone={done} />}
      {s && dialog?.kind === "reconcile" && <ReconcileDialog s={s} order={dialog.order} who={who} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

type DialogProps = {
  s: AdminStatementDetail; who: string; onClose: () => void;
  onDone: (tone: "success" | "info" | "warning", text: string) => void;
};

const statusText = (status: StatementStatus) => ({ ISSUED: "Chờ thanh toán", PAID: "Đã thanh toán", OVERDUE: "Quá hạn", WAIVED: "Được miễn", VOID: "Đã hủy" })[status];

function ManualDialog({ s, who, onClose, onDone }: DialogProps) {
  const [amountText, setAmountText] = useState(String(s.amountDueVnd || ""));
  const [reference, setReference] = useState("");
  const [received, setReceived] = useState(() => toLocalInput(new Date()));
  const amount = parseAmount(amountText);
  const receivedDate = received ? new Date(received) : null;
  const future = receivedDate ? receivedDate.getTime() > Date.now() + 60_000 : true;
  const refValid = reference.trim().length >= 3 && reference.trim().length <= 100;
  const over = validAmount(amount) && amount > s.amountDueVnd;
  return (
    <WriteDialog open title="Ghi nhận chuyển khoản" onClose={onClose}
      summary={<>Ghi nhận <strong>{validAmount(amount) ? formatVndText(amount) : "… đ"}</strong> cho kỳ {formatPeriod(s.period)} của {who}</>}
      confirmLabel="Xác nhận ghi nhận"
      extraValid={validAmount(amount) && refValid && Boolean(receivedDate) && !future}
      signature={`${amount}|${reference.trim()}|${received}`}
      onSubmit={async ({ reason, key }) => {
        const result = await adminBilling.manualPayment(s.id, { amountVnd: amount, bankReference: reference.trim(), receivedAt: receivedDate!.toISOString(), reason }, key);
        onDone("success", `Đã ghi nhận ${formatVndText(amount)}. Kỳ phí hiện ở trạng thái: ${statusText(result.statement.status)}.`);
      }}
      warning={over ? <Alert tone="warning" title="Số này lớn hơn số còn phải thu">Phần thừa sẽ vào mục Cảnh báo để hoàn lại cho khách.</Alert> : undefined}>
      {(fe, busy) => (
        <>
          <div className="ab-grid-2">
            <div><Input label="Số tiền (VND)" inputMode="numeric" value={amountText} disabled={busy}
              onChange={(v) => setAmountText(v.replace(/[^\d]/g, ""))}
              error={fe.amountVnd || (amountText && !validAmount(amount) ? "Nhập số nguyên từ 1 đến 2.000.000.000" : undefined)}
              helper={`Gợi ý: số còn phải thu ${formatVnd(s.amountDueVnd)}`} /></div>
            <div><Input label="Mã tham chiếu ngân hàng" value={reference} disabled={busy} onChange={setReference}
              error={fe.bankReference || (reference && !refValid ? "Từ 3 đến 100 ký tự" : undefined)} helper="Mỗi mã chỉ được ghi nhận một lần." /></div>
          </div>
          <Input label="Thời điểm nhận tiền" type="datetime-local" value={received} disabled={busy} onChange={setReceived} max={toLocalInput(new Date())}
            error={fe.receivedAt || (future ? "Chọn thời điểm không ở tương lai" : undefined)} />
        </>
      )}
    </WriteDialog>
  );
}

function AdjustDialog({ s, who, onClose, onDone }: DialogProps) {
  const [amountText, setAmountText] = useState("");
  const amount = parseAmount(amountText);
  const ok = validAmount(amount, s.amountDueVnd);
  return (
    <WriteDialog open title="Giảm / miễn kỳ phí" onClose={onClose}
      summary={<>Giảm <strong>{ok ? formatVndText(amount) : "… đ"}</strong> cho kỳ {formatPeriod(s.period)} của {who}
        {ok && <>. Còn phải thu sau khi giảm: <strong>{formatVndText(s.amountDueVnd - amount)}</strong></>}</>}
      confirmLabel="Xác nhận giảm" extraValid={ok} signature={String(amount)}
      onSubmit={async ({ reason }) => {
        const result = await adminBilling.adjust(s.id, { amountVnd: amount, reason });
        const st = result.statement.status;
        const base = st === "WAIVED" ? "Kỳ phí đã được miễn." : st === "PAID" ? "Kỳ phí đã đủ nhờ khoản giảm." : `Kỳ phí vẫn ${statusText(st).toLowerCase()}, còn ${formatVndText(result.statement.amountDueVnd)}.`;
        onDone("success", result.cancelledOrders > 0 ? `${base} Đã hủy ${result.cancelledOrders} mã thanh toán đang mở, người dùng cần tạo mã mới.` : base);
      }}>
      {(fe, busy) => (
        <div className="ab-inline-actions">
          <div style={{ flex: "1 1 220px" }}>
            <Input label="Số tiền giảm (VND)" inputMode="numeric" value={amountText} disabled={busy}
              onChange={(v) => setAmountText(v.replace(/[^\d]/g, ""))}
              error={fe.amountVnd || (amountText && !ok ? `Nhập số nguyên từ 1 đến ${s.amountDueVnd.toLocaleString("vi-VN")}` : undefined)}
              helper={`Còn phải thu hiện tại: ${formatVnd(s.amountDueVnd)}`} />
          </div>
          <Button variant="secondary" disabled={busy} onClick={() => setAmountText(String(s.amountDueVnd))}>Miễn toàn bộ</Button>
        </div>
      )}
    </WriteDialog>
  );
}

function VoidDialog({ s, who, onClose, onDone }: DialogProps) {
  return (
    <WriteDialog open title="Hủy kỳ phí" onClose={onClose} summaryTone="danger"
      summary={<>Hủy kỳ phí {formatPeriod(s.period)} ({formatVndText(s.amountVnd)}) của {who}. <strong>Không thể hoàn tác.</strong> Chỉ dùng khi kỳ phí được lập nhầm.</>}
      confirmLabel="Xác nhận hủy kỳ phí" confirmTone="danger"
      onSubmit={async ({ reason }) => {
        const result = await adminBilling.voidStatement(s.id, { reason });
        onDone("success", result.cancelledOrders > 0 ? `Đã hủy kỳ phí và ${result.cancelledOrders} mã thanh toán đang mở.` : "Đã hủy kỳ phí.");
      }}
      warning={<p className="ab-note is-block">Nếu kỳ phí đã có thanh toán, hệ thống sẽ từ chối; khi đó hãy dùng Hoàn tiền hoặc Giảm/Miễn kỳ này.</p>} />
  );
}

function RefundDialog({ s, payment, who, onClose, onDone }: DialogProps & { payment: AdminPayment }) {
  const [amountText, setAmountText] = useState(String(payment.refundableVnd));
  const [reference, setReference] = useState("");
  const [waiveTouched, setWaiveTouched] = useState(false);
  const [waiveManual, setWaiveManual] = useState(true);
  const amount = parseAmount(amountText);
  const ok = validAmount(amount, payment.refundableVnd);
  const full = ok && amount === payment.amountVnd;
  const waive = waiveTouched ? waiveManual : full; // default ON only for a refund of the whole payment
  const refValid = reference.trim().length >= 3 && reference.trim().length <= 100;
  return (
    <WriteDialog open title="Hoàn tiền" onClose={onClose}
      summary={<>Hoàn <strong>{ok ? formatVndText(amount) : "… đ"}</strong> trên khoản thanh toán {formatVndText(payment.amountVnd)} của kỳ {formatPeriod(s.period)} ({who})</>}
      confirmLabel="Xác nhận hoàn tiền" extraValid={ok && refValid} signature={`${amount}|${reference.trim()}|${waive}`}
      onSubmit={async ({ reason, key }) => {
        const result = await adminBilling.refund(payment.id, { amountVnd: amount, bankReference: reference.trim(), reason, ...(waive ? { waiveRemaining: true } : {}) }, key);
        const st = result.statement.status;
        if (st === "ISSUED" || st === "OVERDUE") onDone("warning", `Đã ghi nhận hoàn ${formatVndText(amount)}. Kỳ phí quay lại "${statusText(st)}": người dùng sẽ phải thanh toán lại ${formatVndText(result.statement.amountDueVnd)}.`);
        else onDone("success", `Đã ghi nhận hoàn ${formatVndText(amount)}. Kỳ phí hiện ở trạng thái: ${statusText(st)}.`);
      }}
      warning={<Alert tone="info" title="Hệ thống chỉ GHI NHẬN khoản hoàn">Việc chuyển tiền lại cho khách được làm ở ngân hàng; hãy chuyển khoản xong rồi nhập mã tham chiếu của lần chuyển đó.</Alert>}>
      {(fe, busy) => (
        <>
          <div className="ab-grid-2">
            <div><Input label="Số tiền hoàn (VND)" inputMode="numeric" value={amountText} disabled={busy}
              onChange={(v) => setAmountText(v.replace(/[^\d]/g, ""))}
              error={fe.amountVnd || (amountText && !ok ? `Tối đa ${payment.refundableVnd.toLocaleString("vi-VN")} (phần còn có thể hoàn)` : undefined)}
              helper={`Có thể hoàn tối đa ${formatVnd(payment.refundableVnd)}`} /></div>
            <div><Input label="Mã tham chiếu ngân hàng của lần hoàn" value={reference} disabled={busy} onChange={setReference}
              error={fe.bankReference || (reference && !refValid ? "Từ 3 đến 100 ký tự" : undefined)} /></div>
          </div>
          <div className="ab-check">
            <Checkbox checked={waive} disabled={busy} label="Miễn luôn phần còn lại của kỳ này"
              onChange={(value) => { setWaiveTouched(true); setWaiveManual(value); }} />
            <small>
              {waive
                ? "Kỳ phí sẽ chuyển sang \"Được miễn\" nếu hoàn hết; khách không phải trả lại (hoàn theo chính sách)."
                : "Nếu không tích, kỳ phí sẽ mở lại (Chờ thanh toán/Quá hạn) và khách phải thanh toán lại số còn thiếu."}
            </small>
            <FieldError text={fe.waiveRemaining} />
          </div>
        </>
      )}
    </WriteDialog>
  );
}

function ReconcileDialog({ s, order, who, onClose, onDone }: DialogProps & { order: AdminOrder }) {
  return (
    <WriteDialog open title="Kiểm tra lại payOS" onClose={onClose} errorContext="reconcile"
      summary={<>Hỏi payOS về mã thanh toán <strong>#{order.orderCode}</strong> ({formatVndText(order.amountVnd)}) của kỳ {formatPeriod(s.period)} ({who}). Nếu payOS đã nhận tiền, hệ thống sẽ ghi nhận thanh toán.</>}
      confirmLabel="Kiểm tra lại"
      onSubmit={async ({ reason }) => {
        const result = await adminBilling.reconcile(order.id, { reason });
        const outcome = result.outcome as ReconcileOutcome;
        onDone(outcome === "APPLIED" ? "success" : outcome === "PENDING" ? "info" : "warning", RECONCILE_OUTCOME_LABEL[outcome] ?? outcome);
      }} />
  );
}
