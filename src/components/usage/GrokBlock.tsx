import { formatFullDateTime, formatNumber } from "../../lib/format";
import { Notice, StateCard } from "./Shared";
import type { ProviderState } from "./GptBlock";
import "../../styles/grok-overlay.css";

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function GrokCountCard({
  label,
  value,
  description,
  kind = "",
}: {
  label: string;
  value: number;
  description: string;
  kind?: string;
}) {
  return (
    <article
      className={`usage-window grok-account-stat${kind ? ` ${kind}` : ""}`}
    >
      <div className="usage-head">
        <h3 className="usage-title">{label}</h3>
        <div className="usage-value">
          <span className="usage-number">{formatNumber(value)}</span>
          <small>个</small>
        </div>
      </div>
      <div className="usage-meta">
        <span>{description}</span>
      </div>
    </article>
  );
}

export function GrokBlock({
  state,
}: {
  state: ProviderState<Record<string, unknown>>;
}) {
  if (state.loading) {
    return (
      <div className="skeleton-stack grok-account-skeleton" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (!state.data) {
    return (
      <StateCard
        title="Grok 账号统计失败"
        message={state.error || "暂时无法读取账号调度状态，请稍后重试。"}
        isError
      />
    );
  }

  const available = count(state.data.available_count);
  const unavailable = count(state.data.unavailable_count);
  const total = count(state.data.total_count);

  return (
    <>
      {state.error ? (
        <Notice>
          本次刷新失败，当前展示上一次成功数据：{state.error}
        </Notice>
      ) : null}
      <GrokCountCard
        label="可用账号"
        value={available}
        description="当前可进入调度"
        kind="is-available"
      />
      <GrokCountCard
        label="暂不可用"
        value={unavailable}
        description="当前不可调度"
        kind={unavailable > 0 ? "is-warning" : ""}
      />
      <GrokCountCard
        label="账号总数"
        value={total}
        description="平台为 Grok 的账号"
      />
    </>
  );
}

export function grokPanelMeta(
  state: ProviderState<Record<string, unknown>>
): { subtitle: string; meta: string; status: { kind: string; label: string } } {
  if (state.loading) {
    return {
      subtitle: "账号调度",
      meta: "按账号当前可调度状态统计",
      status: { kind: "", label: "同步中" },
    };
  }

  if (!state.data) {
    return {
      subtitle: "账号调度",
      meta: "Grok · 读取失败",
      status: { kind: "error", label: "查询失败" },
    };
  }

  const stale = Boolean(state.data.stale);
  const usingPreviousData = Boolean(state.error);
  const updatedAt = state.data.updated_at
    ? formatFullDateTime(state.data.updated_at)
    : "刚刚";

  return {
    subtitle: "账号调度",
    meta: `${stale ? "上次可用数据" : "实时调度状态"} · 更新于 ${updatedAt}`,
    status: usingPreviousData
      ? { kind: "warning", label: "上次数据" }
      : stale
        ? { kind: "warning", label: "缓存数据" }
        : { kind: "ready", label: "已连接" },
  };
}
