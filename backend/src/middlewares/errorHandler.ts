import { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  console.error("Unhandled Error:", err);
  const status = err.statusCode || 500;
  const message = err.message || "Đã xảy ra lỗi nội bộ trên máy chủ.";

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}
