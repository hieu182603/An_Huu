import { useRef, useState } from "react";
import { Alert, Button, Input, Modal } from "../ui";
import ProfileFormattedInput from "../ProfileFormattedInput";
import { useI18n } from "../../i18n";
import type { DebtEntry, KnownOrUnknown } from "../../services/financialProfile";

type Props = { loan: DebtEntry | null; valuationDate: string; onClose: () => void; onSave: (loan: DebtEntry) => Promise<boolean> };
const valueOf = (value?: KnownOrUnknown<string>) => value?.status === "KNOWN" ? value.value : "";
const money = /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/;
const month = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function DebtLoanDialog({ loan, valuationDate, onClose, onSave }: Props) {
  const { language } = useI18n();
  const vi = language !== "en";
  const [label, setLabel] = useState(loan?.label ?? "");
  const [balance, setBalance] = useState(valueOf(loan?.outstandingBalance));
  const [payment, setPayment] = useState(valueOf(loan?.payment));
  const [share, setShare] = useState("100");
  const [balanceDate, setBalanceDate] = useState(loan ? valueOf(loan.balanceAsOf) : valuationDate);
  const [startMonth, setStartMonth] = useState(loan?.startMonth ?? valuationDate.slice(0, 7));
  const [endMonth, setEndMonth] = useState(loan?.endMonth ?? "");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const hasContract = loan?.contract?.status === "KNOWN";

  async function save() {
    if (saving.current) return;
    setError("");
    if (!label.trim() || label.trim().length > 120) return setError(vi ? "Nhập tên khoản vay, tối đa 120 ký tự." : "Enter a loan name up to 120 characters.");
    if ((!money.test(balance) && !(loan && balance === "")) || (!loan && Number(balance) <= 0) || (!money.test(payment) && !(loan && payment === ""))) {
      return setError(vi ? "Nhập dư nợ và tiền trả mỗi tháng hợp lệ (tối đa 16 chữ số, 2 số lẻ). Dư nợ mới phải lớn hơn 0." : "Enter valid balances and monthly payments (up to 16 digits and 2 decimal places). A new balance must be positive.");
    }
    if (!loan && (!/^\d+(\.\d{1,2})?$/.test(share) || Number(share) <= 0 || Number(share) > 100)) return setError(vi ? "Tỷ lệ nghĩa vụ phải lớn hơn 0 và không quá 100%." : "The share must be greater than 0 and at most 100%.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(balanceDate) || !Number.isFinite(Date.parse(balanceDate)) || new Date(balanceDate).toISOString().slice(0, 10) !== balanceDate || !month.test(startMonth) || (endMonth && (!month.test(endMonth) || endMonth < startMonth))) {
      return setError(vi ? "Kiểm tra ngày xác nhận dư nợ và tháng trả nợ. Tháng kết thúc phải từ tháng bắt đầu trở đi." : "Check the balance date and repayment months. The end month cannot precede the start month.");
    }
    if (loan?.frequency === "ONCE" && endMonth !== startMonth) return setError(vi ? "Khoản trả một lần cần cùng tháng bắt đầu và kết thúc." : "A one-off payment must start and end in the same month.");
    const known = (value: string): KnownOrUnknown<string> => value ? { status: "KNOWN", value } : { status: "UNKNOWN" };
    const next: DebtEntry = {
      ...(loan ?? {
        id: `dbt_${crypto.randomUUID()}`, currency: "VND", frequency: "MONTHLY" as const,
        paymentShare: known((Number(share) / 100).toFixed(4)),
        balanceShare: known((Number(share) / 100).toFixed(4)),
        contract: { status: "UNKNOWN" as const }, responsibility: { status: "UNKNOWN" as const },
      }),
      label: label.trim(), outstandingBalance: known(balance), payment: known(payment),
      balanceAsOf: known(balanceDate), startMonth, endMonth: endMonth || null,
    };
    saving.current = true; setBusy(true);
    try {
      if (!await onSave(next)) setError(vi ? "Chưa lưu được khoản vay. Thông tin bạn nhập vẫn được giữ; hãy kiểm tra thông báo và thử lại." : "Could not save. Your input has been kept; check the notification and retry.");
    } catch (err) { setError(err instanceof Error ? err.message : (vi ? "Chưa lưu được khoản vay." : "Could not save the loan.")); }
    finally { saving.current = false; setBusy(false); }
  }

  return <Modal open title={loan ? (vi ? "Sửa khoản vay" : "Edit loan") : (vi ? "Khai báo khoản vay mới" : "Declare new loan")} onClose={() => { if (!saving.current) onClose(); }} className="debt-loan-dialog">
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="debt-loan-fields">
        <Input label={vi ? "Tên khoản vay" : "Loan name"} value={label} onChange={setLabel} placeholder={vi ? "Ví dụ: Vay mua nhà" : "e.g. Home loan"} />
        <div className="debt-loan-form-grid">
          <ProfileFormattedInput format="money" label={vi ? "Dư nợ gốc hiện tại (VND)" : "Outstanding principal (VND)"} value={balance} onChange={setBalance} />
          <ProfileFormattedInput format="money" label={vi ? "Số tiền trả mỗi tháng (VND)" : "Monthly payment (VND)"} value={payment} onChange={setPayment} />
        </div>
        {!loan && <Input type="number" label={vi ? "Phần nợ bạn chịu trách nhiệm (%)" : "Your share of the debt (%)"} value={share} onChange={setShare} min={0.01} max={100} step={0.01} />}
        <h3>{vi ? "Thời gian của khoản vay" : "Loan dates"}</h3>
        <ProfileFormattedInput format="date" label={vi ? "Ngày xác nhận dư nợ" : "Balance confirmation date"} value={balanceDate} onChange={setBalanceDate} disabled={hasContract} helper={vi ? "Ngày số dư nợ ở trên có hiệu lực, theo sao kê hoặc hợp đồng (dd/mm/yyyy)." : "The date the balance above is valid, from your statement or contract (dd/mm/yyyy)."} />
        <div className="debt-loan-form-grid">
          <ProfileFormattedInput format="month" label={vi ? "Tháng bắt đầu trả nợ" : "First repayment month"} value={startMonth} onChange={setStartMonth} />
          <ProfileFormattedInput format="month" label={vi ? "Tháng kết thúc trả nợ (nếu biết)" : "Last repayment month (if known)"} value={endMonth} onChange={setEndMonth} disabled={hasContract} />
        </div>
        <p className="debt-loan-date-help">{hasContract
          ? (vi ? "Ngày dư nợ và tháng kết thúc lấy từ lịch hợp đồng đã lưu. Hai mốc này cần được cập nhật cùng lịch hợp đồng để tránh lệch số liệu." : "The balance date and end month come from the saved contract schedule and must be revised together with that schedule.")
          : (vi ? "Bạn có thể để trống tháng kết thúc nếu chưa biết. Đây là thông tin khai báo, chưa phải ngày hết nợ do hệ thống tính. Để so sánh trả trước, cần thêm lịch gốc, lãi, phí và điều kiện trả trước từ hợp đồng; form này chưa nhập lịch chi tiết đó." : "Leave the end month empty if unknown. This is a declared date, not a calculated payoff date. Early repayment comparison also needs contractual principal, interest, fees and prepayment terms; this form does not enter that detailed schedule.")}</p>
        {balanceDate && balanceDate !== valuationDate && <p className="debt-loan-date-help">{vi ? "Ngày dư nợ khác ngày cập nhật hồ sơ. Hãy dùng số dư đúng ngày cập nhật hồ sơ để hệ thống có thể phân tích; không đổi ngày nếu số dư chưa được xác nhận." : "The balance date differs from the profile valuation date. Analysis needs a confirmed balance as of that date."}</p>}
      </fieldset>
      {error && <Alert tone="danger" title={vi ? "Kiểm tra thông tin khoản vay" : "Check loan information"}>{error}</Alert>}
      <div className="debt-loan-dialog-actions">
        <Button disabled={busy} onClick={onClose}>{vi ? "Hủy bỏ" : "Cancel"}</Button>
        <Button type="submit" variant="primary" loading={busy}>{vi ? "Lưu khoản vay" : "Save loan"}</Button>
      </div>
    </form>
  </Modal>;
}
