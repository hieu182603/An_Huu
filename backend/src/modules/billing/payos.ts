import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { log } from "../../common/logger";

/**
 * payOS payment-link API (https://payos.vn/docs/api/). Only the three calls billing needs,
 * with plain fetch + HMAC-SHA256. Keys are never logged; provider bodies are not logged either.
 */
export type CreateLinkInput = {
  orderCode: number; amount: number; description: string;
  returnUrl: string; cancelUrl: string; expiredAt: number; // unix seconds
};
export type CreatedLink = { paymentLinkId: string; checkoutUrl: string; qrCode: string; status: string };
export type LinkInfo = {
  status: string; amount: number; amountPaid: number;
  transactions: Array<{ reference: string; amount: number; transactionDateTime: string }>;
};
export interface PaymentGateway {
  createLink(input: CreateLinkInput): Promise<CreatedLink>;
  getLink(orderCode: number): Promise<LinkInfo>;
  cancelLink(orderCode: number, reason?: string): Promise<void>;
}

const hmac = (key: string, text: string) => createHmac("sha256", key).update(text).digest("hex");

/** Signature for POST /v2/payment-requests: fixed five fields in alphabetical order. */
export function signCreateLink(checksumKey: string, input: Pick<CreateLinkInput, "amount" | "cancelUrl" | "description" | "orderCode" | "returnUrl">) {
  return hmac(checksumKey, `amount=${input.amount}&cancelUrl=${input.cancelUrl}&description=${input.description}&orderCode=${input.orderCode}&returnUrl=${input.returnUrl}`);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value as object).sort().map(key => [key, sortDeep((value as Record<string, unknown>)[key])]));
  return value;
}
/** payOS webhook/response data string: keys sorted, `key=value` joined by `&`,
 * null/undefined (and the literal strings "null"/"undefined") become "", arrays/objects JSON with sorted keys. */
export function dataToSignString(data: Record<string, unknown>): string {
  return Object.keys(data).sort().map(key => {
    const value = data[key];
    let text: string;
    if (value === null || value === undefined || value === "null" || value === "undefined") text = "";
    else if (typeof value === "object") text = JSON.stringify(sortDeep(value));
    else text = String(value);
    return `${key}=${text}`;
  }).join("&");
}
export function signData(checksumKey: string, data: Record<string, unknown>) {
  return hmac(checksumKey, dataToSignString(data));
}
export function verifyDataSignature(checksumKey: string, data: Record<string, unknown>, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signData(checksumKey, data), "hex"), given = Buffer.from(signature.toLowerCase(), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const envelope = z.object({ code: z.string(), desc: z.string().optional(), data: z.unknown() }).passthrough();
const createdSchema = z.object({ paymentLinkId: z.string().min(1), checkoutUrl: z.string().url(), qrCode: z.string().min(1), status: z.string() }).passthrough();
const infoSchema = z.object({
  status: z.string(), amount: z.number().int(), amountPaid: z.number().int(),
  transactions: z.array(z.object({ reference: z.string(), amount: z.number().int(), transactionDateTime: z.string() }).passthrough()).default([]),
}).passthrough();

export type PayosConfig = { clientId: string; apiKey: string; checksumKey: string; baseUrl: string; timeoutMs: number };
export class PayosClient implements PaymentGateway {
  constructor(private readonly config: PayosConfig, private readonly fetcher: typeof fetch = fetch) {}

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(this.config.baseUrl.replace(/\/$/, "") + path, {
        method, signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: { "x-client-id": this.config.clientId, "x-api-key": this.config.apiKey, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      log("warn", "billing.payos_unreachable", { code: error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK" });
      throw new AppError(502, "PAYMENT_PROVIDER_UNAVAILABLE", "Cổng thanh toán tạm thời không phản hồi. Vui lòng thử lại.");
    }
    const parsed = envelope.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || parsed.data.code !== "00") {
      log("warn", "billing.payos_rejected", { code: parsed.success ? `PAYOS_${parsed.data.code}` : `HTTP_${response.status}` });
      throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Cổng thanh toán từ chối yêu cầu. Vui lòng thử lại sau.");
    }
    return parsed.data.data;
  }

  async createLink(input: CreateLinkInput): Promise<CreatedLink> {
    const data = await this.call("POST", "/v2/payment-requests", { ...input, signature: signCreateLink(this.config.checksumKey, input) });
    const parsed = createdSchema.safeParse(data);
    if (!parsed.success) throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Cổng thanh toán trả dữ liệu không hợp lệ.");
    return { paymentLinkId: parsed.data.paymentLinkId, checkoutUrl: parsed.data.checkoutUrl, qrCode: parsed.data.qrCode, status: parsed.data.status };
  }
  async getLink(orderCode: number): Promise<LinkInfo> {
    const parsed = infoSchema.safeParse(await this.call("GET", `/v2/payment-requests/${orderCode}`));
    if (!parsed.success) throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Cổng thanh toán trả dữ liệu không hợp lệ.");
    return { status: parsed.data.status, amount: parsed.data.amount, amountPaid: parsed.data.amountPaid,
      transactions: parsed.data.transactions.map(t => ({ reference: t.reference, amount: t.amount, transactionDateTime: t.transactionDateTime })) };
  }
  async cancelLink(orderCode: number, reason?: string): Promise<void> {
    await this.call("POST", `/v2/payment-requests/${orderCode}/cancel`, reason ? { cancellationReason: reason } : {});
  }
}
