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
let sessionUserId: string | null = null;
let sessionGeneration = 0;
export type ApiUser = { id: string; email: string; fullName: string; role: "USER" | "ADMIN"; status: string; phone: string | null; city: string | null; avatarUrl: string | null; revision: number; emailVerifiedAt?: string | null };
export type Session = { accessToken: string; user: ApiUser };
export function clearAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  sessionUserId = null;
  ++sessionGeneration;
  invalidateApiCache();
  inflightGetRequests.clear();
}
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
export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
export async function apiRequest<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", extraHeaders: Record<string, string> = {}, signal?: AbortSignal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method, credentials: "include", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      headers: { ...extraHeaders, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), "X-CSRF-Protection": "1", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch { throw new ApiError(0, "NETWORK_ERROR", "Không thể kết nối máy chủ. Vui lòng thử lại."); }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (result?.error?.code === "ADVISORY_FEE_REFORECAST_REVIEW_REQUIRED") {
      throw new ApiError(response.status, result.error.code, "Kế hoạch có phí tư vấn chưa hỗ trợ tính lại từ số dư thực tế. Hãy tạo bản xem trước mới từ hồ sơ và giữ khoản phí đã chọn; không bỏ phí để vượt kiểm tra.");
    }
    const fields: Record<string, string> = { fullName: "họ tên", phone: "điện thoại", city: "tỉnh/thành phố", email: "email", password: "mật khẩu", currentPassword: "mật khẩu hiện tại", title: "tiêu đề", slug: "đường dẫn ngắn", excerpt: "mô tả ngắn", content: "nội dung", category: "chủ đề", authorName: "tác giả", thumbnail: "đường dẫn ảnh HTTPS", subject: "tiêu đề yêu cầu", message: "nội dung tin nhắn", details: "nhu cầu cụ thể", topic: "chủ đề tư vấn", reason: "lý do thay đổi", notes: "ghi chú", preferredTime: "thời gian mong muốn", otp: "mã OTP" };
    Object.assign(fields, { amountVnd: "mức lỗ bằng tiền", percent: "tỷ lệ", lossTolerance: "khả năng chịu lỗ", incomeStability: "độ ổn định thu nhập", employerConcentration: "mức phụ thuộc nơi làm việc", liquidityNeeds: "nhu cầu tiền lũy kế", y1: "tiền cần trong 1 năm", y3: "tiền cần trong 3 năm", y5: "tiền cần trong 5 năm", goals: "mục tiêu", amountToday: "tiền theo giá hôm nay", dueMonth: "tháng cần tiền", priority: "ưu tiên", deferrable: "khả năng hoãn", costBasis: "giá vốn", annualPercent: "phí tư vấn năm", paidFrom: "nguồn trả phí", rows: "chuỗi dữ liệu theo tháng", sources: "nguồn và giấy phép", data: "nội dung tài liệu" });
    const invalid = Object.keys(result?.error?.fieldErrors || {}).map(path => fields[path.split(".").pop() || ""]).filter(Boolean);
    const hint = invalid.length ? ` Kiểm tra: ${[...new Set(invalid)].join(", ")}.` : "";
    const planningDetails = /financial-profile|onboarding|market-data|retirement/.test(path)
      ? Object.entries(result?.error?.fieldErrors || {}).map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join("; ") : String(messages)}`).join(" · ") : "";
    throw new ApiError(response.status, result?.error?.code || "REQUEST_FAILED", (result?.error?.message || "Yêu cầu chưa thành công. Vui lòng thử lại.") + hint + (planningDetails ? ` ${planningDetails}` : ""), result?.error?.fieldErrors);
  }
  if (!result || !("data" in result)) throw new ApiError(502, "INVALID_RESPONSE", "Máy chủ trả về dữ liệu không hợp lệ.");
  return result.data as T;
}
export async function startSession(path: string, body: unknown) {
  return withSessionLock(async () => {
    const session = await apiRequest<Session>(path, body);
    if (sessionUserId !== session.user.id) {
      sessionUserId = session.user.id;
      ++sessionGeneration;
      invalidateApiCache();
      inflightGetRequests.clear();
    }
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
// Which cached GET paths a successful request can make stale.
// [] = nothing (read-only POST), null = clear everything (unknown or global
// writes). A trailing "$" means that exact path only, e.g. "/me$" must not
// clear "/me/notifications".
const READ_ONLY_POST = /\/(preview|simulate|compare|metric)$/;
const RULES: Array<[RegExp, string[]]> = [
  [/^\/me\/notifications(\/|$)/, ["/me/notifications"]],
  [/^\/me\/notification-settings$/, ["/me/notification-settings"]],
  [/^\/me\/saved-articles(\/|$)/, ["/me/saved-articles", "/me/saved-content", "/content"]],
  [/^\/me\/support(\/|$)/, ["/me/support"]],
  [/^\/me\/ai(\/|$)/, ["/me/ai"]],
  // Profile changes mark plans stale and change AI/plan context.
  [/^\/me\/(financial-profile|onboarding-draft|onboarding)(\/|$)/, ["/me/financial-profile", "/me/onboarding-draft", "/me/retirement", "/me/ai", "/me/pension"]],
  [/^\/me\/retirement(\/|$)/, ["/me/retirement", "/me/ai"]],
  [/^\/me\/pension(\/|$)/, ["/me/pension", "/me/retirement"]],
  [/^\/me(\/avatar)?$/, ["/me$", "/auth/me"]],
];
export function cacheInvalidationScope(method: string, path: string): string[] | null {
  const pathname = path.split("?")[0];
  if (method.toUpperCase() === "POST" && READ_ONLY_POST.test(pathname)) return [];
  const rule = RULES.find(([pattern]) => pattern.test(pathname));
  return rule ? rule[1] : null;
}
/** Cache keys are `${path}|${headers}`; match on path segment boundaries. */
export function cacheKeyInScope(key: string, scope: string): boolean {
  const path = key.slice(0, key.indexOf("|") < 0 ? key.length : key.indexOf("|"));
  if (scope.endsWith("$")) return path.split("?")[0] === scope.slice(0, -1);
  return path === scope || path.startsWith(scope + "/") || path.startsWith(scope + "?");
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
  // timeoutMs: only for requests the server is known to need longer for.
  options?: { skipCache?: boolean; ttlMs?: number; signal?: AbortSignal; timeoutMs?: number }
): Promise<T> {
  const isGet = (method === undefined || method.toUpperCase() === "GET") && body === undefined;
  const ttlMs = options?.ttlMs ?? 45000;
  const cacheKey = `${path}|${JSON.stringify(extraHeaders || {})}`;
  const requestSession = sessionGeneration;
  const assertCurrentSession = () => {
    if (requestSession !== sessionGeneration) {
      throw new ApiError(409, "SESSION_CHANGED", "Phiên đăng nhập đã thay đổi. Vui lòng tải lại dữ liệu.");
    }
  };

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
    options?.signal?.throwIfAborted();
    assertCurrentSession();
    const sentToken = accessToken;
    let res: T;
    try {
      res = await apiRequest<T>(path, body, method, extraHeaders, options?.signal, options?.timeoutMs);
    } catch (error) {
      assertCurrentSession();
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
      assertCurrentSession();
      options?.signal?.throwIfAborted();
      res = await apiRequest<T>(path, body, method, extraHeaders, options?.signal, options?.timeoutMs);
    }

    assertCurrentSession();

    if (isGet) {
      apiGetCache.set(cacheKey, { data: res, expiresAt: Date.now() + ttlMs });
    } else {
      // Only drop what this write can make stale (e.g. marking a notification
      // read must not refetch plans); unknown writes still clear everything.
      const scope = cacheInvalidationScope(method ?? "POST", path);
      if (scope === null) invalidateApiCache();
      else for (const key of [...apiGetCache.keys()]) if (scope.some(s => cacheKeyInScope(key, s))) apiGetCache.delete(key);
    }
    return res;
  };

  if (isGet && !options?.skipCache) {
    const promise = exec().finally(() => {
      if (inflightGetRequests.get(cacheKey) === promise) inflightGetRequests.delete(cacheKey);
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
