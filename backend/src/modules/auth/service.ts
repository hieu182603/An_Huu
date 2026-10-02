import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
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
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const publicUser = (u: User) => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status,
  phone: u.phone, city: u.city, avatarUrl: u.avatarUrl, revision: u.revision });
function seconds(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value)!;
  return Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]]!);
}

export class AuthService {
  constructor(private db: PrismaClient, private config: AppConfig,
    private disconnectUser: (id: string) => void = () => {}) {}
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
      expiresAt: new Date(Date.now() + 15 * 60000),
    } });
    await enqueue(tx, type === "EMAIL_VERIFICATION" ? "auth.verify_email" : "auth.reset_password", user.id,
      seal({ tokenId: record.id, to: user.email, token: raw }, this.config));
  }
  async register(input: { email: string; password: string; fullName: string }) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      await transaction(this.db, async tx => {
        const existing = await tx.user.findUnique({ where: { email: input.email } });
        // Never overwrite an existing account/password or reveal whether it exists.
        if (existing) return;
        const user = await tx.user.create({ data: { email: input.email, fullName: input.fullName, passwordHash, role: "USER", status: "PENDING_VERIFICATION" } });
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
  async login(input: { email: string; password: string; remember: boolean }) {
    const found = await this.db.user.findUnique({ where: { email: input.email } });
    // Fixed valid bcrypt hash keeps the unknown-email branch expensive too.
    const hash = found?.passwordHash ?? "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    if (!(await bcrypt.compare(input.password, hash)) || !found) throw unauthorized();
    return transaction(this.db, async tx => {
      const user = await tx.user.findUnique({ where: { id: found.id } });
      if (!user || user.passwordHash !== found.passwordHash || user.status !== "ACTIVE") throw unauthorized();
      const lifetime = input.remember ? seconds(this.config.JWT_REFRESH_EXPIRES_IN) : 24 * 3600;
      const session = await this.issueSession(tx, user, new Date(Date.now() + lifetime * 1000), undefined, input.remember);
      await tx.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
      await audit(tx, user.id, "AUTH_LOGIN", "USER", user.id);
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
}
