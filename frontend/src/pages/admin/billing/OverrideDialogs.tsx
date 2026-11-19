import { useEffect, useState } from "react";
import { Alert, Button, Input, Select } from "../../../components/ui";
import { authenticatedRequest } from "../../../services/api";
import {
  OVERRIDE_KIND_LABEL, addMonths, adminBilling, currentPeriod, formatPeriod, formatVndText, isPeriod,
  type AdminOverride, type OverrideKind,
} from "../../../services/adminBilling";
import { WriteDialog } from "./billingShared";

export type PickedUser = { id: string; fullName: string; email: string };
const PERCENT_PATTERN = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;

export const overrideValueText = (o: Pick<AdminOverride, "kind" | "value">) =>
  o.kind === "WAIVE" ? "Miễn phí" : o.kind === "DISCOUNT_PERCENT" ? `Giảm ${Number(o.value)}%` : `Phí cố định ${formatVndText(Math.round(Number(o.value)))}`;

/** Finds an account through the existing admin users list API. */
export function UserPicker({ value, onChange, label = "Người dùng", disabled }: { value: PickedUser | null; onChange: (user: PickedUser | null) => void; label?: string; disabled?: boolean }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<PickedUser[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) { setResults(null); setError(""); return; }
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      authenticatedRequest<{ items: (PickedUser & { role?: string })[] }>(`/admin/users?page=1&limit=8&search=${encodeURIComponent(term)}`, undefined, "GET", undefined, { skipCache: true })
        .then((result) => { if (active) setResults(result.items.filter((item) => item.role !== "ADMIN").map(({ id, fullName, email }) => ({ id, fullName, email }))); })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tìm được người dùng."); })
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [text]);

  if (value) {
    return (
      <div className="ab-picker">
        <span className="field-label">{label}</span>
        <div className="ab-picked"><span><strong>{value.fullName}</strong> · {value.email}</span>
          {!disabled && <Button size="small" variant="ghost" onClick={() => { onChange(null); setText(""); }}>Đổi người dùng</Button>}</div>
      </div>
    );
  }
  return (
    <div className="ab-picker">
      <Input label={label} value={text} onChange={setText} disabled={disabled} placeholder="Gõ ít nhất 2 ký tự của email hoặc họ tên…" />
      {loading && <p className="ab-note" role="status">Đang tìm…</p>}
      {error && <p className="ab-form-error" role="alert">{error}</p>}
      {results && !loading && !results.length && <p className="ab-note">Không tìm thấy người dùng nào.</p>}
      {results && results.length > 0 && (
        <ul className="ab-picker-results" aria-label="Kết quả tìm kiếm">
          {results.map((user) => (
            <li key={user.id}><button type="button" onClick={() => onChange(user)}><strong>{user.fullName}</strong><small>{user.email}</small></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_OPTIONS = (Object.keys(OVERRIDE_KIND_LABEL) as OverrideKind[]).map((value) => ({ value, label: OVERRIDE_KIND_LABEL[value] }));

export function CreateOverrideDialog({ user: fixedUser, onClose, onDone }: { user?: PickedUser; onClose: () => void; onDone: (text: string) => void }) {
  const next = addMonths(currentPeriod(), 1);
  const [user, setUser] = useState<PickedUser | null>(fixedUser ?? null);
  const [kind, setKind] = useState<OverrideKind>("DISCOUNT_PERCENT");
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(next);
  const [to, setTo] = useState("");

  const percent = value.trim().replace(",", ".");
  const valueOk = kind === "WAIVE" || (kind === "DISCOUNT_PERCENT" ? PERCENT_PATTERN.test(percent) && Number(percent) > 0 : /^\d{1,10}$/.test(value.trim()));
  const fromOk = isPeriod(from) && from >= next;
  const toOk = to === "" || (isPeriod(to) && to >= from);
  const label = kind === "WAIVE" ? "Miễn phí" : kind === "DISCOUNT_PERCENT" ? `Giảm ${valueOk ? Number(percent) : "…"}%` : `Phí cố định ${valueOk ? formatVndText(Number(value)) : "… đ"}`;

  return (
    <WriteDialog open wide title="Tạo ưu đãi theo người dùng" onClose={onClose}
      summary={<>Tạo ưu đãi <strong>{label}</strong> cho {user ? user.email : "(chưa chọn người dùng)"}, từ kỳ <strong>{fromOk ? formatPeriod(from) : "…"}</strong>{to ? ` đến kỳ ${formatPeriod(to)}` : " đến khi thu hồi"}. Áp dụng cho các kỳ phí lập sau thời điểm này.</>}
      confirmLabel="Tạo ưu đãi" extraValid={Boolean(user) && valueOk && fromOk && toOk} signature={`${user?.id}|${kind}|${value}|${from}|${to}`}
      onSubmit={async ({ reason }) => {
        const created = await adminBilling.createOverride(user!.id, {
          kind, ...(kind === "WAIVE" ? {} : { value: kind === "DISCOUNT_PERCENT" ? percent : value.trim() }),
          fromPeriod: from, ...(to ? { toPeriod: to } : {}), reason,
        });
        onDone(`Đã tạo ưu đãi ${overrideValueText(created)} cho ${user!.email}.`);
      }}>
      {(fe, busy) => (
        <>
          <UserPicker value={user} onChange={setUser} disabled={busy || Boolean(fixedUser)} />
          <div className="ab-grid-2">
            <Select label="Loại ưu đãi" options={KIND_OPTIONS} value={kind} disabled={busy} onChange={(v) => { setKind(v as OverrideKind); setValue(""); }} error={fe.kind} />
            {kind !== "WAIVE" && (
              <Input label={kind === "DISCOUNT_PERCENT" ? "Phần trăm giảm (%)" : "Mức phí cố định / tháng (VND)"} inputMode={kind === "DISCOUNT_PERCENT" ? "decimal" : "numeric"}
                value={value} disabled={busy} onChange={setValue}
                error={fe.value || (value && !valueOk ? (kind === "DISCOUNT_PERCENT" ? "Lớn hơn 0 và tối đa 100, tối đa 4 số thập phân" : "Số nguyên VND từ 0") : undefined)} />
            )}
          </div>
          <div className="ab-grid-2">
            <Input label="Từ kỳ" type="month" value={from} min={next} disabled={busy} onChange={setFrom} error={fe.fromPeriod || (!fromOk ? `Chỉ chọn từ ${formatPeriod(next)} trở đi` : undefined)} />
            <Input label="Đến kỳ (tùy chọn)" type="month" value={to} min={from} disabled={busy} onChange={setTo} error={fe.toPeriod || (!toOk ? "Phải bằng hoặc sau kỳ bắt đầu" : undefined)} helper="Để trống = đến khi thu hồi" />
          </div>
        </>
      )}
    </WriteDialog>
  );
}

export function RevokeOverrideDialog({ override, onClose, onDone }: { override: AdminOverride; onClose: () => void; onDone: (tone: "success" | "info", text: string) => void }) {
  return (
    <WriteDialog open title="Thu hồi ưu đãi" onClose={onClose} summaryTone="danger"
      summary={<>Thu hồi ưu đãi <strong>{overrideValueText(override)}</strong> ({formatPeriod(override.fromPeriod)} – {override.toPeriod ? formatPeriod(override.toPeriod) : "đến khi thu hồi"}) của {override.user?.email ?? "tài khoản đã xóa"}. Hiệu lực từ kỳ kế tiếp.</>}
      confirmLabel="Xác nhận thu hồi" confirmTone="danger"
      warning={<Alert tone="info" title="Kỳ phí đã lập không đổi">Ưu đãi đang chạy sẽ kết thúc sau tháng hiện tại; ưu đãi chưa bắt đầu sẽ bị hủy ngay.</Alert>}
      onSubmit={async ({ reason }) => {
        const result = await adminBilling.revokeOverride(override.id, { reason });
        onDone("success", result.effect === "END_AT_CURRENT_PERIOD"
          ? `Ưu đãi kết thúc sau tháng hiện tại (đến kỳ ${formatPeriod(result.toPeriod)}).`
          : "Ưu đãi chưa bắt đầu nên đã được hủy ngay.");
      }} />
  );
}
