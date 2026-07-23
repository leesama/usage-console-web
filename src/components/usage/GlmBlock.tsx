import { useState } from "react";
import { revealGlmKey, ApiError } from "../../api/client";
import { copyText } from "../../lib/clipboard";
import {
  clampPercent,
  formatNumber,
  formatPercent,
  remainingTone,
} from "../../lib/format";
import { Countdown, Notice, StateCard } from "./Shared";
import type { ProviderState } from "./GptBlock";

type LimitItem = {
  type?: string;
  percentage?: unknown;
  usage?: unknown;
  currentValue?: unknown;
  remaining?: unknown;
  nextResetTime?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function glmLimit(
  account: Record<string, unknown>,
  matcher: (type: string) => boolean
): LimitItem | null {
  const quota = asRecord(account.quotaLimit);
  const limits = quota?.limits;
  if (!Array.isArray(limits)) return null;
  const found = limits.find((item) => {
    const row = asRecord(item);
    return matcher(String(row?.type || ""));
  });
  return (found as LimitItem) || null;
}

function glmRemainingPercent(item: LimitItem | null): number | null {
  if (!item) return null;
  const used = Number(item.percentage);
  return Number.isFinite(used) ? clampPercent(100 - used) : null;
}

function glmWeeklyRemaining(account: Record<string, unknown>): number {
  const remaining = glmRemainingPercent(
    glmLimit(account, (type) => type.includes("每周"))
  );
  return remaining === null ? -1 : remaining;
}

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "请求失败";
}

function GlmCompactMetric({
  label,
  item,
  kind,
  now,
}: {
  label: string;
  item: LimitItem | null;
  kind: "token" | "weekly" | "mcp";
  now: number;
}) {
  let valueText = "--";
  let unitText = "";
  let progress = 0;
  let usageText = "暂无数据";
  let hasRemaining = false;

  if (item && kind === "mcp") {
    const total = Number(item.usage);
    const current = Number(item.currentValue);
    const directRemaining = Number(item.remaining);
    const remaining = Number.isFinite(directRemaining)
      ? Math.max(0, directRemaining)
      : Number.isFinite(total) && Number.isFinite(current)
        ? Math.max(0, total - current)
        : null;
    if (remaining !== null) {
      valueText = formatNumber(remaining);
      unitText = "次剩余";
      hasRemaining = true;
    }
    if (Number.isFinite(total) && total > 0 && Number.isFinite(current)) {
      progress = clampPercent(((total - current) / total) * 100);
      usageText = `已用 ${formatNumber(current)} / ${formatNumber(total)}`;
    }
  } else if (item) {
    const remaining = glmRemainingPercent(item);
    const used = Number(item.percentage);
    if (remaining !== null) {
      valueText = formatPercent(remaining);
      unitText = "% 剩余";
      progress = remaining;
      hasRemaining = true;
    }
    if (Number.isFinite(used)) usageText = `已用 ${formatPercent(used)}%`;
  }

  const tone = hasRemaining ? remainingTone(progress) : "";

  return (
    <div
      className={`glm-metric${kind === "weekly" ? " is-weekly" : ""}${
        tone ? ` ${tone}` : ""
      }`}
    >
      <span className="glm-metric-label">{label}</span>
      <div className="glm-metric-value">
        <strong>{valueText}</strong>
        <small>{unitText}</small>
      </div>
      <div className="glm-mini-meter">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="glm-metric-meta">
        <span>{usageText}</span>
        {item?.nextResetTime ? (
          <Countdown resetAt={item.nextResetTime} now={now} />
        ) : null}
      </div>
    </div>
  );
}

function GlmAccountCard({
  account,
  index,
  now,
}: {
  account: Record<string, unknown>;
  index: number;
  now: number;
}) {
  const [busy, setBusy] = useState(false);
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  const [buttonLabel, setButtonLabel] = useState("复制");
  const [buttonClass, setButtonClass] = useState("");

  const id =
    typeof account.id === "string" && account.id
      ? account.id
      : `key-${index + 1}`;
  const preview =
    typeof account.apiKeyPreview === "string"
      ? account.apiKeyPreview
      : typeof account.apiKey === "string"
        ? String(account.apiKey)
        : "";
  const label = String(account.label || `Key ${index + 1}`);
  const accountStatus = String(account.status || "ready");
  const statusClass =
    accountStatus === "ready"
      ? "ready"
      : accountStatus === "partial"
        ? "warning"
        : "error";
  const statusText =
    accountStatus === "ready"
      ? "已同步"
      : accountStatus === "partial"
        ? "部分可用"
        : "查询失败";

  const quota = asRecord(account.quotaLimit);
  const errors = asRecord(account.errors);
  const requestError =
    typeof errors?.request === "string" ? errors.request : null;
  const quotaError =
    typeof errors?.quotaLimit === "string" ? errors.quotaLimit : null;

  async function onReveal() {
    if (
      !window.confirm(
        `即将获取 ${label} 的完整 API Key 并复制到剪贴板。\n\n请勿在公共设备或屏幕共享时操作；完整 Key 仅短暂显示。`
      )
    ) {
      return;
    }
    setBusy(true);
    setButtonLabel("获取中");
    setButtonClass("");
    try {
      const apiKey = await revealGlmKey(id);
      await copyText(apiKey);
      setDisplayKey(apiKey);
      setButtonLabel("已复制");
      setButtonClass("is-copied");
      window.setTimeout(() => {
        setDisplayKey(null);
        setButtonLabel("复制");
        setButtonClass("");
        setBusy(false);
      }, 4000);
    } catch (error) {
      setDisplayKey(null);
      setButtonLabel("复制失败");
      setButtonClass("is-error");
      window.setTimeout(() => {
        setButtonLabel("复制");
        setButtonClass("");
        setBusy(false);
      }, 1600);
      // Keep alert for unexpected failures when clipboard itself fails after fetch
      if (!(error instanceof ApiError)) {
        window.alert(formatError(error));
      }
    }
  }

  return (
    <section className="glm-key-card">
      <div className="glm-key-header">
        <div className="glm-key-identity">
          <span className="glm-key-order">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3>{label}</h3>
          {quota?.level ? (
            <span className="glm-plan-tag">
              {String(quota.level).toUpperCase()}
            </span>
          ) : null}
        </div>
        <span className={`glm-key-status ${statusClass}`}>{statusText}</span>
      </div>

      <div className="glm-key-secret">
        <span className="glm-key-secret-label">API Key</span>
        <code className="glm-key-secret-value" aria-label="掩码 API Key">
          {displayKey || preview || "未返回 Key"}
        </code>
        <button
          type="button"
          className={`glm-copy-button ${buttonClass}`.trim()}
          disabled={!preview || busy}
          aria-label={`确认后复制 ${label} 的完整 Key`}
          onClick={() => void onReveal()}
        >
          {preview ? buttonLabel : "不可用"}
        </button>
      </div>

      {requestError || quotaError || !quota ? (
        <div className="glm-key-error">
          {requestError || quotaError || "暂无配额数据"}
        </div>
      ) : (
        <div className="glm-key-metrics">
          <GlmCompactMetric
            label="5 小时"
            item={glmLimit(account, (type) => type.includes("5 小时"))}
            kind="token"
            now={now}
          />
          <GlmCompactMetric
            label="周额度"
            item={glmLimit(account, (type) => type.includes("每周"))}
            kind="weekly"
            now={now}
          />
          <GlmCompactMetric
            label="MCP"
            item={glmLimit(account, (type) => type.includes("MCP"))}
            kind="mcp"
            now={now}
          />
        </div>
      )}
    </section>
  );
}

export function GlmBlock({
  state,
  now,
}: {
  state: ProviderState<Record<string, unknown>>;
  now: number;
}) {
  if (state.loading) {
    return (
      <div className="skeleton-stack" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (!state.data) {
    const unconfigured = state.errorCode === "GLM_NOT_CONFIGURED";
    return (
      <StateCard
        title={unconfigured ? "未配置 GLM" : "GLM 查询失败"}
        message={
          unconfigured
            ? "GLM 用量尚未完成配置，请检查应用设置。"
            : state.error || "暂时无法获取 GLM 数据。"
        }
        isError={!unconfigured}
      />
    );
  }

  const accounts = Array.isArray(state.data.accounts)
    ? (state.data.accounts as Record<string, unknown>[])
    : [Object.assign({ label: "Key 1", status: "ready" }, state.data)];

  const sorted = accounts.slice().sort((left, right) => {
    const leftScore = glmWeeklyRemaining(left);
    const rightScore = glmWeeklyRemaining(right);
    return (
      rightScore - leftScore ||
      String(left.label || "").localeCompare(String(right.label || ""), "zh-CN", {
        numeric: true,
      })
    );
  });

  const total = Number(state.data.total) || accounts.length;
  const available = Number.isFinite(Number(state.data.available))
    ? Number(state.data.available)
    : accounts.filter((a) => a.status !== "error").length;
  const hasFailures = available < total;

  return (
    <>
      {state.error ? (
        <Notice>
          本次刷新失败，当前展示上一次成功数据：{state.error}
        </Notice>
      ) : null}
      {hasFailures ? (
        <Notice>部分 Key 暂时不可用，其余 Key 的数据已正常更新。</Notice>
      ) : null}
      <div className="glm-key-list">
        {sorted.map((account, index) => (
          <GlmAccountCard
            key={String(account.id ?? index)}
            account={account}
            index={index}
            now={now}
          />
        ))}
      </div>
    </>
  );
}

export function glmPanelMeta(
  state: ProviderState<Record<string, unknown>>
): { subtitle: string; meta: string; status: { kind: string; label: string } } {
  if (state.loading) {
    return {
      subtitle: "正在读取多 Key 配置",
      meta: "正在获取配额时间窗口",
      status: { kind: "", label: "同步中" },
    };
  }
  if (!state.data) {
    const unconfigured = state.errorCode === "GLM_NOT_CONFIGURED";
    return {
      subtitle: "多 Key 用量",
      meta: "未取得 GLM 用量",
      status: {
        kind: unconfigured ? "warning" : "error",
        label: unconfigured ? "待配置" : "不可用",
      },
    };
  }
  const accounts = Array.isArray(state.data.accounts)
    ? state.data.accounts
    : [state.data];
  const total = Number(state.data.total) || accounts.length;
  const available = Number.isFinite(Number(state.data.available))
    ? Number(state.data.available)
    : accounts.filter((a) => {
        const row = a as Record<string, unknown>;
        return row.status !== "error";
      }).length;
  const hasFailures = available < total;
  const platformName =
    state.data.platform === "ZAI"
      ? "Z.ai 团队版"
      : state.data.platform === "MIXED"
        ? "智谱多平台"
        : "智谱 BigModel 团队版";
  const timeWindow = asRecord(state.data.timeWindow);
  return {
    subtitle: `${total} 个 Key · ${platformName}`,
    meta:
      timeWindow?.start
        ? `${String(timeWindow.start)} 至 ${String(timeWindow.end ?? "")}`
        : "当前配额状态",
    status: {
      kind: state.error || hasFailures ? "warning" : "ready",
      label: `${available} / ${total} 可用`,
    },
  };
}
