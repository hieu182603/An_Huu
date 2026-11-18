import { z } from "zod";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";

/**
 * Converts admin-entered DAILY price / total-return index levels into the monthly
 * rows of `marketDocumentSchema`. Pure function: no database, no defaults.
 *
 * Rules (never invent data):
 * - Month-end value = the last observation inside the calendar month; it must fall
 *   within `maxMonthEndGapDays` of the calendar month end, otherwise MONTH_END_MISSING.
 * - Monthly return = month-end(m) / month-end(m-1) - 1. The first month only serves as base.
 * - A month with no observation is MONTH_MISSING; nothing is filled with 0 or interpolated.
 * - Only the trailing month may be incomplete (the current month while data is updated
 *   daily) and is then left out with a warning. The same applies to trailing months whose
 *   CPI is not yet published. Interior gaps are errors.
 */
const code = /^[A-Z][A-Z0-9_]{0,39}$/;
const number = /^(0|[1-9]\d*)(\.\d+)?$/;
const signed = /^-?(0|[1-9]\d*)(\.\d+)?$/;
export const MAX_DAILY_LINES = 40000;
const MAX_ISSUES = 200;

export const dailyConvertSchema = z.object({
  pricesCsv: z.string().min(1).max(1_500_000),
  cpi: z.object({ kind: z.enum(["MOM_PERCENT", "INDEX"]), csv: z.string().min(1).max(200_000) }).strict(),
  maxMonthEndGapDays: z.number().int().min(0).max(15).default(7),
}).strict();
export type DailyConvertInput = z.infer<typeof dailyConvertSchema>;

export type DailyIssue = { code: string; message: string; line?: number; assetClass?: string; month?: string };
export type DailyPreviewRow = { month: string; returns: Record<string, string | null>; cpi: string | null; monthEndDates: Record<string, string | null> };
export type DailyConvertResult = {
  status: "VALID" | "INVALID";
  assets: string[];
  observationCount: number;
  period: { from: string; to: string } | null;
  /** Only filled when VALID: exactly the `rows` of a market document. */
  rows: Array<{ month: string; returns: Record<string, string>; cpi: string }>;
  preview: DailyPreviewRow[];
  issues: DailyIssue[];
  warnings: DailyIssue[];
};

const splitLine = (line: string) => line.split(/\t|;|,/).map(c => c.trim().replace(/^"(.*)"$/, "$1").trim());
const lines = (text: string) => text.replace(/^﻿/, "").split(/\r?\n/).map((l, i) => ({ text: l.trim(), line: i + 1 })).filter(l => l.text);
function normalizeDate(raw: string) {
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  const value = vn ? `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}` : raw;
  return dateSchema.safeParse(value).success ? value : null;
}
function normalizeMonth(raw: string) {
  const vn = /^(\d{1,2})\/(\d{4})$/.exec(raw);
  const value = vn ? `${vn[2]}-${vn[1].padStart(2, "0")}` : raw;
  return monthSchema.safeParse(value).success ? value : null;
}
const lastDay = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** 16 decimals is the maximum the market document accepts; never "-0". */
export function formatRate(value: InstanceType<typeof D>) {
  const fixed = value.toDecimalPlaces(16, D.ROUND_HALF_EVEN).toFixed(16).replace(/0+$/, "").replace(/\.$/, "");
  return fixed === "-0" ? "0" : fixed;
}

export function convertDailyMarketData(input: DailyConvertInput): DailyConvertResult {
  const issues: DailyIssue[] = [], warnings: DailyIssue[] = [];
  const fail = (issue: DailyIssue): DailyConvertResult => ({ status: "INVALID", assets: [], observationCount: 0, period: null, rows: [], preview: [], issues: [issue], warnings });
  const priceLines = lines(input.pricesCsv);
  if (priceLines.length < 2) return fail({ code: "CSV_EMPTY", message: "CSV giá cần dòng tiêu đề và ít nhất một dòng dữ liệu." });
  if (priceLines.length - 1 > MAX_DAILY_LINES) return fail({ code: "CSV_TOO_LARGE", message: `Tối đa ${MAX_DAILY_LINES} dòng dữ liệu mỗi lần.` });
  const header = splitLine(priceLines[0].text), assets = header.slice(1).map(h => h.toUpperCase());
  if (!/^(date|ngay|ngày)$/i.test(header[0] ?? "")) issues.push({ code: "HEADER_DATE_REQUIRED", line: 1, message: "Cột đầu tiên phải là 'date' (ngày)." });
  if (!assets.length || assets.length > 20) return fail({ code: "ASSET_COLUMNS_REQUIRED", line: 1, message: "Cần từ 1 đến 20 cột lớp tài sản sau cột ngày." });
  assets.forEach(a => { if (!code.test(a)) issues.push({ code: "INVALID_ASSET_CODE", line: 1, assetClass: a, message: `Mã lớp tài sản '${a}' không hợp lệ (chữ in hoa, số, gạch dưới).` }); });
  if (new Set(assets).size !== assets.length) issues.push({ code: "DUPLICATE_ASSET_COLUMN", line: 1, message: "Trùng cột lớp tài sản." });

  // assetClass -> date -> value
  const series = new Map(assets.map(a => [a, new Map<string, InstanceType<typeof D>>()]));
  const seenDates = new Set<string>();
  let observationCount = 0;
  for (const { text, line } of priceLines.slice(1)) {
    const cells = splitLine(text), date = normalizeDate(cells[0] ?? "");
    if (!date) { issues.push({ code: "INVALID_DATE", line, message: `Ngày '${cells[0] ?? ""}' không hợp lệ (YYYY-MM-DD hoặc DD/MM/YYYY).` }); continue; }
    if (seenDates.has(date)) { issues.push({ code: "DUPLICATE_DATE", line, message: `Ngày ${date} xuất hiện nhiều lần.` }); continue; }
    seenDates.add(date);
    if (cells.length - 1 > assets.length) issues.push({ code: "TOO_MANY_CELLS", line, message: "Dòng có nhiều ô hơn tiêu đề." });
    assets.forEach((asset, i) => {
      const raw = (cells[i + 1] ?? "").replace(/\s/g, "");
      if (raw === "") return; // no trading / no publication that day: just no observation
      if (!number.test(raw) || raw.length > 30 || !new D(raw).gt(0)) { issues.push({ code: "INVALID_PRICE", line, assetClass: asset, message: `Giá/chỉ số '${raw}' phải là số dương, dấu chấm thập phân, không phân cách hàng nghìn.` }); return; }
      series.get(asset)!.set(date, new D(raw)); observationCount++;
    });
  }

  // CPI by month as a decimal month-on-month change.
  const cpiRaw = new Map<string, InstanceType<typeof D>>();
  for (const { text, line } of lines(input.cpi.csv)) {
    const cells = splitLine(text);
    if (line === 1 && !normalizeMonth(cells[0] ?? "")) continue; // optional header
    const month = normalizeMonth(cells[0] ?? ""), raw = (cells[1] ?? "").replace(/\s/g, "");
    if (!month) { issues.push({ code: "CPI_INVALID_MONTH", line, message: `Tháng CPI '${cells[0] ?? ""}' không hợp lệ (YYYY-MM hoặc MM/YYYY).` }); continue; }
    if (cpiRaw.has(month)) { issues.push({ code: "CPI_DUPLICATE_MONTH", line, month, message: `CPI tháng ${month} bị trùng.` }); continue; }
    const ok = input.cpi.kind === "INDEX" ? number.test(raw) && new D(raw).gt(0) : signed.test(raw);
    if (!ok || raw.length > 30) { issues.push({ code: "CPI_INVALID_VALUE", line, month, message: `Giá trị CPI '${raw}' không hợp lệ.` }); continue; }
    cpiRaw.set(month, new D(raw));
  }
  const cpiAt = (month: string) => {
    const v = cpiRaw.get(month); if (!v) return null;
    if (input.cpi.kind === "MOM_PERCENT") return v.div(100);
    const prev = cpiRaw.get(addMonths(month, -1)); return prev ? v.div(prev).minus(1) : null;
  };

  // Month-end observation per asset.
  const monthEnd = new Map<string, Map<string, { date: string; value: InstanceType<typeof D> }>>();
  for (const [asset, points] of series) {
    const ends = new Map<string, { date: string; value: InstanceType<typeof D> }>();
    for (const [date, value] of points) { const month = date.slice(0, 7), cur = ends.get(month); if (!cur || cur.date < date) ends.set(month, { date, value }); }
    monthEnd.set(asset, ends);
    if (!ends.size) issues.push({ code: "ASSET_WITHOUT_DATA", assetClass: asset, message: `Cột ${asset} không có dữ liệu.` });
  }
  const allMonths = [...monthEnd.values()].flatMap(m => [...m.keys()]).sort();
  if (!allMonths.length || issues.some(i => i.code === "ASSET_WITHOUT_DATA"))
    return { status: "INVALID", assets, observationCount, period: null, rows: [], preview: [], issues, warnings };
  // Base month = the latest first month among assets, so every column has a starting value.
  const base = [...monthEnd.values()].map(m => [...m.keys()].sort()[0]).sort().at(-1)!;
  let last = allMonths.at(-1)!;
  const endState = (asset: string, month: string) => {
    const e = monthEnd.get(asset)!.get(month);
    if (!e) return "MISSING" as const;
    return Number(e.date.slice(8, 10)) >= lastDay(month) - input.maxMonthEndGapDays ? "OK" as const : "LATE" as const;
  };
  // Only the trailing month may be incomplete (data updated daily during the month).
  if (last > base && assets.some(a => endState(a, last) !== "OK")) {
    warnings.push({ code: "LAST_MONTH_INCOMPLETE", month: last, message: `Tháng ${last} chưa có giá cuối tháng cho mọi lớp tài sản nên chưa được đưa vào.` });
    last = addMonths(last, -1);
  }
  // Trailing months whose CPI is not yet published are left out, interior gaps are not.
  for (let skipped = 0; skipped < 3 && last > base && cpiAt(last) === null; skipped++) {
    warnings.push({ code: "CPI_NOT_YET_PUBLISHED", month: last, message: `Chưa có CPI tháng ${last}; tháng này chưa được đưa vào.` });
    last = addMonths(last, -1);
  }
  const preview: DailyPreviewRow[] = [];
  for (const asset of assets) {
    const state = endState(asset, base);
    if (state !== "OK") issues.push({ code: state === "MISSING" ? "MONTH_MISSING" : "MONTH_END_MISSING", assetClass: asset, month: base,
      message: `${asset}: tháng gốc ${base} thiếu giá cuối tháng.` });
  }
  for (let month = addMonths(base, 1); month <= last && preview.length < 2400; month = addMonths(month, 1)) {
    const row: DailyPreviewRow = { month, returns: {}, cpi: null, monthEndDates: {} };
    const prev = addMonths(month, -1);
    for (const asset of assets) {
      const state = endState(asset, month), e = monthEnd.get(asset)!.get(month), p = monthEnd.get(asset)!.get(prev);
      row.monthEndDates[asset] = e?.date ?? null;
      if (state === "MISSING") issues.push({ code: "MONTH_MISSING", assetClass: asset, month, message: `${asset}: không có dữ liệu trong tháng ${month}.` });
      else if (state === "LATE") issues.push({ code: "MONTH_END_MISSING", assetClass: asset, month, message: `${asset}: quan sát cuối của tháng ${month} là ${e!.date}, cách cuối tháng quá ${input.maxMonthEndGapDays} ngày.` });
      if (state !== "OK" || !p || endState(asset, prev) !== "OK") { row.returns[asset] = null; continue; }
      const r = e!.value.div(p.value).minus(1);
      if (r.gt(10)) { issues.push({ code: "RETURN_OUT_OF_RANGE", assetClass: asset, month, message: `${asset}: lợi suất tháng ${month} vượt 1000%, kiểm tra lại số liệu.` }); row.returns[asset] = null; continue; }
      row.returns[asset] = formatRate(r);
    }
    const cpi = cpiAt(month);
    if (cpi === null) issues.push({ code: "CPI_MISSING", month, message: `Thiếu CPI tháng ${month}${input.cpi.kind === "INDEX" ? " (hoặc tháng trước để tính thay đổi)" : ""}.` });
    else if (!cpi.gt(-1) || cpi.gt(10)) issues.push({ code: "CPI_OUT_OF_RANGE", month, message: `CPI tháng ${month} ngoài khoảng cho phép.` });
    else row.cpi = formatRate(cpi);
    preview.push(row);
  }
  if (preview.length < 12) issues.push({ code: "TOO_FEW_MONTHS", message: `Cần ít nhất 12 tháng lợi suất có đủ CPI; hiện có ${preview.length}.` });
  const period = preview.length ? { from: preview[0].month, to: preview.at(-1)!.month } : null;
  const valid = issues.length === 0;
  return {
    status: valid ? "VALID" : "INVALID", assets, observationCount, period, preview, warnings,
    issues: issues.length > MAX_ISSUES ? [...issues.slice(0, MAX_ISSUES), { code: "MORE_ISSUES", message: `Còn ${issues.length - MAX_ISSUES} lỗi khác chưa hiển thị.` }] : issues,
    rows: valid ? preview.map(r => ({ month: r.month, returns: r.returns as Record<string, string>, cpi: r.cpi! })) : [],
  };
}
