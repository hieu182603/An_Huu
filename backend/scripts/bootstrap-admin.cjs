require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
async function main() {
  const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || Buffer.byteLength(password) > 72)
    throw new Error("Bootstrap credentials are required.");
  const db = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { email: email.trim().toLowerCase(), fullName: "Administrator", role: "ADMIN", status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash } });
      await tx.auditLog.create({ data: { action: "ADMIN_BOOTSTRAP", targetType: "USER", targetId: user.id, performerId: user.id, performerName: "Bootstrap" } });
    });
    console.log("Admin created. Remove bootstrap credentials from the environment.");
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("BOOTSTRAP_FAILED: existing accounts are never overwritten."); process.exitCode = 1; });
