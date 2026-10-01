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
  login: (email: string, password: string) => Promise<boolean>;
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

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    // Kiểm tra tài khoản demo
    if (email === DEMO_ACCOUNTS.user.email && password === DEMO_ACCOUNTS.user.password) {
      setUser(demoUsers["user@demo.com"]);
      return true;
    }
    if (email === DEMO_ACCOUNTS.admin.email && password === DEMO_ACCOUNTS.admin.password) {
      setUser(demoUsers["admin@demo.com"]);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
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
