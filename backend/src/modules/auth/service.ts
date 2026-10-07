import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client, type TokenPayload as GoogleTokenPayload } from "google-auth-library";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Prisma, type PrismaClient, type User, type TokenType } from "@prisma/client";
import type { AppConfig } from "../../config/env";
import type { TokenPayload } from "../../middlewares/authMiddleware";
import { AppError } from "../../common/errors";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";
import { enqueue, seal } from "../../jobs/outbox";

const unauthorized = () => new AppError(401, "UNAUTHENTICATED", "Thông tin xác thực không hợp lệ hoặc đã hết hạn.");
const invalidCode = () => new AppError(400, "INVALID_TOKEN", "Mã xác thực không hợp lệ hoặc đã hết hạn.");
const googleClient = new OAuth2Client();
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const publicUser = (u: User) => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status,
  phone: u.phone, city: u.city, avatarUrl: u.avatarUrl, revision: u.revision, emailVerifiedAt: u.emailVerifiedAt });
function seconds(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value)!;
  return Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]]!);
}

import type { SystemSettingsService } from "../settings/service";

export class AuthService {
  constructor(private db: PrismaClient, private config: AppConfig,
    private disconnectUser: (id: string) => void = () => {},
    private settings?: SystemSettingsService) {}
  private otpHash(userId: string, otp: string, id: string) {
    return createHmac("sha256", this.config.JWT_REFRESH_SECRET).update("verify:" + userId + ":" + id + ":" + otp).digest("hex");
  }
  private async issueVerification(tx: Prisma.TransactionClient, user: User, type: TokenType) {
    const latest = await tx.verificationToken.findFirst({ where: { userId: user.id, type }, orderBy: { createdAt: "desc" } });
    if (latest && latest.createdAt.getTime() > Date.now() - 60000) return;
    const raw = type === "EMAIL_VERIFICATION" ? String(randomInt(0, 1000000)).padStart(6, "0") : randomBytes(32).toString("base64url");
    await tx.verificationToken.updateMany({ where: { userId: user.id, type, consumedAt: null }, data: { consumedAt: new Date() } });
    const id = randomUUID();
    const record = await tx.verificationToken.create({ data: {
      id, userId: user.id, type, tokenHash: type === "EMAIL_VERIFICATION" ? this.otpHash(user.id, raw, id) : tokenHash(raw),
      expiresAt: new Date(Date.now() + (type === "EMAIL_VERIFICATION" ? 3 : 15) * 60000),
    } });
    await enqueue(tx, type === "EMAIL_VERIFICATION" ? "auth.verify_email" : "auth.reset_password", user.id,
      seal({ tokenId: record.id, to: user.email, token: raw }, this.config));
  }
  async register(input: { email: string; password: string; fullName: string; phone?: string }) {
    await this.checkPasswordPolicy(input.password);
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      await transaction(this.db, async tx => {
        const existing = await tx.user.findUnique({ where: { email: input.email } });
        // Never overwrite an existing account/password or reveal whether it exists.
        if (existing) return;
        const user = await tx.user.create({ data: { email: input.email, fullName: input.fullName, phone: input.phone, passwordHash, role: "USER", status: "PENDING_VERIFICATION" } });
        await this.issueVerification(tx, user, "EMAIL_VERIFICATION");
        await audit(tx, user.id, "AUTH_REGISTER", "USER", user.id);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    return { status: "ACCEPTED", message: "Nếu yêu cầu hợp lệ, hướng dẫn xác minh sẽ được gửi qua email." };
  }
  async requestEmail(email: string, type: TokenType) {
    await transaction(this.db, async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.status === "SUSPENDED" || (type === "EMAIL_VERIFICATION" && user.status !== "PENDING_VERIFICATION")) return;
      await this.issueVerification(tx, user, type);
    });
    return { status: "ACCEPTED", message: "Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi qua email." };
  }
  async verifyEmail(email: string, otp: string) {
    const success = await transaction(this.db, async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.status !== "PENDING_VERIFICATION") return false;
      const record = await tx.verificationToken.findFirst({ where: { userId: user.id, type: "EMAIL_VERIFICATION" }, orderBy: { createdAt: "desc" } });
      if (!record || record.consumedAt || record.expiresAt <= new Date() || record.attempts >= 5) return false;
      await tx.verificationToken.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const expected = Buffer.from(this.otpHash(user.id, otp, record.id), "hex");
      const actual = Buffer.from(record.tokenHash, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
      await tx.verificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { status: "ACTIVE", emailVerifiedAt: new Date() } });
      await audit(tx, user.id, "AUTH_VERIFY_EMAIL", "USER", user.id);
      return true;
    });
    if (!success) throw invalidCode();
    return { verified: true };
  }
  private async issueSession(tx: Prisma.TransactionClient, user: User, expiresAt: Date, familyId: string = randomUUID(), persistent = false) {
    const refreshToken = randomBytes(32).toString("base64url");
    await tx.refreshToken.create({ data: { userId: user.id, tokenHash: tokenHash(refreshToken), familyId,
      securityVersion: user.securityVersion, expiresAt, persistent } });
    const accessToken = jwt.sign({ userId: user.id, email: user.email, role: user.role,
      securityVersion: user.securityVersion, sessionId: familyId }, this.config.JWT_SECRET, {
      algorithm: "HS256", issuer: this.config.JWT_ISSUER, audience: this.config.JWT_AUDIENCE,
      expiresIn: this.config.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    });
    return { accessToken, refreshToken, expiresAt, persistent, user: publicUser(user) };
  }
  private async checkPasswordPolicy(password: string) {
    if (!this.settings) return;
    const s = await this.settings.getSecuritySettings().catch(() => null);
    if (!s) return;
    if (password.length < s.passwordMinLength) {
      throw new AppError(400, "PASSWORD_TOO_SHORT", `Mật khẩu phải có tối thiểu ${s.passwordMinLength} ký tự.`);
    }
    if (s.passwordRequireUppercase && !/[A-Z]/.test(password)) {
      throw new AppError(400, "PASSWORD_REQUIRES_UPPERCASE", "Mật khẩu phải chứa ít nhất 1 ký tự viết hoa.");
    }
    if (s.passwordRequireLowercase && !/[a-z]/.test(password)) {
      throw new AppError(400, "PASSWORD_REQUIRES_LOWERCASE", "Mật khẩu phải chứa ít nhất 1 ký tự viết thường.");
    }
    if (s.passwordRequireNumber && !/\d/.test(password)) {
      throw new AppError(400, "PASSWORD_REQUIRES_NUMBER", "Mật khẩu phải chứa ít nhất 1 chữ số.");
    }
    if (s.passwordRequireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      throw new AppError(400, "PASSWORD_REQUIRES_SPECIAL", "Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.");
    }
  }

  async login(input: { email: string; password: string; remember: boolean }, meta?: { ipAddress?: string; userAgent?: string }) {
    const emailNorm = input.email.toLowerCase().trim();
    if (this.settings) {
      const secSettings = await this.settings.getSecuritySettings().catch(() => null);
      const maxAttempts = secSettings?.maxLoginAttempts ?? 5;
      const lockMinutes = secSettings?.accountLockMinutes ?? 15;
      const lockWindow = new Date(Date.now() - lockMinutes * 60000);
      const recentFails = await this.db.loginLog.count({
        where: {
          identifier: emailNorm,
          status: "FAILED",
          createdAt: { gte: lockWindow },
        },
      }).catch(() => 0);
      if (recentFails >= maxAttempts) {
        await this.settings.recordLoginLog({
          identifier: emailNorm,
          status: "LOCKED",
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          failureReason: `Tài khoản tạm thời bị khóa do sai quá ${maxAttempts} lần.`,
        });
        throw new AppError(423, "ACCOUNT_LOCKED", `Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá ${maxAttempts} lần. Vui lòng thử lại sau ${lockMinutes} phút.`);
      }
    }

    const found = await this.db.user.findUnique({ where: { email: input.email } });
    // Fixed valid bcrypt hash keeps the unknown-email branch expensive too.
    const hash = found?.passwordHash ?? "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    const passwordMatch = await bcrypt.compare(input.password, hash);
    if (!passwordMatch || !found) {
      if (this.settings) {
        await this.settings.recordLoginLog({
          userId: found?.id ?? null,
          identifier: emailNorm,
          status: "FAILED",
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          failureReason: "Thông tin xác thực không chính xác.",
        });
      }
      throw unauthorized();
    }

    return transaction(this.db, async tx => {
      const user = await tx.user.findUnique({ where: { id: found.id } });
      if (!user || user.passwordHash !== found.passwordHash) {
        if (this.settings) {
          await this.settings.recordLoginLog({
            userId: found.id,
            identifier: emailNorm,
            status: "FAILED",
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
            failureReason: "Thông tin xác thực không chính xác.",
          });
        }
        throw unauthorized();
      }
      if (user.status === "PENDING_VERIFICATION") {
        if (this.settings) {
          await this.settings.recordLoginLog({
            userId: user.id,
            identifier: emailNorm,
            status: "FAILED",
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
            failureReason: "Chưa xác minh email",
          });
        }
        throw new AppError(403, "EMAIL_NOT_VERIFIED", "Bạn cần xác minh email trước khi đăng nhập. Hãy mở trang xác minh để nhập hoặc gửi lại mã OTP.");
      }
      if (user.status !== "ACTIVE") {
        if (this.settings) {
          await this.settings.recordLoginLog({
            userId: user.id,
            identifier: emailNorm,
            status: "LOCKED",
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
            failureReason: "Tài khoản bị tạm ngưng",
          });
        }
        throw unauthorized();
      }
      const lifetime = input.remember ? seconds(this.config.JWT_REFRESH_EXPIRES_IN) : 24 * 3600;
      const session = await this.issueSession(tx, user, new Date(Date.now() + lifetime * 1000), undefined, input.remember);
      await tx.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
      await audit(tx, user.id, "AUTH_LOGIN", "USER", user.id, undefined, { ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });
      if (this.settings) {
        await this.settings.recordLoginLog({
          userId: user.id,
          identifier: emailNorm,
          status: "SUCCESS",
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        });
      }
      return { ...session, remember: input.remember };
    });
  }
  async refresh(raw: string) {
    const result = await transaction(this.db, async tx => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash: tokenHash(raw) }, include: { user: true } });
      if (!record) return { invalid: true } as const;
      if (record.usedAt) {
        await tx.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        await audit(tx, record.userId, "AUTH_REFRESH_REUSE", "USER", record.userId);
        return { invalid: true, disconnect: record.userId } as const;
      }
      if (record.revokedAt || record.expiresAt <= new Date() || record.user.status !== "ACTIVE" ||
          record.securityVersion !== record.user.securityVersion) return { invalid: true } as const;
      await tx.refreshToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      return this.issueSession(tx, record.user, record.expiresAt, record.familyId, record.persistent);
    });
    if ("invalid" in result) {
      if ("disconnect" in result && result.disconnect) this.disconnectUser(result.disconnect);
      throw unauthorized();
    }
    return result;
  }
  async logout(raw: string) {
    const userId = await transaction(this.db, async tx => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash: tokenHash(raw) } });
      if (!record) return null;
      await tx.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, record.userId, "AUTH_LOGOUT", "USER", record.userId);
      return record.userId;
    });
    if (userId) this.disconnectUser(userId);
    return { loggedOut: true };
  }
  async logoutAll(userId: string) {
    await transaction(this.db, async tx => {
      await tx.user.update({ where: { id: userId }, data: { securityVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, userId, "AUTH_LOGOUT_ALL", "USER", userId);
      await enqueue(tx, "security.sessions_revoked", userId, { userId });
    });
    this.disconnectUser(userId);
    return { loggedOut: true };
  }
  async resetPassword(raw: string, password: string) {
    await this.checkPasswordPolicy(password);
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await transaction(this.db, async tx => {
      const record = await tx.verificationToken.findUnique({ where: { tokenHash: tokenHash(raw) }, include: { user: true } });
      if (!record || record.type !== "PASSWORD_RESET" || record.consumedAt || record.expiresAt <= new Date() || record.user.status === "SUSPENDED") return null;
      await tx.verificationToken.updateMany({ where: { userId: record.userId, type: "PASSWORD_RESET", consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, securityVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, record.userId, "AUTH_RESET_PASSWORD", "USER", record.userId);
      await enqueue(tx, "security.sessions_revoked", record.userId, { userId: record.userId });
      return record.userId;
    });
    if (!userId) throw invalidCode();
    this.disconnectUser(userId);
    return { changed: true };
  }
  async changePassword(userId: string, currentPassword: string, password: string) {
    const found = await this.db.user.findUnique({ where: { id: userId } });
    if (!found || found.status !== "ACTIVE") throw unauthorized();
    if (!(await bcrypt.compare(currentPassword, found.passwordHash)))
      throw new AppError(400, "INCORRECT_PASSWORD", "Mật khẩu hiện tại không đúng.");
    await this.checkPasswordPolicy(password);
    const passwordHash = await bcrypt.hash(password, 12);
    await transaction(this.db, async tx => {
      const updated = await tx.user.updateMany({ where: { id: userId, passwordHash: found.passwordHash, securityVersion: found.securityVersion, status: "ACTIVE" },
        data: { passwordHash, securityVersion: { increment: 1 } } });
      if (!updated.count) throw new AppError(409, "ACCOUNT_CHANGED", "Tài khoản đã thay đổi. Vui lòng đăng nhập lại.");
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.verificationToken.updateMany({ where: { userId, type: "PASSWORD_RESET", consumedAt: null }, data: { consumedAt: new Date() } });
      await audit(tx, userId, "AUTH_CHANGE_PASSWORD", "USER", userId);
      await enqueue(tx, "notification.password_changed", userId, {});
      await enqueue(tx, "security.sessions_revoked", userId, { userId });
    });
    this.disconnectUser(userId);
    return { changed: true };
  }
  async validateSession(claims: TokenPayload) {
    if (!claims.sessionId) throw unauthorized();
    const user = await this.db.user.findUnique({ where: { id: claims.userId } });
    if (!user || user.status !== "ACTIVE" || user.role !== claims.role || user.securityVersion !== claims.securityVersion) throw unauthorized();
    const session = await this.db.refreshToken.findFirst({ where: {
      userId: user.id, familyId: claims.sessionId, usedAt: null, revokedAt: null,
      expiresAt: { gt: new Date() }, securityVersion: user.securityVersion,
    } });
    if (!session) throw unauthorized();
    return publicUser(user);
  }
  async googleLogin(credential: string) {
    if (!this.config.GOOGLE_CLIENT_ID) throw new AppError(503, "GOOGLE_NOT_CONFIGURED", "Đăng nhập Google chưa được cấu hình.");
    let payload: GoogleTokenPayload | undefined;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: this.config.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch { throw unauthorized(); }
    if (!payload?.email || !payload.sub || payload.email_verified !== true) throw unauthorized();
    // Only automatically link emails for which Google is authoritative.
    if (!payload.email.toLowerCase().endsWith("@gmail.com") && !payload.hd)
      throw new AppError(403, "EMAIL_LOGIN_REQUIRED", "Vui lòng đăng nhập bằng email và mật khẩu cho địa chỉ này.");

    const email = payload.email.trim().toLowerCase();
    const fullName = (payload.name || email.split("@")[0]).slice(0, 120);
    const avatarUrl = payload.picture ? String(payload.picture).slice(0, 1000) : null;

    return transaction(this.db, async tx => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        const randomPass = randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randomPass, 12);
        user = await tx.user.create({
          data: {
            email,
            fullName,
            avatarUrl,
            passwordHash,
            role: "USER",
            status: "ACTIVE",
            emailVerifiedAt: new Date(),
          },
        });
        await audit(tx, user.id, "AUTH_REGISTER_GOOGLE", "USER", user.id);
      } else {
        if (user.status === "SUSPENDED") throw new AppError(403, "SUSPENDED", "Tài khoản của bạn đã bị khóa.");
        if (user.status === "PENDING_VERIFICATION") {
          // Discard a password supplied before ownership of this email was proven.
          const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
          user = await tx.user.update({
            where: { id: user.id },
            data: { status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash, ...(avatarUrl && !user.avatarUrl ? { avatarUrl } : {}) },
          });
        }
      }

      const lifetime = seconds(this.config.JWT_REFRESH_EXPIRES_IN);
      const session = await this.issueSession(tx, user, new Date(Date.now() + lifetime * 1000), undefined, true);
      await tx.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
      await audit(tx, user.id, "AUTH_LOGIN_GOOGLE", "USER", user.id);
      return { ...session, remember: true };
    });
  }
}
