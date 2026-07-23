import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DsBlock, dsPanelMeta } from "../components/usage/DsBlock";
import { GlmBlock, glmPanelMeta } from "../components/usage/GlmBlock";
import { GrokBlock, grokPanelMeta } from "../components/usage/GrokBlock";
import {
  GptBlock,
  gptPanelMeta,
  type ProviderState,
} from "../components/usage/GptBlock";
import {
  KeyUsageBlock,
  keyUsagePanelMeta,
} from "../components/usage/KeyUsageBlock";
import {
  completeCockpitSource,
  finishCockpitSync,
  notifyCockpitThemeChanged,
  startCockpitSync,
  useCockpitEffects,
} from "../hooks/useCockpitEffects";
import { useNow } from "../hooks/useNow";
import "../styles/app.css";
import "../styles/token-flow.css";

const AUTO_REFRESH_MS = 60_000;

function emptyProvider<T>(): ProviderState<T> {
  return { data: null, error: null, loading: true };
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "请求超时，请稍后重试。";
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "请求失败";
}

function readAutoRefreshPreference(): boolean {
  try {
    return localStorage.getItem("usage-auto-refresh") === "1";
  } catch {
    return false;
  }
}

function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function lockedTheme(): "light" | "dark" | null {
  const value = document.documentElement.dataset.themeLock;
  return value === "light" || value === "dark" ? value : null;
}

export default function DashboardPage() {
  const { session, logout } = useAuth();
  const now = useNow(30_000);
  const loadingRef = useRef(false);
  useCockpitEffects();

  const [glm, setGlm] = useState(emptyProvider<Record<string, unknown>>());
  const [gpt, setGpt] = useState(emptyProvider<Record<string, unknown>>());
  const [gptQuota, setGptQuota] = useState(
    emptyProvider<Record<string, unknown>>()
  );
  const [keyUsage, setKeyUsage] = useState(
    emptyProvider<Record<string, unknown>>()
  );
  const [grok, setGrok] = useState(emptyProvider<Record<string, unknown>>());
  const [ds, setDs] = useState(emptyProvider<Record<string, unknown>>());
  const [refreshState, setRefreshState] = useState("座舱系统待机");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [autoRefresh, setAutoRefresh] = useState(readAutoRefreshPreference);
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setRefreshState("正在同步配额与 Key 用量");
    startCockpitSync();
    // Keep last successful payload visible while refreshing (legacy app.js behavior).
    setGlm((s) => ({ ...s, loading: !s.data, error: null }));
    setGpt((s) => ({ ...s, loading: !s.data, error: null }));
    setGptQuota((s) => ({ ...s, loading: !s.data, error: null }));
    setKeyUsage((s) => ({ ...s, loading: !s.data, error: null }));
    setGrok((s) => ({ ...s, loading: !s.data, error: null }));
    setDs((s) => ({ ...s, loading: !s.data, error: null }));

    let completed = 0;
    const tick = () => {
      completed += 1;
      setLastUpdated(new Date());
      setRefreshState(`已完成 ${completed} / 6`);
      completeCockpitSource();
    };

    async function one(
      path: string,
      apply: (data: Record<string, unknown>) => void,
      fail: (msg: string, code?: string) => void,
      timeoutMs = 0
    ): Promise<boolean> {
      const controller = timeoutMs > 0 ? new AbortController() : null;
      const timeout =
        controller && timeoutMs > 0
          ? window.setTimeout(() => controller.abort(), timeoutMs)
          : null;
      try {
        const data = await apiJson<Record<string, unknown>>(path, {
          signal: controller?.signal,
        });
        apply(data);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
          window.location.replace("/login?expired=1");
          return false;
        }
        const code = error instanceof ApiError ? error.code : undefined;
        fail(formatError(error), code);
        return false;
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
        tick();
      }
    }

    let failed = 6;
    try {
      const results = await Promise.all([
        one(
          "/api/usage",
          (data) =>
            setGlm({ data, error: null, errorCode: null, loading: false }),
          (msg, code) =>
            setGlm((prev) => ({
              data: prev.data,
              error: msg,
              errorCode: code ?? null,
              loading: false,
            }))
        ),
        one(
          "/api/gpt-usage",
          (data) => {
            if (typeof data.timezone === "string" && data.timezone) {
              setTimezone(data.timezone);
            }
            setGpt({ data, error: null, errorCode: null, loading: false });
          },
          (msg, code) =>
            setGpt((prev) => ({
              data: prev.data,
              error: msg,
              errorCode: code ?? null,
              loading: false,
            }))
        ),
        one(
          "/api/gpt-quota",
          (data) =>
            setGptQuota({
              data,
              error: null,
              errorCode: null,
              loading: false,
            }),
          (msg, code) =>
            setGptQuota((prev) => ({
              data: prev.data,
              error: msg,
              errorCode: code ?? null,
              loading: false,
            }))
        ),
        one(
          "/api/gpt-key-usage",
          (data) =>
            setKeyUsage({
              data,
              error: null,
              errorCode: null,
              loading: false,
            }),
          (msg, code) =>
            setKeyUsage((prev) => ({
              data: prev.data,
              error: msg,
              errorCode: code ?? null,
              loading: false,
            }))
        ),
        one(
          "/api/grok-accounts",
          (data) =>
            setGrok({ data, error: null, errorCode: null, loading: false }),
          (msg, code) =>
            setGrok((prev) => ({
              data: prev.data,
              error: msg,
              errorCode: code ?? null,
              loading: false,
            })),
          15_000
        ),
        one(
          "/api/ds-usage",
          (data) =>
            setDs({ data, error: null, errorCode: null, loading: false }),
          (msg, code) =>
            setDs((prev) => ({
              data: prev.data,
              error: msg,
              errorCode: code ?? null,
              loading: false,
            }))
        ),
      ]);
      failed = results.filter((success) => !success).length;
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLastUpdated(new Date());
      setRefreshState(
        failed === 0
          ? "全部用量已更新"
          : failed === 1
            ? "已完成，1 个查询需要处理"
            : `已完成，${failed} 个查询需要处理`
      );
      finishCockpitSync(failed === 0);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    try {
      localStorage.setItem("usage-auto-refresh", autoRefresh ? "1" : "0");
    } catch {
      // Storage can be disabled in privacy-restricted browsers.
    }
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void loadAll(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadAll]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (
        !lockedTheme() &&
        document.documentElement.dataset.themePreference === "system"
      ) {
        const next = event.matches ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        setTheme(next);
        notifyCockpitThemeChanged();
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const available = useMemo(() => {
    return (
      Number(Boolean(gpt.data)) +
      Number(Boolean(glm.data)) +
      Number(Boolean(grok.data)) +
      Number(Boolean(ds.data))
    );
  }, [gpt.data, glm.data, grok.data, ds.data]);

  const gptMeta = gptPanelMeta(gpt, gptQuota);
  const keyMeta = keyUsagePanelMeta(keyUsage);
  const grokMeta = grokPanelMeta(grok);
  const glmMeta = glmPanelMeta(glm);
  const dsMeta = dsPanelMeta(ds);
  const themeLock = lockedTheme();

  async function onLogout() {
    await logout();
    window.location.replace("/login");
  }

  function toggleTheme() {
    if (themeLock) return;
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.themePreference = "manual";
    try {
      localStorage.setItem("usage-theme", next);
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }
    setTheme(next);
    notifyCockpitThemeChanged();
  }

  return (
    <>
      <div className="cockpit-scene" id="cockpitScene">
        <canvas
          className="cosmos-webgl"
          id="cosmosWebgl"
          aria-hidden="true"
        />
        <canvas
          className="ai-particle-field"
          id="aiParticleField"
          aria-hidden="true"
        />
        <div className="earth-orbit" id="earthOrbit" aria-hidden="true">
          <canvas id="earthThree" />
          <div className="earth-orbit-label">
            <strong>EARTH</strong>
            <span id="earthOrbitDistance">HOME ORBIT · 42,180 KM</span>
          </div>
        </div>

        <div className="cockpit-hull" aria-hidden="true">
          <div className="hull-canopy" />
          <div className="hull-rib left" />
          <div className="hull-rib right" />
          <div className="hull-sill" />
          <div className="hull-window-glare" />
          <div className="hull-corner tl" />
          <div className="hull-corner tr" />
          <div className="hull-corner bl" />
          <div className="hull-corner br" />
        </div>

        <div className="app-shell cockpit-deck">
          <header className="topbar command-rail">
            <canvas
              className="token-field"
              id="tokenField"
              aria-hidden="true"
            />
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                TKN
              </div>
              <div className="brand-copy">
                <p className="eyebrow">Long range · Multi-screen bridge</p>
                <h1>Token 驾驶室</h1>
                <p className="brand-description">
                  {session?.username
                    ? `机长 ${session.username} · 地球近轨巡航。悬停显示器启动升降稳定器，点击可推近查看。`
                    : "地球近轨巡航。悬停显示器启动升降稳定器，点击可推近查看。"}
                </p>
              </div>
            </div>
            <div className="actions">
              <div className="refresh-state" aria-live="polite">
                {refreshState}
              </div>
              <button
                className="secondary-button"
                type="button"
                aria-pressed={theme === "dark"}
                aria-label={
                  themeLock
                    ? "宇宙座舱已固定使用高对比深空主题"
                    : theme === "dark"
                      ? "当前为深色主题，切换为浅色主题"
                      : "当前为浅色主题，切换为深色主题"
                }
                disabled={Boolean(themeLock)}
                onClick={toggleTheme}
              >
                {themeLock
                  ? themeLock === "dark"
                    ? "深空主题"
                    : "明亮主题"
                  : theme === "dark"
                    ? "深色主题"
                    : "浅色主题"}
              </button>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
                <span className="switch" aria-hidden="true" />
                <span>{autoRefresh ? "自动刷新 60 秒" : "自动刷新"}</span>
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={loading}
                onClick={() => void loadAll()}
              >
                {loading ? "正在刷新" : "同步航迹"}
              </button>
            </div>
          </header>

          <section className="status-rail telemetry-rail" aria-label="同步概览">
            <div className="status-item">
              <span className="status-label">数据源</span>
              <strong className="status-value">{available} / 4 可用</strong>
            </div>
            <div className="status-item">
              <span className="status-label">最近同步</span>
              <strong
                key={lastUpdated?.getTime() ?? "pending"}
                className={`status-value${lastUpdated ? " value-pulse" : ""}`}
              >
                {lastUpdated
                  ? lastUpdated.toLocaleTimeString("zh-CN", { hour12: false })
                  : "尚未完成"}
              </strong>
            </div>
            <div className="status-item">
              <span className="status-label">统计时区</span>
              <strong className="status-value">{timezone}</strong>
            </div>
          </section>

          <div className="monitor-bay">
            <div className="monitor-bay-label" aria-hidden="true">
              <span>LIFT-MOUNTED DISPLAY ARRAY</span>
              <span>
                DRAG FREELOOK · WHEEL THRUST · DOUBLE-CLICK VOID TO JUMP
              </span>
            </div>
            <main
              className="dashboard-main cockpit-monitors"
              id="cockpitMonitors"
            >
              <section
                className="provider-panel gpt-combined-panel provider-gpt cockpit-screen"
                data-screen-slot="1"
                aria-label="GPT 用量"
              >
              <div className="gpt-combined-grid">
                <section className="gpt-pane" aria-labelledby="gptTitle">
                  <ProviderHeader
                    code="GPT"
                    titleId="gptTitle"
                    title="GPT"
                    subtitle={gptMeta.subtitle}
                    status={gptMeta.status}
                  />
                  <div className="provider-meta">{gptMeta.meta}</div>
                  <div className="provider-content" aria-live="polite">
                    <GptBlock usage={gpt} quota={gptQuota} now={now} />
                  </div>
                </section>

                <section
                  className="gpt-pane gpt-key-pane"
                  aria-labelledby="keyUsageTitle"
                >
                  <ProviderHeader
                    code="KEY"
                    titleId="keyUsageTitle"
                    title="GPT Key 用量"
                    subtitle={keyMeta.subtitle}
                    status={keyMeta.status}
                  />
                  <div className="provider-meta">{keyMeta.meta}</div>
                  <div className="key-content" aria-live="polite">
                    <KeyUsageBlock state={keyUsage} />
                  </div>
                </section>
              </div>
              </section>

              <ProviderPanel
                code="GROK"
                title="Grok 账号"
                subtitle={grokMeta.subtitle}
                status={grokMeta.status}
                meta={grokMeta.meta}
                className="provider-grok"
                contentClassName="grok-account-grid"
                screenSlot="2"
              >
                <GrokBlock state={grok} />
              </ProviderPanel>

              <ProviderPanel
                code="GLM"
                title="智谱 GLM"
                subtitle={glmMeta.subtitle}
                status={glmMeta.status}
                meta={glmMeta.meta}
                className="provider-glm"
                screenSlot="3"
              >
                <GlmBlock state={glm} now={now} />
              </ProviderPanel>

              <ProviderPanel
                code="DS"
                title="DeepSeek"
                subtitle={dsMeta.subtitle}
                status={dsMeta.status}
                meta={dsMeta.meta}
                className="provider-ds"
                contentClassName="ds-content"
                screenSlot="4"
              >
                <DsBlock state={ds} now={now} />
              </ProviderPanel>
            </main>
          </div>

          <footer className="footer">
            <span>GPT、Grok、GLM 与 DS 用量集中呈现。</span>
            <span className="footer-session">
              <span>
                机长 <strong>{session?.username || "当前账号"}</strong>
              </span>
              <button type="button" onClick={() => void onLogout()}>
                离开座舱
              </button>
            </span>
            <span>近轨巡航 · 四屏联动</span>
          </footer>
        </div>
      </div>

      <div className="jump-impact" id="jumpImpact" aria-hidden="true">
        <span className="jump-impact__flash" />
        <span className="jump-impact__ring" />
        <span className="jump-impact__readout">IMPULSE DRIVE · ENGAGED</span>
      </div>
    </>
  );
}

function ProviderHeader({
  code,
  titleId,
  title,
  subtitle,
  status,
}: {
  code: string;
  titleId?: string;
  title: string;
  subtitle: string;
  status: { kind: string; label: string };
}) {
  return (
    <div className="provider-header">
      <div className="provider-identity">
        <div className="provider-code" aria-hidden="true">
          {code}
        </div>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <span className={`status-badge ${status.kind}`.trim()}>{status.label}</span>
    </div>
  );
}

function ProviderPanel({
  code,
  title,
  subtitle,
  status,
  meta,
  children,
  className = "",
  contentClassName = "",
  screenSlot,
}: {
  code: string;
  title: string;
  subtitle: string;
  status: { kind: string; label: string };
  meta: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  screenSlot?: string;
}) {
  return (
    <section
      className={`provider-panel cockpit-screen ${className}`.trim()}
      data-screen-slot={screenSlot}
      aria-label={title}
    >
      <ProviderHeader
        code={code}
        title={title}
        subtitle={subtitle}
        status={status}
      />
      <div className="provider-meta">{meta}</div>
      <div className={`provider-content ${contentClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}
