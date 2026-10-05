import { z } from "zod";
import type { AppConfig } from "../../config/env";
import { explanationInstructions, type ExplanationPacket, type ExplanationProvider } from "./provider";

const selection = z.object({ factKeys: z.array(z.string()).min(1).max(6), citationIds: z.array(z.string()).max(4) }).strict();
// Never expose upstream error bodies: they may contain prompts or credentials.
export class GeminiProviderError extends Error {
  constructor(readonly code: string, readonly status?: number) { super(code); this.name = "GeminiProviderError"; }
}
export class GeminiProvider implements ExplanationProvider {
  readonly name = "gemini";
  private readonly endpoint: string;
  constructor(private readonly key: string, private readonly model: string, mode: "developer" | "vertex-express", private readonly request: typeof fetch = fetch) {
    if (!/^gemini-[a-z0-9.-]+$/.test(model) || !key.trim()) throw new GeminiProviderError("GEMINI_CONFIG_INVALID");
    this.endpoint = mode === "vertex-express"
      ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }
  async select(packet: ExplanationPacket, signal: AbortSignal) {
    try {
      const response = await this.request(this.endpoint, {
        method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: explanationInstructions }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(packet) }] }],
          generationConfig: {
            temperature: 0, candidateCount: 1, maxOutputTokens: 2048, responseMimeType: "application/json",
            ...(/^gemini-2\.5-flash(-lite)?$/.test(this.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            responseSchema: { type: "OBJECT", required: ["factKeys", "citationIds"], properties: {
              factKeys: { type: "ARRAY", minItems: 1, maxItems: 6, items: { type: "STRING", enum: packet.facts.map(f => f.key) } },
              citationIds: { type: "ARRAY", maxItems: packet.knowledge.length ? 4 : 0, items: { type: "STRING", ...(packet.knowledge.length ? { enum: packet.knowledge.map(k => k.id) } : {}) } },
            } },
          },
        }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new GeminiProviderError("GEMINI_HTTP_ERROR", response.status); }
      // Bound the response independently of the output-token setting.
      const reader = response.body?.getReader();
      if (!reader) throw new GeminiProviderError("GEMINI_EMPTY_RESPONSE");
      let text = "", size = 0; const decoder = new TextDecoder();
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
        if (size > 65536) { await reader.cancel(); throw new GeminiProviderError("GEMINI_RESPONSE_TOO_LARGE"); }
        text += decoder.decode(chunk.value, { stream: true });
      } text += decoder.decode(); } finally { reader.releaseLock(); }
      const body = JSON.parse(text), candidate = body.candidates?.[0];
      if (body.promptFeedback?.blockReason || candidate?.finishReason !== "STOP") throw new GeminiProviderError("GEMINI_INCOMPLETE_RESPONSE");
      const parts = candidate.content?.parts;
      if (!Array.isArray(parts) || parts.some((p: { functionCall?: unknown }) => p.functionCall)) throw new GeminiProviderError("GEMINI_INVALID_RESPONSE");
      const result = selection.parse(JSON.parse(parts.filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === "string").map((p: { text: string }) => p.text).join("")));
      if (result.factKeys.some(k => !packet.facts.some(f => f.key === k)) || result.citationIds.some(k => !packet.knowledge.some(s => s.id === k)))
        throw new GeminiProviderError("GEMINI_INVALID_SELECTION");
      return result;
    } catch (error) {
      if (error instanceof GeminiProviderError) throw error;
      throw new GeminiProviderError(signal.aborted ? "GEMINI_ABORTED" : "GEMINI_REQUEST_FAILED");
    }
  }
}
export function createExplanationProvider(config: AppConfig): ExplanationProvider | null {
  return config.AI_PROVIDER === "gemini" ? new GeminiProvider(config.GEMINI_API_KEY!, config.GEMINI_MODEL, config.GEMINI_API_MODE) : null;
}
