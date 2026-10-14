import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../common/errors";
import { log } from "../common/logger";
import { MulterError } from "multer";
import type { SystemSettingsService } from "../modules/settings/service";

// Retryable dependency blips are warnings; unhandled 500s stay ERROR and other 5xx need operator action.
const TRANSIENT_CODES = new Set(["DATABASE_UNAVAILABLE", "NOT_READY"]);
function systemLogLevel(result: AppError) {
  return TRANSIENT_CODES.has(result.code) ? "WARNING" : result.status === 500 ? "ERROR" : "CRITICAL";
}
// Class name and Prisma code only: error messages can carry query arguments, paths and PII.
function causeOf(error: unknown) {
  if (!error || typeof error !== "object" || error instanceof AppError) return undefined;
  const name = /^[A-Za-z]{1,64}$/.test(error.constructor?.name ?? "") ? error.constructor.name : "UnknownError";
  const code = "code" in error && typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : undefined;
  return code ? `${name}:${code}` : name;
}
// The app-level handler runs after Express restores req.baseUrl, so rebuild the mount prefix from
// the original URL and keep the route template; unmatched paths get id-like segments masked.
function templatedPath(req: Parameters<ErrorRequestHandler>[1]) {
  const segments = req.originalUrl.split("?")[0].split("/").filter(Boolean);
  const route = typeof req.route?.path === "string" ? req.route.path : undefined;
  if (route) {
    const routeSegments = route.split("/").filter(Boolean);
    return "/" + [...segments.slice(0, segments.length - routeSegments.length), ...routeSegments].join("/");
  }
  return "/" + segments.map(s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^\d+$/.test(s) ? ":id" : s).join("/");
}

export function createErrorHandler(recordSystemLog?: SystemSettingsService["recordSystemLog"]): ErrorRequestHandler {
 return (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  let result = error instanceof AppError ? error : new AppError(500, "INTERNAL_ERROR", "Đã xảy ra lỗi nội bộ trên máy chủ.");
  if (error instanceof MulterError) {
    result = new AppError(400, "INVALID_UPLOAD", error.code === "LIMIT_FILE_SIZE" ? "Ảnh tối đa 5 MB." : "Chỉ tải lên một ảnh trong mỗi lần.");
  } else if (error instanceof ZodError) {
    const fields: Record<string, string[]> = Object.create(null);
    for (const issue of error.issues) (fields[issue.path.join(".") || "body"] ??= []).push(issue.message);
    result = new AppError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", fields);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
    result = new AppError(409, "CONCURRENT_UPDATE", "Dữ liệu đã thay đổi. Vui lòng tải lại hoặc thử lại yêu cầu.");
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
    result = new AppError(503, "DATABASE_UPDATE_REQUIRED", "Tính năng đang chờ cập nhật dữ liệu hệ thống. Vui lòng thử lại sau.");
  } else if (error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && ["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"].includes(error.code))) {
    result = new AppError(503, "DATABASE_UNAVAILABLE", "Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại sau.");
  } else if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") result = new AppError(400, "INVALID_JSON", "JSON không hợp lệ.");
    if (error.type === "entity.too.large") result = new AppError(413, "PAYLOAD_TOO_LARGE", "Dữ liệu vượt quá kích thước cho phép.");
    if (error.type === "encoding.unsupported" || error.type === "charset.unsupported")
      result = new AppError(415, "UNSUPPORTED_ENCODING", "Định dạng dữ liệu không được hỗ trợ.");
  }
  if (result.status >= 500) {
    const cause = causeOf(error);
    log("error", "http.error", { requestId: res.locals.requestId, code: result.code, statusCode: result.status, cause });
    if (recordSystemLog) {
     try {
      void recordSystemLog({
        level: systemLogLevel(result),
        source: "API",
        message: result.message || "Lỗi nội bộ trên máy chủ",
        path: templatedPath(_req),
        statusCode: result.status,
        traceId: res.locals.requestId || null,
        details: {
          code: result.code,
          method: _req.method,
          ...(cause ? { cause } : {}),
        },
      }).catch(() => {});
     } catch { /* Logging must not replace the original HTTP error. */ }
    }
  }
  res.status(result.status).json({
    error: { code: result.code, message: result.message, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) },
    requestId: res.locals.requestId,
  });
 };
}
export const errorHandler = createErrorHandler();
