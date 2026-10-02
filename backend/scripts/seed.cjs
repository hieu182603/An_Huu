require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production.");
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Seed is allowed only on a local development database.");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password) > 72) throw new Error("Set SEED_PASSWORD (12 characters, at most 72 UTF-8 bytes).");
  const db = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    for (const role of ["USER", "ADMIN"]) await db.user.upsert({
      where: { email: role.toLowerCase() + "@anhuu.test" }, update: {},
      create: { email: role.toLowerCase() + "@anhuu.test", fullName: "Local " + role, role, status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash },
    });
    console.log("Local fixtures ready. Existing accounts were not changed.");
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("SEED_FAILED: check local configuration; no credentials are logged."); process.exitCode = 1; });
