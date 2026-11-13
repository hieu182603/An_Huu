import { useEffect,useRef,useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { allocationPackages,type WorkspaceInput } from "../services/allocationWorkspace";
import { discovery } from "../services/discovery";
import { financeMoney } from "../utils/financeHubSummary";
import { portfolioAssetLabel } from "../utils/portfolioGlidePath";
import ResponsiveDialog from "./ResponsiveDialog";

export default function AllocationPackages({input,onClose,labels}:{input:WorkspaceInput|null;onClose:()=>void;labels:Record<string,string>}){
 const en=useI18n().language==="en",t=(vi:string,eng:string)=>en?eng:vi;
 const query=useDiscoveryQuery(JSON.stringify(input),signal=>input?allocationPackages(input,signal):Promise.resolve(null));
 const [saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const inputKey=JSON.stringify(input),liveKey=useRef(inputKey);liveKey.current=inputKey;
 useEffect(()=>setMessage(""),[inputKey]);
 const save=async(ids:string[])=>{if(saving)return;const key=inputKey;setSaving(true);setMessage("");const results=await Promise.allSettled(ids.map(id=>discovery.saveProduct(id,true)));const count=results.filter(r=>r.status==="fulfilled").length;if(liveKey.current===key)setMessage(count===ids.length?t(`Đã lưu quan tâm ${count} sản phẩm.`,`Saved ${count} products.`):t(`Đã lưu ${count}/${ids.length} sản phẩm. Một số sản phẩm chưa lưu được; bạn có thể thử lại.`,`Saved ${count}/${ids.length} products. Some could not be saved; retry is available.`));setSaving(false);};
 return <ResponsiveDialog open={!!input} onClose={onClose} title={t("Gợi ý gói đầu tư phù hợp","Investment package comparison")} className="user-workspace-dialog allocation-products-dialog">
  <p>{t("Đối chiếu sản phẩm đang được phép giới thiệu theo số vốn từng nhóm, mức rủi ro, phí, thanh khoản và mức đầu tư tối thiểu.","Compare distributable products against capital per asset, risk, fees, liquidity and investment minimums.")}</p>
  {query.loading&&input?<p role="status">{t("Đang đối chiếu sản phẩm…","Loading product comparison…")}</p>:query.error?<p role="alert">{query.error}</p>:query.data&&<>
   {query.data.status==="UNCONFIGURED"?<p role="status">{t("Chưa có sản phẩm với dữ liệu hợp lệ đáp ứng phân bổ này.","No products with valid metadata satisfy this allocation.")}</p>:<><div className="allocation-package-grid">{(["A","B"] as const).map(key=>{const p=query.data![key];return <article key={key}><h3>{t("Gói","Package")} {key}</h3><p>{key==="A"?t("Ưu tiên phí thấp, sau đó thanh khoản.","Lower fee first, then liquidity."):t("Ưu tiên lựa chọn khác và thời gian thanh khoản ngắn.","Alternative products with shorter liquidity periods.")}</p><dl><div><dt>{t("Tỷ trọng có sản phẩm","Allocation covered")}</dt><dd>{p.coveredPercent}%</dd></div><div><dt>{t("Phí năm ước tính trên vốn tương ứng","Annual fee on matched capital")}</dt><dd>{financeMoney(p.annualFeeVnd,en)}</dd></div><div><dt>{t("Nhà cung cấp","Providers")}</dt><dd>{p.providers}</dd></div></dl><button className="overview-button secondary" disabled={saving||!p.ids.length} onClick={()=>void save(p.ids)}>{t("Lưu quan tâm","Save products")}</button>{p.ids.length>0&&p.ids.length<=3&&<Link className="remaining-text" to={`/user/explore?tab=compare&compare=${p.ids.map(encodeURIComponent).join(",")}`} onClick={onClose}>{t("So sánh điều kiện →","Compare terms →")}</Link>}{p.ids.length>3&&<p>{t("Chọn tối đa 3 sản phẩm tại trang Sản phẩm để so sánh chi tiết.","Select up to three products in Products for a detailed comparison.")}</p>}</article>;})}</div>{query.data.same&&<p>{t("Hai gói trùng nhau vì chưa có lựa chọn thay thế đủ điều kiện.","The packages match because no eligible alternative is available.")}</p>}</>}
   <div className="allocation-comparison-scroll"><table><thead><tr><th>{t("Nhóm tài sản / Vốn","Asset / Capital")}</th><th>{t("Gói A","Package A")}</th><th>{t("Gói B","Package B")}</th></tr></thead><tbody>{query.data.lines.map(row=><tr key={row.assetClass}><th>{portfolioAssetLabel(row.assetClass,en?"en":"vi",labels)} · {row.weightPercent}%<br/>{financeMoney(row.amountVnd,en)}</th>{(["a","b"] as const).map(key=><td key={key}>{row[key]?<><Link to={`/user/explore?product=${encodeURIComponent(row[key]!.id)}`} onClick={onClose}>{row[key]!.name}</Link><br/>{row[key]!.partnerName}<br/>{t("Phí","Fee")}: {row[key]!.annualFeePercent}%/{t("năm","yr")}<br/>{t("Thanh khoản","Liquidity")}: {row[key]!.liquidityDays} {t("ngày","days")}</>:t("Chưa có sản phẩm đáp ứng","No eligible product")}</td>)}</tr>)}</tbody></table></div>
  </>}
  {message&&<p role="status">{message}</p>}<p>{t("Đây là đối chiếu thông tin, chưa lưu kế hoạch hoặc đặt lệnh. Phí hiển thị chưa gồm phí giao dịch và thuế riêng của sản phẩm.","This is an informational comparison. It does not save a plan or place orders. Displayed fees exclude separate transaction fees and taxes.")}</p><Link className="overview-button secondary" to="/user/explore" onClick={onClose}>{t("Khám phá sản phẩm","Explore products")}</Link>
 </ResponsiveDialog>;
}
