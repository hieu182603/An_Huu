/**
 * Tiện ích chuẩn hóa và hiển thị ngày tháng năm theo định dạng Việt Nam: Ngày/Tháng/Năm (DD/MM/YYYY)
 * Khắc phục hoàn toàn tình trạng bị ngược định dạng (YYYY-MM-DD hoặc MM/DD/YYYY).
 */

export function formatDateVN(date: string | Date | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string") {
    const trimmed = date.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-");
      return `${d}/${m}/${y}`;
    }
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      const [y, m] = trimmed.split("-");
      return `${m}/${y}`;
    }
    // ISO string with T (e.g. 2026-10-12T05:28:14.829Z)
    if (trimmed.includes("T")) {
      const [datePart] = trimmed.split("T");
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [y, m, d] = datePart.split("-");
        return `${d}/${m}/${y}`;
      }
    }
  }

  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatMonthVN(monthStr: string | null | undefined): string {
  if (!monthStr) return "";
  const trimmed = monthStr.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [y, m] = trimmed.split("-");
    return `${m}/${y}`;
  }
  return formatDateVN(monthStr);
}
