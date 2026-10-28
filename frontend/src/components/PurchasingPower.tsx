import { useEffect, useState } from "react";
import { fetchUserAssumptions, fetchUserAssumptionDetail, type AssumptionDetail } from "../services/assumptions";
import { useI18n } from "../i18n";
import { Button } from "./ui";

// Educational display only: compound each published calendar-year rate for the
// months covered. Never extrapolate a missing year or substitute a default rate.
export function PurchasingPower({
  expense,
  startMonth,
  retirementMonth,
  assumptionVersionId,
}: {
  expense: number;
  startMonth: string;
  retirementMonth?: string;
  assumptionVersionId?: string;
}) {
  const { language } = useI18n();
  const en = language === "en";
  const [detail, setDetail] = useState<AssumptionDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading"); setDetail(null);
    const loadAssumption = async () => {
      let targetId = assumptionVersionId;
      if (!targetId) {
        const list = await fetchUserAssumptions();
        const published = list.items.find(item => item.status === "PUBLISHED");
        if (!published) throw new Error("No published assumptions");
        targetId = published.id;
      }
      const result = await fetchUserAssumptionDetail(targetId);
      if (result.status !== "PUBLISHED") throw new Error("Not published");
      if (active) { setDetail(result); setStatus("ready"); }
    };
    loadAssumption().catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [attempt, assumptionVersionId]);
  const monthIndex = (value?: string) => value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1 : null;
  const start = monthIndex(startMonth), end = monthIndex(retirementMonth);
  const years: Array<{ year: number; months: number; percent: number; sourceId: string }> = [];
  let factor = 1;
  let complete = start !== null && end !== null && end >= start && Number.isFinite(expense) && expense > 0;
  if (complete && detail && start !== null && end !== null) {
    for (let month = start; month < end;) {
      const year = Math.floor(month / 12), months = Math.min(end - month, 12 - month % 12);
      const matches = detail.data.inflation.filter(row => row.year === year);
      const row = matches[0], rate = row?.percent?.trim() ? Number(row.percent) : NaN;
      if (matches.length !== 1 || !Number.isFinite(rate) || rate <= -100 || row.rateType !== "EFFECTIVE_ANNUAL") { complete = false; break; }
      factor *= (1 + rate / 100) ** (months / 12);
      years.push({ year, months, percent: rate, sourceId: row.sourceId });
      month += months;
    }
  }
  const number = new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 2 });
  const money = (value: number) => new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 0 }).format(value) + (en ? " VND/month" : " đồng/tháng");
  const sources = detail?.data.sources.filter(source => years.some(year => year.sourceId === source.id)) ?? [];
  return <section className="purchasing-power" aria-labelledby="purchasing-power-title">
    <h1 id="purchasing-power-title" tabIndex={-1}>{en ? "Today's lifestyle, tomorrow's purchasing power" : "Mức sống hôm nay, sức mua ngày mai"}</h1>
    <p>{en ? "The same lifestyle may cost more at retirement. This illustration uses the published annual inflation series." : "Cùng một mức sống có thể cần nhiều tiền hơn khi nghỉ hưu. Minh họa này dùng chuỗi lạm phát từng năm đang công bố."}</p>
    {status === "loading" ? <p role="status">{en ? "Loading published assumptions…" : "Đang tải bộ giả định đang công bố…"}</p>
      : status === "error" ? <div role="alert"><p>{en ? "Published assumptions are unavailable. No substitute rate has been used." : "Chưa tải được bộ giả định đang công bố. Chưa thể ước tính sức mua."}</p><Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{en ? "Retry" : "Thử lại"}</Button></div>
      : !complete || !Number.isFinite(expense * factor) ? <p role="status">{en ? "Enter a valid spending amount and retirement date. Inflation must cover every year of the period." : "Cần mức chi và thời điểm nghỉ hưu hợp lệ, cùng dữ liệu lạm phát đủ từng năm trong khoảng tính."}</p>
      : <>
        <p className="purchasing-power-formula">{money(expense)} × {number.format(factor)} ≈ <strong data-testid="future-purchasing-power">{money(expense * factor)}</strong></p>
        <p>{en ? `At ${retirementMonth}; ${startMonth} prices. Amount × ∏ (1 + annual inflation)^(months / 12).` : `Tại tháng ${retirementMonth}; theo giá tháng ${startMonth}. Mức chi × ∏ (1 + lạm phát từng năm)^(số tháng / 12).`}</p>
        <details><summary>{en ? "Annual calculation" : "Xem phép tính từng năm"}</summary><ul>{years.map(row => <li key={row.year}>{row.year}: (1 + {number.format(row.percent)}%)^({row.months}/12)</li>)}</ul></details>
      </>}
    {detail && <details className="purchasing-power-sources"><summary>{en ? "Why does An Huu use this figure?" : "Vì sao An Hưu dùng con số này?"}</summary>
      <p>{detail.data.title} · {en ? "Version" : "Phiên bản"} {detail.version}</p>
      <p>{detail.data.reason}</p>
      <p>{en ? "Annual assumptions vary; this is an estimate, not a guaranteed future price." : "Giả định có thể khác nhau theo năm; đây là ước tính, không phải mức giá tương lai được bảo đảm."}</p>
      {sources.length ? <ul>{sources.map(source => <li key={source.id}><strong>{source.title}</strong> — {source.publisher} · {source.release} · {source.publishedOn}<p>{source.note}</p>{/^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer">{en ? "View source" : "Xem nguồn"}</a>}</li>)}</ul> : <p>{en ? "Source details are unavailable for this period." : "Chưa có chi tiết nguồn cho khoảng thời gian này."}</p>}
    </details>}
  </section>;
}
