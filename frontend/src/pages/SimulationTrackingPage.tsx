import {lazy,Suspense,useState} from "react";
import {Link,useSearchParams} from "react-router";
import {useI18n} from "../i18n";
import "./simulation-audit.css";
import "./remaining-user-sync.css";
export {formatVNDText} from "./simulation/format";
const ActualsTab=lazy(()=>import("./simulation/ActualsTab"));
export default function SimulationTrackingPage({defaultTab="actuals"}:{defaultTab?:"actuals"|"what-if"}={}){
 const en=useI18n().language==="en",[params,setParams]=useSearchParams(),[busy,setBusy]=useState(false),tab=params.get("tab")==="what-if"?"what-if":params.get("tab")==="actuals"?"actuals":defaultTab;
 return <div className="plan-screen remaining-user-page"><Link className="remaining-text" to="/user/plan">{en?"← Retirement plan":"← Kế hoạch nghỉ hưu"}</Link><header><h1>{tab==="actuals"?(en?"Is your plan still on track?":"Kế hoạch có còn phù hợp?"):(en?"Adjust upcoming months":"Điều chỉnh những tháng sắp tới")}</h1><p>{tab==="actuals"?(en?"Update when your income, spending or goals change.":"Cập nhật khi thu nhập, chi tiêu hoặc mục tiêu thay đổi."):(en?"Reconcile a real monthly balance, then preview changes for future months. Save and confirm separately to change your main plan.":"Đối soát số dư một tháng, rồi tính thử thay đổi của các tháng sau. Lưu phương án và xác nhận riêng khi muốn đổi kế hoạch chính.")}</p></header><nav className="saved-actions" aria-label={en?"Tracking views":"Các màn theo dõi"}>{(["actuals","what-if"] as const).map(value=><button key={value} className="overview-button secondary" aria-pressed={tab===value} disabled={busy} onClick={()=>setParams(prev=>{const next=new URLSearchParams(prev);next.set("tab",value);return next;})}>{value==="actuals"?(en?"Actual tracking":"Cập nhật tình hình"):(en?"Future changes":"Điều chỉnh tương lai")}</button>)}</nav><Suspense fallback={<p role="status">{en?"Loading tracking…":"Đang tải sổ theo dõi…"}</p>}><ActualsTab futureMode={tab==="what-if"} onBusyChange={setBusy}/></Suspense></div>;
}
