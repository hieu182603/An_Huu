import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../common/errors";
import { log } from "../common/logger";
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  let result = error instanceof AppError ? error : new AppError(500, "INTERNAL_ERROR", "Đã xảy ra lỗi nội bộ trên máy chủ.");
  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = Object.create(null);
    for (const issue of error.issues) (fields[issue.path.join(".") || "body"] ??= []).push(issue.message);
    result = new AppError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", fields);
  } else if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") result = new AppError(400, "INVALID_JSON", "JSON không hợp lệ.");
    if (error.type === "entity.too.large") result = new AppError(413, "PAYLOAD_TOO_LARGE", "Dữ liệu vượt quá kích thước cho phép.");
    if (error.type === "encoding.unsupported" || error.type === "charset.unsupported")
      result = new AppError(415, "UNSUPPORTED_ENCODING", "Định dạng dữ liệu không được hỗ trợ.");
  }
  if (result.status >= 500) log("error", "http.error", { requestId: res.locals.requestId, code: result.code, statusCode: result.status });
  res.status(result.status).json({
    error: { code: result.code, message: result.message, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) },
    requestId: res.locals.requestId,
  });
};
