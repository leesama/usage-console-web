import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  fetchSession,
  login as apiLogin,
  logout as apiLogout,
  type SessionInfo,
} from "../api/client";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  session: SessionInfo | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<SessionInfo | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const info = await fetchSession();
      if (info.authenticated || info.mode === "local") {
        setSession(info);
        setStatus("authenticated");
      } else {
        setSession(null);
        setStatus("anonymous");
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        setSession(null);
        setStatus("anonymous");
        return;
      }
      // 连接异常时保留登录入口。
      setSession(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (username: string, password: string) => {
    const info = await apiLogin(username, password);
    setSession(info);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setSession(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(
    () => ({ status, session, login, logout, refreshSession }),
    [status, session, login, logout, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
