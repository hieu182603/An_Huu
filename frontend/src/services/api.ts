export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string[]>;
  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
const baseUrl = ((typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) || "/api/v1").replace(/\/$/, "");
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let refreshPromise: Promise<Session> | null = null;
export type ApiUser = { id: string; email: string; fullName: string; role: "USER" | "ADMIN"; status: string; phone: string | null; city: string | null; avatarUrl: string | null; revision: number; emailVerifiedAt?: string | null };
export type Session = { accessToken: string; user: ApiUser };
export function clearAccessToken() { accessToken = null; accessTokenExpiresAt = 0; invalidateApiCache(); }
export function getAccessToken(): string | null { return accessToken; }
export function sessionRefreshDelay(): number | null {
  return accessToken ? Math.max(0, accessTokenExpiresAt - Date.now() - 60000) : null;
}
function acceptAccessToken(token: string) {
  accessToken = token;
  // exp is used only to schedule refresh. Authorization remains server-side.
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    accessTokenExpiresAt = typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : Date.now() + 60000;
  } catch { accessTokenExpiresAt = Date.now() + 60000; }
}
async function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return action();
  try {
    return await navigator.locks.request("anhuu-auth-cookie", { signal: AbortSignal.timeout(20000) }, action);
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new ApiError(0, "SESSION_BUSY", "Một tab khác đang cập nhật phiên đăng nhập. Vui lòng thử lại.");
    }
    throw error;
  }
}
export async function apiRequest<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", extraHeaders: Record<string, string> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method, credentials: "include", signal: AbortSignal.timeout(20000),
      headers: { ...extraHeaders, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), "X-CSRF-Protection": "1", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch { throw new ApiError(0, "NETWORK_ERROR", "Không thể kết nối máy chủ. Vui lòng thử lại."); }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const fields: Record<string, string> = { fullName: "họ tên", phone: "điện thoại", city: "tỉnh/thành phố", email: "email", password: "mật khẩu", currentPassword: "mật khẩu hiện tại", title: "tiêu đề", slug: "đường dẫn ngắn", excerpt: "mô tả ngắn", content: "nội dung", category: "chủ đề", authorName: "tác giả", thumbnail: "đường dẫn ảnh HTTPS", subject: "tiêu đề yêu cầu", message: "nội dung tin nhắn", details: "nhu cầu cụ thể", topic: "chủ đề tư vấn", reason: "lý do thay đổi", notes: "ghi chú", preferredTime: "thời gian mong muốn", otp: "mã OTP" };
    const invalid = Object.keys(result?.error?.fieldErrors || {}).map(path => fields[path.split(".").pop() || ""]).filter(Boolean);
    const hint = invalid.length ? ` Kiểm tra: ${[...new Set(invalid)].join(", ")}.` : "";
    throw new ApiError(response.status, result?.error?.code || "REQUEST_FAILED", (result?.error?.message || "Yêu cầu chưa thành công. Vui lòng thử lại.") + hint, result?.error?.fieldErrors);
  }
  if (!result || !("data" in result)) throw new ApiError(502, "INVALID_RESPONSE", "Máy chủ trả về dữ liệu không hợp lệ.");
  return result.data as T;
}
export async function startSession(path: string, body: unknown) {
  return withSessionLock(async () => {
    const session = await apiRequest<Session>(path, body);
    acceptAccessToken(session.accessToken);
    window.dispatchEvent(new CustomEvent("anhuu:session-updated", { detail: session.user }));
    return session;
  });
}
export async function endSession() {
  await withSessionLock(async () => {
    try { await apiRequest("/auth/logout", {}); }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; }
    clearAccessToken();
  });
}
// Serialize cookie rotation across tabs; StrictMode shares the in-flight request.
export function refreshSession(): Promise<Session> {
  if (!refreshPromise) {
    refreshPromise = startSession("/auth/refresh", {}).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
export async function ensureFreshSession() {
  const delay = sessionRefreshDelay();
  if (delay === null || delay > 0) return;
  try { await refreshSession(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAccessToken(); window.dispatchEvent(new Event("anhuu:session-expired"));
    }
    throw error;
  }
}
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const apiGetCache = new Map<string, CacheEntry<unknown>>();
const inflightGetRequests = new Map<string, Promise<unknown>>();

export function invalidateApiCache(filter?: string | RegExp) {
  if (!filter) {
    apiGetCache.clear();
    return;
  }
  for (const key of apiGetCache.keys()) {
    if (typeof filter === "string" ? key.includes(filter) : filter.test(key)) {
      apiGetCache.delete(key);
    }
  }
}


export async function authenticatedRequest<T>(
  path: string,
  body?: unknown,
  method?: string,
  extraHeaders?: Record<string, string>,
  options?: { skipCache?: boolean; ttlMs?: number }
): Promise<T> {
  const isGet = (method === undefined || method.toUpperCase() === "GET") && body === undefined;
  const ttlMs = options?.ttlMs ?? 45000;
  const cacheKey = `${path}|${JSON.stringify(extraHeaders || {})}`;

  if (isGet && !options?.skipCache) {
    const cached = apiGetCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }
    const inflight = inflightGetRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const exec = async (): Promise<T> => {
    await ensureFreshSession();
    const sentToken = accessToken;
    let res: T;
    try {
      res = await apiRequest<T>(path, body, method, extraHeaders);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      try {
        if (!accessToken || accessToken === sentToken) await refreshSession();
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 401) {
          clearAccessToken();
          window.dispatchEvent(new Event("anhuu:session-expired"));
        }
        throw refreshError;
      }
      res = await apiRequest<T>(path, body, method, extraHeaders);
    }

    if (isGet) {
      apiGetCache.set(cacheKey, { data: res, expiresAt: Date.now() + ttlMs });
    } else {
      const isReadOnlyPost =
        method?.toUpperCase() === "POST" &&
        (path.includes("/preview") || path.includes("/simulate") || path.includes("/compare"));
      if (!isReadOnlyPost) {
        invalidateApiCache();
      }
    }
    return res;
  };

  if (isGet && !options?.skipCache) {
    const promise = exec().finally(() => {
      inflightGetRequests.delete(cacheKey);
    });
    inflightGetRequests.set(cacheKey, promise);
    return promise;
  }

  return exec();
}
export async function authenticatedBlobRequest(path: string): Promise<{ blob: Blob; filename: string | null }> {
  await ensureFreshSession();
  const sentToken = accessToken;
  const doFetch = async () => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        credentials: "include",
        signal: AbortSignal.timeout(20000),
        headers: {
          "X-CSRF-Protection": "1",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "Không thể kết nối máy chủ. Vui lòng thử lại.");
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new ApiError(response.status, result?.error?.code || "DOWNLOAD_FAILED", result?.error?.message || "Không thể tải tệp tin.");
    }
    const disposition = response.headers.get("Content-Disposition");
    let filename: string | null = null;
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
      if (match) filename = match[1];
    }
    const blob = await response.blob();
    return { blob, filename };
  };

  try {
    return await doFetch();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      if (!accessToken || accessToken === sentToken) await refreshSession();
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        clearAccessToken();
        window.dispatchEvent(new Event("anhuu:session-expired"));
      }
      throw refreshError;
    }
    return doFetch();
  }
}
export function validPassword(password: string) {
  return password.length >= 12 && new TextEncoder().encode(password).length <= 72;
}
export function updateSessionUser(user: ApiUser) {
  window.dispatchEvent(new CustomEvent("anhuu:session-updated", { detail: user }));
}
export function forgetSession() {
  clearAccessToken(); window.dispatchEvent(new Event("anhuu:session-expired"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("anhuu-auth"); channel.postMessage("logout"); channel.close();
  }
}
