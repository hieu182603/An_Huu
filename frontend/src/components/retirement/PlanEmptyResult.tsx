import { useI18n } from "../../i18n";
import { Icon } from "../ui";
import "./plan-empty-result.css";

/** Keep the plan's visual structure without inventing a financial result. */
export default function PlanEmptyResult({ onSetup }: { onSetup:()=>void }) {
  const en=useI18n().language==="en",t=(vi:string,english:string)=>en?english:vi;
  return <section className="plan-empty-result" aria-label={t("Kế hoạch chưa có kết quả tính","Plan awaiting calculation")}>
    <div className="plan-empty-hero">
      <div><h2>{t("Cùng xây dựng lộ trình nghỉ hưu của bạn","Build your retirement path")}</h2><p>{t("Các thông tin đã khai được giữ nguyên. Hoàn thiện mục tiêu và kết quả khảo sát để xem số tiền cần chuẩn bị, khả năng góp và lộ trình sử dụng quỹ.","Your existing details are kept. Complete your goal and survey results to see the required fund, contribution capacity and retirement path.")}</p><button type="button" className="overview-button" onClick={onSetup}>{t("Thiết lập phương án","Set up your plan")}</button></div>
      <aside><Icon name="chart"/><strong>{t("Chưa có kết quả dự phóng","No projection yet")}</strong><p>{t("Số tiền và biểu đồ sẽ xuất hiện sau khi đủ dữ liệu.","Amounts and the chart appear when the required data is available.")}</p></aside>
    </div>
    <div className="plan-empty-metrics">{[
      t("Quỹ cần khi nghỉ hưu","Fund needed at retirement"),t("Quỹ dự kiến có","Projected fund"),t("Phần còn thiếu","Remaining gap"),t("Chi tiêu lúc nghỉ hưu","Retirement spending"),
    ].map(label=><article key={label}><span>{label}</span><strong>{t("Chưa xác định","Undetermined")}</strong><small>{t("Chờ thông tin để tính","Awaiting calculation inputs")}</small></article>)}</div>
    <div className="plan-empty-chart"><header><h2>{t("Quỹ nghỉ hưu của bạn","Your retirement fund")}</h2><span>{t("Dự phóng","Projection")}</span></header><div><Icon name="chart"/><h3>{t("Chưa có lộ trình quỹ để hiển thị","No fund path to display yet")}</h3><p>{t("Sau khi thiết lập, bạn có thể kéo xem từng tháng và đối chiếu các phương án góp tiền tại đây.","Once set up, explore each month and compare contribution options here.")}</p><button type="button" className="overview-button secondary" onClick={onSetup}>{t("Hoàn thiện thông tin kế hoạch","Complete plan information")}</button></div></div>
  </section>;
}
