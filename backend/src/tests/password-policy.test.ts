import { describe, expect, it } from "vitest";
import { passwordSchema } from "../modules/auth/schema";

// Customer request 18/11/2026: the sign-up form asked for 12 characters; the minimum is now 8.
describe("password policy", () => {
  it("accepts 8 characters and rejects 7", () => {
    expect(passwordSchema.safeParse("abcd1234").success).toBe(true);
    expect(passwordSchema.safeParse("abc1234").success).toBe(false);
  });
  it("keeps the 72-byte bcrypt limit", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse("ă".repeat(37)).success).toBe(false); // 74 bytes UTF-8
  });
});
