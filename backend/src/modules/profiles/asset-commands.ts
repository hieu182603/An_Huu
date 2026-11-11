import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { assetEntrySchema, profileV2Schema, type ProfileV2, type AssetEntry } from "./schema-v2";
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const assetPatchSchema = z.object({ expectedRevision: z.number().int().min(1), command: z.union([
  z.object({ kind: z.enum(["ADD", "UPDATE"]), entry: assetEntrySchema, confirmUnknownGroup: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal("SPLIT"), sourceId: id, entry: assetEntrySchema }).strict(),
  z.object({ kind: z.literal("DELETE"), id }).strict(),
  z.object({ kind: z.literal("CONFIRM_NONE"), reason: z.string().trim().min(1).max(300) }).strict(),
]) }).strict();
export type AssetCommand = z.infer<typeof assetPatchSchema>["command"];
const D = Prisma.Decimal.clone({ precision: 48 });
export function assetChanges(profile: ProfileV2, command: AssetCommand): Pick<ProfileV2, "assets"> {
  const fail = (code: string, message: string): never => { throw new AppError(400, code, message); };
  const current = profile.assets;
  const rows: AssetEntry[] = current.status === "KNOWN" ? [...current.entries] : [];
  if (command.kind === "CONFIRM_NONE") {
    if (rows.length) return fail("ASSETS_NOT_EMPTY", "Hãy xóa từng tài sản trước khi xác nhận không có.");
    return { assets: { status: "NOT_APPLICABLE", reason: command.reason } };
  }
  const index = rows.findIndex(asset => asset.id === (command.kind === "DELETE" ? command.id : command.entry.id));
  if (command.kind === "DELETE" || command.kind === "UPDATE") {
    if (index < 0) return fail("ASSET_NOT_FOUND", "Tài sản không còn trong hồ sơ. Hãy tải lại trước khi lưu.");
    if (command.kind === "DELETE") rows.splice(index, 1);
    else rows[index] = command.entry;
  } else {
    if (index >= 0) return fail("ASSET_DUPLICATE_ID", "ID tài sản đã tồn tại. Hãy tải lại trước khi thêm.");
    if (current.status === "UNKNOWN" && (command.kind !== "ADD" || command.confirmUnknownGroup !== true))
      return fail("ASSET_COMPLETENESS_REQUIRED", "Xác nhận đã kê đầy đủ danh sách tài sản trước khi lưu.");
    let entry = command.entry;
    if (command.kind === "SPLIT") {
      const sourceIndex = rows.findIndex(asset => asset.id === command.sourceId), source = rows[sourceIndex];
      const originalValue = source?.value, splitValue = entry.value;
      if (!source || originalValue?.status !== "KNOWN" || splitValue.status !== "KNOWN") return fail("ASSET_SPLIT_SOURCE_REQUIRED", "Chọn tài sản gốc và giá trị đã xác định để tách.");
      if (source.housingPlan?.status === "CONFIRMED") return fail("ASSET_SPLIT_HOUSING_PLAN", "Tài sản có phương án bán hoặc cho thuê cần được rà soát trước khi tách.");
      const sameOwner = source.ownershipShare.status === entry.ownershipShare.status && (source.ownershipShare.status === "UNKNOWN" || entry.ownershipShare.status === "KNOWN" && new D(source.ownershipShare.value).eq(entry.ownershipShare.value));
      if (!sameOwner || source.currency !== entry.currency || JSON.stringify(source.valuedOn) !== JSON.stringify(entry.valuedOn) || JSON.stringify(source.liquidity) !== JSON.stringify(entry.liquidity) || JSON.stringify(source.availableFromMonth) !== JSON.stringify(entry.availableFromMonth))
        return fail("ASSET_SPLIT_BASIS_MISMATCH", "Khoản tách phải giữ cùng sở hữu, tiền tệ, ngày định giá và khả năng sử dụng với tài sản gốc.");
      const amount = new D(splitValue.value), remaining = new D(originalValue.value).minus(amount);
      if (!amount.gt(0) || remaining.lt(0)) return fail("ASSET_SPLIT_EXCEEDS_SOURCE", "Giá trị tách phải lớn hơn 0 và không vượt số còn lại.");
      const sourceAfter = { ...source, value: { status: "KNOWN" as const, value: remaining.toFixed() } };
      // Preserve the declared cost basis exactly; never duplicate it on a split.
      if (source.costBasis?.status === "KNOWN") {
        const allocated = new D(source.costBasis.value).mul(amount).div(originalValue.value).toDecimalPlaces(2);
        entry = { ...entry, costBasis: { status: "KNOWN", value: allocated.toFixed() } };
        sourceAfter.costBasis = { status: "KNOWN", value: new D(source.costBasis.value).minus(allocated).toFixed() };
      } else if (source.costBasis?.status === "UNKNOWN") entry = { ...entry, costBasis: { status: "UNKNOWN" } };
      if (remaining.isZero()) rows.splice(sourceIndex, 1); else rows[sourceIndex] = sourceAfter;
    }
    rows.push(entry);
  }
  return { assets: profileV2Schema.parse({ ...profile, assets: { status: "KNOWN", entries: rows } }).assets };
}
