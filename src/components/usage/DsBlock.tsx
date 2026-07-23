import {
  clampPercent,
  formatCurrency,
  formatDateTime,
  formatFullDateTime,
  formatNumber,
  remainingTone,
} from "../../lib/format";
import { Countdown, Notice, RemainingMeter, StateCard } from "./Shared";
import type { ProviderState } from "./GptBlock";

function dsResetPeriodLabel(value: unknown): string {
  const labels: Record<string, string> = {
    daily: "每日重置",
    weekly: "每周重置",
    monthly: "每月重置",
    yearly: "每年重置",
  };
  return labels[String(value || "").toLowerCase()] || "周期重置";
}

export function DsBlock({
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
      </div>
    );
  }

  if (!state.data) {
    const unconfigured = state.errorCode === "DS_NOT_CONFIGURED";
    return (
      <StateCard
        title={unconfigured ? "未配置 DS 用量" : "DS 查询失败"}
        message={
          unconfigured
            ? "DS 用量尚未完成配置，请检查应用设置。"
            : state.error || "暂时无法获取 DS 订阅数据。"
        }
        isError={!unconfigured}
      />
    );
  }

  const data = state.data;
  const usedPercent = clampPercent(data.usedPercent);
  const remainingPercent = clampPercent(100 - usedPercent);
  const tone = remainingTone(remainingPercent);
  const days = Number(data.remainingDays);

  return (
    <>
      {state.error ? (
        <Notice>
          本次刷新失败，当前展示上一次成功数据：{state.error}
        </Notice>
      ) : null}
      <article className="ds-subscription-card">
        <div className="ds-plan-row">
          <div>
            <span className="ds-kicker">当前订阅</span>
            <h3>{String(data.planTitle || "当前套餐")}</h3>
          </div>
          <span className="ds-validity">
            {Number.isFinite(days)
              ? `剩余 ${formatNumber(days)} 天`
              : "订阅有效"}
          </span>
        </div>

        <div className={`ds-balance${tone ? ` ${tone}` : ""}`}>
          <span className="ds-balance-label">剩余额度</span>
          <strong className="ds-balance-value">
            {formatCurrency(data.remaining)}
          </strong>
          <span className="ds-quota-line">
            已用 {formatCurrency(data.used)} / 总额度{" "}
            {formatCurrency(data.total)}
          </span>
        </div>

        <div className="ds-usage">
          <div className="ds-usage-head">
            <strong className={tone || undefined}>
              剩余 {Math.round(remainingPercent)}%
            </strong>
            <span>
              已用 {Math.round(usedPercent)}% ·{" "}
              {dsResetPeriodLabel(data.resetPeriod)}
            </span>
          </div>
          <RemainingMeter percent={remainingPercent} />
        </div>

        <div className="ds-date-grid">
          <div className="ds-date-item">
            <span className="ds-date-label">有效至</span>
            <strong className="ds-date-value">
              {formatFullDateTime(data.endAt)}
            </strong>
          </div>
          <div className="ds-date-item">
            <span className="ds-date-label">下一次重置</span>
            <strong className="ds-date-value">
              {formatFullDateTime(data.nextResetAt)}
            </strong>
            <Countdown
              resetAt={data.nextResetAt}
              now={now}
              className="ds-reset-countdown"
            />
          </div>
        </div>
      </article>
    </>
  );
}

export function dsPanelMeta(
  state: ProviderState<Record<string, unknown>>
): { subtitle: string; meta: string; status: { kind: string; label: string } } {
  if (state.loading) {
    return {
      subtitle: "订阅额度",
      meta: "正在获取订阅额度",
      status: { kind: "", label: "同步中" },
    };
  }
  if (!state.data) {
    const unconfigured = state.errorCode === "DS_NOT_CONFIGURED";
    return {
      subtitle: "订阅额度",
      meta: unconfigured ? "DS 用量尚未配置" : "未取得 DS 订阅额度",
      status: {
        kind: unconfigured ? "warning" : "error",
        label: unconfigured ? "待配置" : "不可用",
      },
    };
  }
  return {
    subtitle: `${String(state.data.planTitle || "当前套餐")} · ${dsResetPeriodLabel(state.data.resetPeriod)}`,
    meta: `DeepSeek 订阅额度 · 更新于 ${formatDateTime(state.data.updatedAt)}`,
    status: {
      kind: state.error ? "warning" : "ready",
      label: state.error ? "上次数据" : "已同步",
    },
  };
}
