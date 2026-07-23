import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

function Protected({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="login-body cosmos-body" style={{ minHeight: "100dvh" }}>
        <main className="login-shell" style={{ justifyContent: "center" }}>
          <p className="form-status">正在检查会话…</p>
        </main>
      </div>
    );
  }
  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
    </Routes>
  );
}
