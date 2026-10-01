function downloadBlob(filename: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, value: unknown) {
  downloadBlob(filename, "application/json;charset=utf-8", JSON.stringify(value, null, 2));
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const body = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  downloadBlob(filename, "text/csv;charset=utf-8", `\uFEFF${body}`);
}
