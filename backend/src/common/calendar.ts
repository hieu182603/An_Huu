import { z } from "zod";

export const monthSchema = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/);
export const dateSchema = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine(value => { const date = new Date(value + "T00:00:00.000Z"); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Ngày không hợp lệ.");
export function addMonths(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
