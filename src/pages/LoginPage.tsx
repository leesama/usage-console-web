import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "../styles/login.css";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export default function LoginPage() {
  const { status, login } = useAuth();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionNote, setSessionNote] = useState(
    "请输入账号和密码，开启坐舱系统。"
  );
  const [sessionWarning, setSessionWarning] = useState(false);
  const [themeLabel, setThemeLabel] = useState("深色");

  useEffect(() => {
    document.title = "授权闸舱 · Token 驾驶室";
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeLock = "dark";
    document.body.classList.add("login-active", "login-body", "cosmos-body");

    if (params.get("expired") === "1") {
      setSessionNote("登录已过期，请重新验证账号。");
      setSessionWarning(true);
    }

    void (async () => {
      try {
        await loadScript("/static/cosmos-webgl.js?v=login-restore");
        await loadScript("/static/token-motion.js?v=login-restore");
      } catch {
        // visual FX optional
      }
    })();

    return () => {
      document.body.classList.remove(
        "login-active",
        "login-body",
        "cosmos-body"
      );
    };
  }, [params]);

  useEffect(() => {
    const dark = document.documentElement.dataset.theme !== "light";
    setThemeLabel(dark ? "深色" : "浅色");
  }, []);

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  function toggleTheme() {
    const root = document.documentElement;
    if (root.dataset.themeLock === "dark") {
      // production lock — keep dark but update button feedback
      setThemeLabel("深色");
      return;
    }
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    setThemeLabel(next === "dark" ? "深色" : "浅色");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const account = username.trim();
    if (!account || !password) {
      setMessage("请输入账号和密码。");
      setSuccess(false);
      return;
    }
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      await login(account, password);
      setPassword("");
      setSuccess(true);
      setMessage("验证通过，正在进入控制台…");
      window.location.replace("/");
    } catch (error) {
      setPassword("");
      setSuccess(false);
      if (error instanceof ApiError && error.code === "LOGIN_RATE_LIMITED") {
        setMessage("尝试次数过多，请稍后再试。");
      } else if (error instanceof Error) {
        setMessage(error.message || "登录失败，请检查账号和密码。");
      } else {
        setMessage("登录失败，请稍后再试。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <canvas className="cosmos-webgl" id="cosmosWebgl" aria-hidden="true" />
      <canvas
        className="ai-particle-field login-particles"
        id="aiParticleField"
        aria-hidden="true"
      />
      <div className="login-atmosphere" aria-hidden="true">
        <span className="atmo-ring ring-a" />
        <span className="atmo-ring ring-b" />
        <span className="atmo-ring ring-c" />
        <span className="atmo-beam" />
        <span className="atmo-stars" />
      </div>

      <main className="login-shell">
        <section className="login-intro" aria-labelledby="loginTitle">
          <div className="brand-line">
            <span className="brand-mark" aria-hidden="true">
              TKN
            </span>
            <span>Token 驾驶室</span>
          </div>
          <div className="signal" aria-hidden="true">
            <span className="signal-orbit orbit-one" />
            <span className="signal-orbit orbit-two" />
            <span className="signal-orbit orbit-three" />
            <span className="signal-core">01</span>
            <span className="signal-token token-one" />
            <span className="signal-token token-two" />
            <span className="signal-token token-three" />
            <span className="signal-token token-four" />
          </div>
          <p className="eyebrow">PRIVATE TOKEN COCKPIT</p>
          <h1 id="loginTitle">进入你的私人坐舱</h1>
          <p className="intro-copy">
            授权后瘫坐进 Token 驾驶室，一屏俯瞰 GPT、Grok、GLM 与 DS 的额度航迹。
          </p>
          <ul className="security-list" aria-label="功能概览">
            <li>GPT、Grok、GLM 与 DS 集中查看</li>
            <li>额度、Key 与账号状态一屏呈现</li>
            <li>支持手动同步与 60 秒自动刷新</li>
          </ul>
        </section>

        <section className="login-card" aria-label="账号登录">
          <div className="card-chrome" aria-hidden="true">
            <span className="chrome-corner tl" />
            <span className="chrome-corner tr" />
            <span className="chrome-corner bl" />
            <span className="chrome-corner br" />
          </div>
          <div className="card-head">
            <div>
              <p className="card-kicker">AUTHORIZATION HATCH</p>
              <h2>身份授权</h2>
            </div>
            <button
              className="theme-button"
              type="button"
              aria-label="切换主题"
              onClick={toggleTheme}
            >
              {themeLabel}
            </button>
          </div>

          <p
            className={`session-note${sessionWarning ? " warning" : ""}`}
            id="sessionNote"
          >
            {sessionNote}
          </p>

          <form id="loginForm" noValidate onSubmit={onSubmit}>
            <label className="field">
              <span>账号</span>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                required
                autoFocus
                disabled={busy}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>

            <label className="field">
              <span>密码</span>
              <span className="password-control">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  aria-label="密码"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  disabled={busy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  id="passwordToggle"
                  type="button"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </span>
            </label>

            <p
              className={`form-status${success ? " success" : ""}`}
              id="formStatus"
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
            <button
              className="submit-button"
              id="submitBtn"
              type="submit"
              disabled={busy}
            >
              <span>{busy ? "正在验证" : "进入驾驶室"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className="session-footnote">
            <span className="lock-dot" aria-hidden="true" />
            <span>验证通过后即可进入专属 Token 驾驶室</span>
          </div>
        </section>
      </main>
    </div>
  );
}
