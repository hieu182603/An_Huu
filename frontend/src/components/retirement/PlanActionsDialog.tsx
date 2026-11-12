import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useI18n } from "../../i18n";
import type { RetirementPreviewResult } from "../../services/retirement";
import { formatMoneyDecimal } from "../../utils/moneyDisplay";
import { Decimal } from "../../utils/decimal";
import ResponsiveDialog from "../ResponsiveDialog";
import ProfileFormattedInput from "../ProfileFormattedInput";
import { Icon, type IconName } from "../ui";
import "./plan-actions-dialog.css";

export function contributionInput(value:string|null|undefined,ceil:boolean):string|null {
  if(value==null||!/^\d+(\.\d+)?$/.test(value))return null;
  const [whole,fraction=""]=value.split(".");
  const cents=BigInt(whole)*100n+BigInt(fraction.slice(0,2).padEnd(2,"0"))+(ceil&&/[1-9]/.test(fraction.slice(2))?1n:0n);
  if((cents/100n).toString().length>16)return null;
  return `${cents/100n}${cents%100n?"."+(cents%100n).toString().padStart(2,"0"):""}`;
}

export function PlanOptionsDialog({ onClose, onContribution, onAdvanced, onHistory, isCurrent }: {
  onClose: () => void; onContribution: () => void; onAdvanced: () => void; onHistory: () => void; isCurrent: boolean;
}) {
  const en = useI18n().language === "en", t = (vi:string, english:string) => en ? english : vi;
  const items: Array<{ title:string; note:string; icon:IconName; to?:string; action?:()=>void }> = [
    { title:t("Mục tiêu & tuổi nghỉ hưu","Goal and retirement age"), note:t("Mốc nghỉ hưu, chi tiêu và thời gian chuẩn bị quỹ","Retirement date, spending and fund horizon"), icon:"target", to:"/user/goal" },
    { title:t("Mức trích góp hàng tháng","Monthly contribution"), note:t("Đối chiếu mục tiêu và ngân sách trước khi chọn","Compare the target with your budget"), icon:"wallet", action:onContribution },
    { title:t("Thu nhập, chi tiêu & tài sản","Income, spending and assets"), note:t("Thu chi gia đình, tài sản để dành, nợ và hỗ trợ","Household cashflow, assets, debts and support"), icon:"wallet", to:"/user/profile" },
    { title:t("Phân bổ tài sản & danh mục","Asset allocation and portfolio"), note:t("Vốn dự phòng, mục tiêu gần hạn và vốn dài hạn","Emergency reserves, near-term goals and long-term capital"), icon:"chart", to:"/user/risk-portfolio" },
  ];
  return <ResponsiveDialog open title={t("Chỉnh sửa phương án","Edit plan options")} onClose={onClose} className="user-workspace-dialog plan-options-dialog">
    <span className="plan-option-status">{isCurrent?t("Kế hoạch chính đang dùng","Current main plan"):t("Phương án đang xem · chưa lưu","Option being viewed · not saved")}</span>
    <p>{t("Chọn thông số bạn muốn điều chỉnh trong kế hoạch:","Choose what you want to adjust:")}</p>
    <div className="plan-options-grid">{items.map(item => {
      const content = <><span className="plan-option-icon"><Icon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.note}</small></span><span aria-hidden="true">→</span></>;
      return item.to ? <Link key={item.title} to={item.to} onClick={onClose}>{content}</Link> : <button type="button" key={item.title} onClick={()=>{onClose();item.action?.();}}>{content}</button>;
    })}</div>
    <footer className="plan-dialog-actions"><button type="button" className="overview-button secondary" onClick={()=>{onClose();onHistory();}}>{t("Xem các phương án","View saved options")}</button><button type="button" className="overview-button secondary" onClick={()=>{onClose();onAdvanced();}}>{t("Giả định nâng cao","Advanced assumptions")}</button><button type="button" className="overview-button primary" onClick={onClose}>{t("Đóng","Close")}</button></footer>
  </ResponsiveDialog>;
}

export function PlanContributionDialog({ preview, initial, readonly, onClose, onSave }: {
  preview: RetirementPreviewResult | null; initial: string; readonly:boolean; onClose:()=>void; onSave:(value:string)=>void;
}) {
  const en=useI18n().language==="en", t=(vi:string,english:string)=>en?english:vi;
  const [value,setValue]=useState(initial), [error,setError]=useState("");
  const s=preview?.calculation?.summary, required=s?.requiredConstantMonthlyContribution, capacity=preview?.calculation?.rows[0]?.contributionCapacity;
  const requiredInput=contributionInput(required,true),capacityInput=contributionInput(capacity,false);
  const money=(v:string|null|undefined)=>formatMoneyDecimal(v,en);
  const save=(event:FormEvent)=>{event.preventDefault();if(readonly)return;
    if(!/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value)){setError(t("Nhập số tiền không âm, tối đa 2 chữ số thập phân.","Enter a non-negative amount with at most two decimal places."));return;}
    onClose();onSave(value);
  };
  return <ResponsiveDialog open title={t("Chọn mức góp vừa với bạn","Choose a contribution that suits you")} onClose={onClose} className="user-workspace-dialog plan-contribution-dialog">
    <form onSubmit={save}>
      <div className="plan-contribution-layout"><section><h3>{t("Mục tiêu & ngân sách","Target and budget")}</h3>
        <div className="plan-contribution-reference"><span>{t("Mục tiêu cần có","Target contribution")}</span><strong>{money(required)}{required!=null&&t("/tháng","/month")}</strong><p>{required==null?t("Chưa có mức góp đều phù hợp với các kỳ góp hiện tại.","No constant contribution solution is available for the current periods."):t("Mức góp đều tham chiếu để đạt mục tiêu trong mô hình.","Reference constant contribution needed to meet the modeled goal.")}</p><button type="button" className="overview-button secondary" disabled={readonly||requiredInput==null} onClick={()=>{setValue(requiredInput!);setError("");}}>{t("Theo mức cần","Use target amount")}</button></div>
        <div className="plan-contribution-reference"><span>{t("Khả năng ngân sách","Contribution capacity")}</span><strong>{money(capacity)}{capacity!=null&&t("/tháng","/month")}</strong><p>{t("Ngân sách có thể góp của tháng đầu, sau khoản dành riêng và giới hạn nguồn tiền.","First-month capacity after reserves and funding constraints.")}</p><button type="button" className="overview-button secondary" disabled={readonly||capacityInput==null} onClick={()=>{setValue(capacityInput!);setError("");}}>{t("Theo khả năng","Use budget capacity")}</button></div>
      </section><section><h3>{t("Số tiền trích góp mỗi tháng","Your monthly contribution")}</h3><ProfileFormattedInput format="money" label={t("Góp vào quỹ nghỉ hưu mỗi tháng","Monthly retirement fund contribution")} value={value} disabled={readonly} onChange={v=>{setValue(v);setError("");}}/>
        <p className="plan-contribution-note">{t("Mức góp cập nhật vào bản đang xem; kế hoạch chính giữ nguyên cho đến khi bạn lưu và chọn áp dụng. Chọn số tiền phù hợp để duy trì đều đặn mỗi tháng.","This updates the option being viewed. Your main plan changes only after you save and explicitly apply it. Choose an amount you can maintain.")}</p>
        {capacity!=null&&/^\d+(\.\d+)?$/.test(value)&&new Decimal(value).gt(capacity)&&<p role="status">{t("Mức chọn đang vượt ngân sách tháng đầu. Phép tính sẽ giới hạn số thực góp theo từng tháng.","This exceeds the first month's budget. The model caps actual contributions month by month.")}</p>}
        {readonly&&<p role="status">{t("Kế hoạch này tính tiếp từ số dư thực tế. Mở Cập nhật tình hình để thay đổi dự báo.","This plan starts from an actual balance. Open progress tracking to update its forecast.")} <Link to="/user/simulation" onClick={onClose}>{t("Cập nhật tình hình","Update progress")}</Link></p>}
        {error&&<p role="alert">{error}</p>}
      </section></div>
      <footer className="plan-dialog-actions"><button type="button" className="overview-button secondary" onClick={onClose}>{t("Hủy","Cancel")}</button><button className="overview-button primary" disabled={readonly}>{t("Lưu mức góp","Save contribution")}</button></footer>
    </form>
  </ResponsiveDialog>;
}
