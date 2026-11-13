// One-time bootstrap: grants investment role SYSTEM_ADMIN to an existing ACTIVE ADMIN so that
// POST /api/v1/admin/investment-roles/... can be used afterwards. Refuses when an ACTIVE ADMIN
// already holds SYSTEM_ADMIN (use the API then). Writes an audit row in the same transaction.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL is required.");
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") throw new Error("Target must be an existing ACTIVE ADMIN.");
      const existing = await tx.investmentRoleGrant.count({ where: { role: "SYSTEM_ADMIN", user: { role: "ADMIN", status: "ACTIVE" } } });
      if (existing) throw new Error("An ACTIVE SYSTEM_ADMIN already exists; grant roles through the admin API.");
      await tx.investmentRoleGrant.create({ data: { userId: user.id, role: "SYSTEM_ADMIN", grantedBy: "bootstrap" } });
      await tx.auditLog.create({ data: { action: "INVESTMENT_ROLE_GRANTED", targetType: "USER", targetId: user.id, performerId: user.id, performerName: "Bootstrap", details: { role: "SYSTEM_ADMIN", reason: "bootstrap-system-admin script" } } });
    }, { isolationLevel: "Serializable" });
    console.log("SYSTEM_ADMIN granted. Manage further investment roles via /api/v1/admin/investment-roles.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error("BOOTSTRAP_SYSTEM_ADMIN_FAILED:", error.message); process.exitCode = 1; });
