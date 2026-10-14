import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { ApiError, endSession, clearAccessToken, ensureFreshSession, sessionRefreshDelay, refreshSession, startSession, type ApiUser } from "../services/api";

export type UserRole = "user" | "admin";
export type AuthUser = {
  id: string; initials: string; name: string; email: string; detail: string; role: UserRole;
  phone?: string; city?: string; avatarUrl?: string; authProvider?: "email" | "google";
};
type AuthContextType = {
  user: AuthUser | null; isAuthenticated: boolean; initializing: boolean;
  restoreError: string | null; retrySession: () => void;
  login: (email: string, password: string, remember?: boolean) => Promise<AuthUser>;
  loginWithGoogle: (credential: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextType | null>(null);
// BroadcastChannel cũng gửi tới các kênh khác trong CÙNG tab: gắn ID để bỏ qua tin do chính tab này phát.
const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
type AuthBroadcast = { type: "logout" | "session-changed"; tabId: string };
function broadcastSession(message: "logout" | "session-changed") {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("anhuu-auth");
  channel.postMessage({ type: message, tabId: TAB_ID } satisfies AuthBroadcast); channel.close();
}
function toUser(user: ApiUser): AuthUser {
  const parts = user.fullName.trim().split(/\s+/);
  return { id: user.id, name: user.fullName, email: user.email, role: user.role === "ADMIN" ? "admin" : "user",
    initials: (parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : ""),
    detail: user.role === "ADMIN" ? "Quản trị viên" : "Tài khoản An Hưu",
    phone: user.phone || "", city: user.city || "", avatarUrl: user.avatarUrl || undefined };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const retrySession = useCallback(() => { setRestoreError(null); setInitializing(true); setRestoreAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const delay = sessionRefreshDelay();
      if (active && delay !== null) timer = setTimeout(refresh, Math.min(2147483647, Math.max(1000, delay)));
    };
    const refresh = async () => {
      if (!active || refreshing) return;
      clearTimeout(timer);
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      refreshing = true;
      try { await ensureFreshSession(); }
      catch {
        // A transient outage must not log out the user or cause a retry loop.
        if (active && sessionRefreshDelay() !== null) {
          clearTimeout(timer);
          timer = setTimeout(refresh, 30000);
        }
        return;
      } finally { refreshing = false; }
      if (active) schedule();
    };
    schedule();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("anhuu:session-updated", schedule);
    return () => { active = false; clearTimeout(timer); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("anhuu:session-updated", schedule); };
  }, [user?.id]);
  useEffect(() => {
    let active = true;
    // Local demo storage is never proof of an authenticated session.
    try { localStorage.removeItem("an_huu_auth_user"); sessionStorage.removeItem("an_huu_auth_user"); } catch { /* Storage may be disabled. */ }
    const restore = () => {
      setInitializing(true); setRestoreError(null);
      refreshSession().then(session => { if (active) setUser(toUser(session.user)); })
        .catch(error => {
          if (!active) return;
          clearAccessToken(); setUser(null);
          if (!(error instanceof ApiError && error.status === 401)) {
            setRestoreError("Chưa kết nối được máy chủ để khôi phục phiên đăng nhập. Vui lòng thử lại.");
          }
        }).finally(() => { if (active) setInitializing(false); });
    };
    restore();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("anhuu-auth") : null;
    if (channel) channel.onmessage = event => {
      const data = event.data as AuthBroadcast | string;
      const type = typeof data === "string" ? data : data?.type;
      if (typeof data === "object" && data?.tabId === TAB_ID) return;
      if (type === "logout") { clearAccessToken(); setUser(null); setRestoreError(null); }
      if (type === "session-changed") {
        clearAccessToken(); setUser(null); restore();
      }
    };
    const expired = () => { clearAccessToken(); setUser(null); setRestoreError(null); };
    const updated = (event: Event) => { if (active) { setUser(toUser((event as CustomEvent<ApiUser>).detail)); setRestoreError(null); } };
    window.addEventListener("anhuu:session-expired", expired);
    window.addEventListener("anhuu:session-updated", updated);
    return () => { active = false; channel?.close(); window.removeEventListener("anhuu:session-expired", expired); window.removeEventListener("anhuu:session-updated", updated); };
  }, [restoreAttempt]);
  const login = useCallback(async (email: string, password: string, remember = false) => {
    const session = await startSession("/auth/login", { email: email.trim().toLowerCase(), password, remember });
    const current = toUser(session.user); setUser(current); broadcastSession("session-changed"); return current;
  }, []);
  const loginWithGoogle = useCallback(async (credential: string) => {
    const session = await startSession("/auth/google", { credential });
    const current = toUser(session.user); setUser(current); broadcastSession("session-changed"); return current;
  }, []);
  const logout = useCallback(async () => {
    await endSession();
    clearAccessToken(); setUser(null);
    broadcastSession("logout");
  }, []);
  const value = useMemo(() => ({ user, isAuthenticated: !!user, initializing, restoreError, retrySession, login, loginWithGoogle, logout }),
    [user, initializing, restoreError, retrySession, login, loginWithGoogle, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
