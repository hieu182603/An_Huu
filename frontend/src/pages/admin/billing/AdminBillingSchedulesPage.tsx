import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Icon, Input, Modal } from "../../../components/ui";
import {
  SCHEDULE_STATUS_LABEL, addMonths, adminBilling, billingErrorMessage, currentPeriod, formatDateTime, formatPeriod, formatVnd, isPeriod, markBillingDisabled,
  type AdminFeeSchedule, type SchedulePreview, type ScheduleTerms,
} from "../../../services/adminBilling";
import { ErrorAlert, PageHeader, PermissionHint, WriteDialog, usePerms } from "./billingShared";

const RATE_PATTERN = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;
const isInt = (text: string) => /^\d{1,10}$/.test(text.trim());

type FormState = { rate: string; min: string; max: string; step: string; dueDay: string; reminders: string; trial: string; note: string };
const fromSchedule = (s: AdminFeeSchedule | null): FormState => s
  ? { rate: s.annualRatePercent, min: String(s.minMonthlyVnd), max: s.maxMonthlyVnd === null ? "" : String(s.maxMonthlyVnd), step: String(s.roundingStepVnd),
      dueDay: String(s.dueDay), reminders: s.reminderDays.join(", "), trial: String(s.trialMonths), note: s.note ?? "" }
  : { rate: "", min: "", max: "", step: "1000", dueDay: "10", reminders: "7, 3, 1", trial: "0", note: "" };

type Parsed = { terms: ScheduleTerms | null; errors: Partial<Record<keyof FormState, string>>; note: string | null };
function parseForm(f: FormState): Parsed {
  const errors: Parsed["errors"] = {};
  const rate = f.rate.trim().replace(",", ".");
  if (!RATE_PATTERN.test(rate)) errors.rate = "Nhập từ 0 đến 100, tối đa 4 số thập phân (ví dụ 0.5)";
  if (!isInt(f.min)) errors.min = "Nhập số nguyên VND từ 0";
  if (f.max.trim() && !isInt(f.max)) errors.max = "Nhập số nguyên VND hoặc để trống (không trần)";
  else if (f.max.trim() && isInt(f.min) && Number(f.max) < Number(f.min)) errors.max = "Mức tối đa phải lớn hơn hoặc bằng mức tối thiểu";
  if (!isInt(f.step) || Number(f.step) < 1) errors.step = "Bước làm tròn phải lớn hơn 0";
  if (!isInt(f.dueDay) || Number(f.dueDay) < 1 || Number(f.dueDay) > 28) errors.dueDay = "Ngày hạn từ 1 đến 28";
  if (!isInt(f.trial) || Number(f.trial) > 12) errors.trial = "Số tháng dùng thử từ 0 đến 12";
  const days = f.reminders.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 28)) errors.reminders = "Mỗi số nhắc phải từ 1 đến 28";
  else if (days.length > 10) errors.reminders = "Tối đa 10 mốc nhắc";
  else if (days.some((d, i) => i > 0 && d <= days[i - 1])) errors.reminders = "Các số phải tăng dần, không trùng nhau";
  if (f.note.length > 500) errors.note = "Tối đa 500 ký tự";
  const note = f.note.trim() ? f.note.trim() : null;
  if (Object.keys(errors).length) return { terms: null, errors, note };
  return {
    errors, note,
    terms: { annualRatePercent: rate, minMonthlyVnd: Number(f.min), maxMonthlyVnd: f.max.trim() ? Number(f.max) : null, roundingStepVnd: Number(f.step),
      dueDay: Number(f.dueDay), reminderDays: days, trialMonths: Number(f.trial) },
  };
}

export default function AdminBillingSchedulesPage() {
  const perms = usePerms();
  const [items, setItems] = useState<AdminFeeSchedule[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; schedule: AdminFeeSchedule } | null>(null);
  const [previewOf, setPreviewOf] = useState<AdminFeeSchedule | null>(null);
  const [publishOf, setPublishOf] = useState<AdminFeeSchedule | null>(null);
  // A draft may only be published after its latest saved version was previewed.
  const [previews, setPreviews] = useState<Record<string, { updatedAt: string; data: SchedulePreview }>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems((await adminBilling.schedules()).items); }
    catch (err) { if (!markBillingDisabled(err)) setError(billingErrorMessage(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const hasDraft = items?.some((item) => item.status === "DRAFT") ?? false;
  const previewed = (s: AdminFeeSchedule) => previews[s.id]?.updatedAt === s.updatedAt;

  return (
    <div className="admin-page ab-page">
      <PageHeader title="Biểu phí" description="Các phiên bản biểu phí dịch vụ. Chỉ bản nháp mới sửa được; phải xem trước tác động trước khi công bố.">
        <div className="ab-header-actions">
          {perms.canManageSchedules && <Button icon="plus" onClick={() => setForm({ mode: "create" })}>Tạo bản nháp</Button>}
          <Button variant="ghost" icon="sparkles" onClick={() => void load()} disabled={loading}>Làm mới</Button>
        </div>
      </PageHeader>
      {!perms.canManageSchedules && <PermissionHint need="SYSTEM_ADMIN" />}
      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}
      {perms.canManageSchedules && hasDraft && <p className="ab-note">Đang có một bản nháp. Có thể tạo thêm bản nháp khác nếu cần; chỉ bản được công bố mới có hiệu lực.</p>}
      {error && <ErrorAlert message={error} onRetry={() => void load()} />}

      <Card className="admin-table-card">
        <div className="admin-users-table-wrap">
          <table className="admin-users-table admin-stack-table ab-table">
            <thead>
              <tr>
                <th>Phiên bản</th><th>Trạng thái</th><th className="ab-num">Tỷ lệ/năm</th><th className="ab-num">Tối thiểu/tháng</th><th className="ab-num col-optional">Tối đa/tháng</th>
                <th className="ab-num col-optional">Làm tròn</th><th className="col-optional">Hạn · nhắc · dùng thử</th><th>Áp dụng từ</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && !items ? (
                <tr><td colSpan={9} className="ab-empty"><Icon name="sparkles" /> Đang tải biểu phí…</td></tr>
              ) : !items?.length ? (
                <tr><td colSpan={9} className="ab-empty">Chưa có biểu phí nào.</td></tr>
              ) : items.map((s) => (
                <tr key={s.id}>
                  <td data-label="Phiên bản"><strong>v{s.version}</strong>{s.note && <small>{s.note}</small>}<small>Cập nhật {formatDateTime(s.updatedAt)}</small></td>
                  <td data-label="Trạng thái"><Badge tone={s.status === "PUBLISHED" ? "success" : s.status === "DRAFT" ? "info" : "neutral"}>{SCHEDULE_STATUS_LABEL[s.status]}</Badge></td>
                  <td className="ab-num" data-label="Tỷ lệ/năm">{s.annualRatePercent}%</td>
                  <td className="ab-num" data-label="Tối thiểu/tháng">{formatVnd(s.minMonthlyVnd)}</td>
                  <td className="ab-num col-optional" data-label="Tối đa/tháng">{s.maxMonthlyVnd === null ? "Không trần" : formatVnd(s.maxMonthlyVnd)}</td>
                  <td className="ab-num col-optional" data-label="Làm tròn">{formatVnd(s.roundingStepVnd)}</td>
                  <td className="col-optional" data-label="Hạn · nhắc · dùng thử">ngày {s.dueDay} · nhắc {s.reminderDays.length ? s.reminderDays.join(", ") : "không"} · {s.trialMonths} tháng</td>
                  <td data-label="Áp dụng từ">{s.effectiveFromPeriod ? formatPeriod(s.effectiveFromPeriod) : "—"}{s.publishedAt && <small>Công bố {formatDateTime(s.publishedAt)}</small>}</td>
                  <td>
                    {s.status === "DRAFT" && perms.canManageSchedules && (
                      <div className="ab-row-actions">
                        <Button size="small" variant="secondary" onClick={() => setForm({ mode: "edit", schedule: s })}>Sửa</Button>
                        <Button size="small" variant="secondary" onClick={() => setPreviewOf(s)}>Xem trước tác động</Button>
                        <Button size="small" disabled={!previewed(s)} title={previewed(s) ? undefined : "Hãy xem trước tác động của bản nháp này trước"} onClick={() => setPublishOf(s)}>Công bố</Button>
                      </div>
                    )}
                    {s.status === "DRAFT" && perms.canManageSchedules && !previewed(s) && <small>Xem trước tác động để bật nút Công bố.</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {form && (
        <ScheduleFormDialog mode={form.mode} schedule={form.mode === "edit" ? form.schedule : null} onClose={() => setForm(null)}
          onDone={(text) => { setForm(null); setNotice({ tone: "success", text }); void load(); }} />
      )}
      {previewOf && (
        <PreviewDialog schedule={previewOf} onClose={() => setPreviewOf(null)}
          onLoaded={(data) => setPreviews((current) => ({ ...current, [previewOf.id]: { updatedAt: previewOf.updatedAt, data } }))}
          canPublish={perms.canManageSchedules} onPublish={() => { setPublishOf(previewOf); setPreviewOf(null); }} />
      )}
      {publishOf && (
        <PublishDialog schedule={publishOf} accountCount={previews[publishOf.id]?.data.accountCount} onClose={() => setPublishOf(null)}
          onDone={(text) => { setPublishOf(null); setNotice({ tone: "success", text }); void load(); }} />
      )}
    </div>
  );
}

function ScheduleFormDialog({ mode, schedule, onClose, onDone }: { mode: "create" | "edit"; schedule: AdminFeeSchedule | null; onClose: () => void; onDone: (text: string) => void }) {
  const [f, setF] = useState<FormState>(() => fromSchedule(schedule));
  const set = (key: keyof FormState) => (value: string) => setF((current) => ({ ...current, [key]: value }));
  const parsed = parseForm(f);
  const touched = (key: keyof FormState) => f[key] !== fromSchedule(schedule)[key];
  const changed = mode === "create" || (Object.keys(f) as (keyof FormState)[]).some(touched);
  const show = (key: keyof FormState, server: Record<string, string>, serverKey: string) => (f[key] !== "" || mode === "edit" ? parsed.errors[key] : undefined) || server[serverKey];

  return (
    <WriteDialog open wide title={mode === "create" ? "Tạo bản nháp biểu phí" : `Sửa bản nháp v${schedule?.version}`} onClose={onClose}
      summary={mode === "create"
        ? <>Tạo bản nháp biểu phí mới. Bản nháp <strong>chưa có hiệu lực</strong> cho tới khi được công bố.</>
        : <>Sửa bản nháp <strong>v{schedule?.version}</strong>. Sau khi sửa cần xem trước tác động lại trước khi công bố.</>}
      confirmLabel={mode === "create" ? "Tạo bản nháp" : "Lưu thay đổi"} extraValid={Boolean(parsed.terms) && changed}
      onSubmit={async ({ reason }) => {
        const terms = parsed.terms!;
        if (mode === "create") {
          const created = await adminBilling.createSchedule({ ...terms, ...(parsed.note ? { note: parsed.note } : {}), reason });
          onDone(`Đã tạo bản nháp v${created.version}. Hãy xem trước tác động rồi công bố.`);
          return;
        }
        const base = schedule!;
        const body: Parameters<typeof adminBilling.patchSchedule>[1] = { expectedUpdatedAt: base.updatedAt, reason };
        if (terms.annualRatePercent !== base.annualRatePercent) body.annualRatePercent = terms.annualRatePercent;
        if (terms.minMonthlyVnd !== base.minMonthlyVnd) body.minMonthlyVnd = terms.minMonthlyVnd;
        if (terms.maxMonthlyVnd !== base.maxMonthlyVnd) body.maxMonthlyVnd = terms.maxMonthlyVnd;
        if (terms.roundingStepVnd !== base.roundingStepVnd) body.roundingStepVnd = terms.roundingStepVnd;
        if (terms.dueDay !== base.dueDay) body.dueDay = terms.dueDay;
        if (terms.trialMonths !== base.trialMonths) body.trialMonths = terms.trialMonths;
        if (terms.reminderDays.join(",") !== base.reminderDays.join(",")) body.reminderDays = terms.reminderDays;
        if (parsed.note !== base.note) body.note = parsed.note;
        const saved = await adminBilling.patchSchedule(base.id, body);
        onDone(`Đã lưu bản nháp v${saved.version}.`);
      }}>
      {(fe, busy) => (
        <>
          <div className="ab-grid-3">
            <Input label="Tỷ lệ phí / năm (%)" inputMode="decimal" value={f.rate} disabled={busy} onChange={set("rate")} error={show("rate", fe, "annualRatePercent")} helper="Ví dụ 0.5 = 0,5%/năm trên tài sản tính phí" />
            <Input label="Phí tối thiểu / tháng (VND)" inputMode="numeric" value={f.min} disabled={busy} onChange={set("min")} error={show("min", fe, "minMonthlyVnd")} />
            <Input label="Phí tối đa / tháng (VND)" inputMode="numeric" value={f.max} disabled={busy} onChange={set("max")} error={show("max", fe, "maxMonthlyVnd")} helper="Để trống = không giới hạn" />
          </div>
          <div className="ab-grid-3">
            <Input label="Bước làm tròn (VND)" inputMode="numeric" value={f.step} disabled={busy} onChange={set("step")} error={show("step", fe, "roundingStepVnd")} />
            <Input label="Ngày hạn thanh toán (1–28)" inputMode="numeric" value={f.dueDay} disabled={busy} onChange={set("dueDay")} error={show("dueDay", fe, "dueDay")} />
            <Input label="Tháng dùng thử (0–12)" inputMode="numeric" value={f.trial} disabled={busy} onChange={set("trial")} error={show("trial", fe, "trialMonths")} />
          </div>
          <Input label="Nhắc trước hạn (ngày, tăng dần)" value={f.reminders} disabled={busy} onChange={set("reminders")} error={show("reminders", fe, "reminderDays")} helper="Ví dụ 1, 3, 7 — mỗi số từ 1 đến 28, tối đa 10 mốc" />
          <Input label="Ghi chú hiển thị cho quản trị (tùy chọn)" value={f.note} disabled={busy} onChange={set("note")} error={show("note", fe, "note")} />
        </>
      )}
    </WriteDialog>
  );
}

function PreviewDialog({ schedule, onClose, onLoaded, canPublish, onPublish }: {
  schedule: AdminFeeSchedule; onClose: () => void; onLoaded: (data: SchedulePreview) => void; canPublish: boolean; onPublish: () => void;
}) {
  const [data, setData] = useState<SchedulePreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminBilling.previewSchedule(schedule.id)
      .then((result) => { if (active) { setData(result); onLoaded(result); } })
      .catch((err) => { if (active && !markBillingDisabled(err)) setError(billingErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.id, attempt]);

  const delta = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("vi-VN")} ₫`;
  return (
    <Modal open title={`Xem trước tác động · bản nháp v${schedule.version}`} className="ab-modal-wide" onClose={onClose}>
      <div className="ab-form">
        {loading && <p className="ab-spinner-row" role="status"><span className="spinner" aria-hidden="true" /> Đang tính lại phí cho mọi tài khoản, có thể mất vài giây…</p>}
        {error && <Alert tone="danger" title="Chưa xem trước được" action={<Button size="small" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Thử lại</Button>}>{error}</Alert>}
        {data && (
          <>
            <p className="ab-note is-block">
              <strong>Hiện hành v{data.current.version} → Bản nháp v{data.draft.version}</strong> · kỳ {formatPeriod(data.period)} · {data.accountCount.toLocaleString("vi-VN")} tài khoản.
              {" "}Tính theo hồ sơ hiện tại của các tài khoản đang dùng thử, đang hoạt động hoặc quá hạn.
            </p>
            <dl className="ab-compare">
              <div><dt>Tổng phí/tháng hiện hành</dt><dd>{formatVnd(data.totalBeforeVnd)}</dd></div>
              <div><dt>Tổng phí/tháng theo bản nháp</dt><dd>{formatVnd(data.totalAfterVnd)}</dd></div>
              <div><dt>Chênh lệch</dt><dd className={data.totalDeltaVnd > 0 ? "ab-pos" : data.totalDeltaVnd < 0 ? "ab-neg" : undefined}>{delta(data.totalDeltaVnd)}</dd></div>
              <div><dt>Tăng / giảm / giữ nguyên</dt><dd>{data.counts.up} / {data.counts.down} / {data.counts.same}</dd></div>
            </dl>
            <h3 style={{ margin: 0, fontSize: 15 }}>20 tài khoản thay đổi nhiều nhất</h3>
            <div className="admin-users-table-wrap">
              <table className="admin-users-table ab-table">
                <thead><tr><th>Người dùng</th><th className="ab-num">Tài sản tính phí</th><th className="ab-num">Hiện hành</th><th className="ab-num">Bản nháp</th><th className="ab-num">Chênh lệch</th></tr></thead>
                <tbody>
                  {!data.topChanges.length ? <tr><td colSpan={5} className="ab-empty">Không có tài khoản nào thay đổi.</td></tr> : data.topChanges.map((row) => (
                    <tr key={row.userId}>
                      <td><div className="ab-user"><strong>{row.fullName ?? "—"}</strong><small>{row.email ?? ""}</small></div></td>
                      <td className="ab-num">{formatVnd(Math.round(Number(row.baseAmountVnd)))}</td>
                      <td className="ab-num">{formatVnd(row.beforeVnd)}</td><td className="ab-num">{formatVnd(row.afterVnd)}</td>
                      <td className={`ab-num ${row.deltaVnd > 0 ? "ab-pos" : row.deltaVnd < 0 ? "ab-neg" : ""}`}>{delta(row.deltaVnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="ab-footer">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          {canPublish && <Button disabled={!data} onClick={onPublish}>Tiếp tục công bố…</Button>}
        </div>
      </div>
    </Modal>
  );
}

function PublishDialog({ schedule, accountCount, onClose, onDone }: { schedule: AdminFeeSchedule; accountCount?: number; onClose: () => void; onDone: (text: string) => void }) {
  const next = addMonths(currentPeriod(), 1);
  const [period, setPeriod] = useState(next);
  const valid = isPeriod(period) && period >= next;
  return (
    <WriteDialog open title={`Công bố biểu phí v${schedule.version}`} onClose={onClose} summaryTone="danger"
      summary={valid
        ? <>Từ tháng <strong>{formatPeriod(period)}</strong> mọi người dùng áp dụng biểu phí v{schedule.version}; hệ thống gửi thông báo cho {accountCount === undefined ? "các" : accountCount.toLocaleString("vi-VN")} tài khoản. <strong>Không thể hoàn tác.</strong></>
        : <>Chọn tháng áp dụng (từ {formatPeriod(next)} trở đi).</>}
      confirmLabel="Xác nhận công bố" confirmTone="danger" extraValid={valid} signature={period}
      onSubmit={async ({ reason }) => {
        const result = await adminBilling.publishSchedule(schedule.id, { effectiveFromPeriod: period, reason });
        onDone(`Đã công bố biểu phí v${result.version}, áp dụng từ ${formatPeriod(result.effectiveFromPeriod)}. Đã gửi ${result.notified} thông báo.`);
      }}>
      {(fe, busy) => (
        <Input label="Áp dụng từ tháng" type="month" value={period} disabled={busy} onChange={setPeriod} min={next}
          error={fe.effectiveFromPeriod || (!valid ? `Chỉ chọn từ ${formatPeriod(next)} trở đi` : undefined)} helper="Chỉ chọn được từ kỳ kế tiếp; tháng đã lập kỳ phí sẽ bị từ chối." />
      )}
    </WriteDialog>
  );
}
