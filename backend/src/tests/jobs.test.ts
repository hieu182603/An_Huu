import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { memoryDb } from "./memory-db";
import { config } from "./helpers";
import { seal, unseal } from "../jobs/outbox";
import { OutboxProcessor } from "../jobs/processor";
import { createEventHandler } from "../jobs/handlers";
import { createMailSender } from "../jobs/mail";
import nodemailer from "nodemailer";

async function fixture() {
  const f = memoryDb();
  const event = await f.db.outboxEvent.create({ data: { type: "test", entityId: randomUUID(), payload: {} } });
  return { ...f, event };
}
describe("outbox and mail (offline)", () => {
  it("authenticates encrypted payloads and rejects tampering/wrong keys", () => {
    const payload = seal({ token: "secret" }, config);
    expect(unseal(payload, config)).toEqual({ token: "secret" });
    expect(() => unseal(payload, { ...config, OUTBOX_ENCRYPTION_KEY: "ab".repeat(32) })).toThrow();
    expect(() => seal({}, { ...config, OUTBOX_ENCRYPTION_KEY: undefined })).toThrow();
  });
  it("claims, completes once, deduplicates and clears sensitive payloads", async () => {
    const f = await fixture(), handle = vi.fn().mockResolvedValue(undefined);
    const worker = new OutboxProcessor(f.db, handle);
    await worker.process(f.event.id); await worker.process(f.event.id);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(f.rows("outboxEvent")[0]).toMatchObject({ status: "COMPLETED", payload: {}, lockedUntil: null });
    expect(f.rows("processedEvent")).toHaveLength(1);
  });
  it("backs off, records only a safe code and fails after five attempts", async () => {
    const f = await fixture(), worker = new OutboxProcessor(f.db, async () => { throw new Error("token=private"); });
    await worker.process(f.event.id);
    expect(f.rows("outboxEvent")[0]).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "DELIVERY_FAILED" });
    expect(f.rows("outboxEvent")[0].availableAt.getTime()).toBeGreaterThan(Date.now());
    f.rows("outboxEvent")[0].availableAt = new Date(0); f.rows("outboxEvent")[0].attempts = 4;
    await worker.process(f.event.id);
    expect(f.rows("outboxEvent")[0].status).toBe("FAILED");
    expect(JSON.stringify(f.rows("outboxEvent"))).not.toContain("private");
  });
  it("recovers expired leases and skips already-processed side effects", async () => {
    const f = await fixture(), handle = vi.fn();
    Object.assign(f.rows("outboxEvent")[0], { status: "PROCESSING", lockedUntil: new Date(0) });
    await f.db.processedEvent.create({ data: { eventId: f.event.id } });
    await new OutboxProcessor(f.db, handle).process(f.event.id);
    expect(handle).not.toHaveBeenCalled();
    expect(f.rows("outboxEvent")[0].status).toBe("COMPLETED");
  });
  it("checks current token state before mail and supplies a stable idempotency key", async () => {
    const f = memoryDb(), send = vi.fn().mockResolvedValue(undefined);
    const user = await f.db.user.create({ data: { email: "user@example.test", fullName: "User", passwordHash: "test", status: "PENDING_VERIFICATION" } });
    const token = await f.db.verificationToken.create({ data: { userId: user.id, tokenHash: "test", type: "EMAIL_VERIFICATION", expiresAt: new Date(Date.now() + 60000) } });
    const event = await f.db.outboxEvent.create({ data: { type: "auth.verify_email", entityId: user.id, payload: seal({ tokenId: token.id, to: user.email, token: "123456" }, config) } });
    const handler = createEventHandler(f.db, config, send);
    await handler(event);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: event.id, to: user.email }));
    f.rows("verificationToken")[0].consumedAt = new Date();
    await handler(event);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("uses bounded provider requests without leaking provider error details", async () => {
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error("secret SMTP error"), { code: "EAUTH" }));
    const mock = vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    try {
      const send = createMailSender({ host: "smtp.example.test", port: 465, secure: true, user: "sender@example.test", pass: "fixture", from: { name: "An Hưu", address: "sender@example.test" } });
      await expect(send({ to: "u@example.test", text: "hello", html: "<p>hello</p>", subject: "hello", idempotencyKey: "job-id" })).rejects.toMatchObject({ message: "EMAIL_DELIVERY_FAILED", code: "EMAIL_CREDENTIALS_INVALID" });
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ connectionTimeout: 10000, socketTimeout: 15000, logger: false, debug: false }));
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: "<p>hello</p>", text: "hello", messageId: expect.stringMatching(/^<[a-f0-9]{64}@example\.test>$/) }));
    } finally { mock.mockRestore(); }
  });
});
