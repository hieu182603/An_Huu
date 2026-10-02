import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Không tìm thấy token xác thực." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_dev_secret") as TokenPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
  }
}

export function requireRole(role: "USER" | "ADMIN") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Yêu cầu đăng nhập." });
      return;
    }
    if (req.user.role !== role && req.user.role !== "ADMIN") {
      res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này." });
      return;
    }
    next();
  };
}
