import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type UserRole = "user" | "admin";

export type AuthUser = {
  id: string;
  initials: string;
  name: string;
  email: string;
  detail: string;
  role: UserRole;
};

type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser | null>;
  logout: () => void;
};

// Tài khoản mẫu mặc định
export const DEMO_ACCOUNTS = {
  user: {
    email: "user@demo.com",
    password: "demo123",
  },
  admin: {
    email: "admin@demo.com",
    password: "admin123",
  },
};

// User mẫu
const demoUsers: Record<string, AuthUser> = {
  "user@demo.com": {
    id: "USR-001",
    initials: "NA",
    name: "Nguyễn Minh An",
    email: "user@demo.com",
    detail: "Gói Chuẩn bị Tương lai",
    role: "user",
  },
  "admin@demo.com": {
    id: "ADM-001",
    initials: "LA",
    name: "Lê Lan Anh",
    email: "admin@demo.com",
    detail: "Quản trị viên",
    role: "admin",
  },
};

const STORAGE_KEY = "an_huu_auth_user";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (email: string, password: string): Promise<AuthUser | null> => {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPassword = (password || "").trim();

    // Kiểm tra tài khoản demo (hỗ trợ cả viết hoa thường, dấu cách thừa)
    if (cleanEmail === DEMO_ACCOUNTS.user.email.toLowerCase() && cleanPassword === DEMO_ACCOUNTS.user.password) {
      const u = demoUsers["user@demo.com"];
      setUser(u);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); } catch {}
      return u;
    }
    if (cleanEmail === DEMO_ACCOUNTS.admin.email.toLowerCase() && cleanPassword === DEMO_ACCOUNTS.admin.password) {
      const u = demoUsers["admin@demo.com"];
      setUser(u);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); } catch {}
      return u;
    }
    return null;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
