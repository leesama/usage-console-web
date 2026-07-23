import {
  clampPercent,
  formatDateTime,
  formatPercent,
  toMilliseconds,
} from "../../lib/format";
import {
  Notice,
  RemainingWindow,
  ResetCreditsCard,
  StateCard,
} from "./Shared";

export type ProviderState<T> = {
  data: T | null;
  error: string | null;
  errorCode?: string | null;
  loading: boolean;
};

type WindowData = {
  utilization?: unknown;
  resets_at?: unknown;
  window_stats?: {
    requests?: unknown;
    tokens?: unknown;
    cost?: unknown;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function soonestCreditExpiry(credits: Record<string, unknown>): unknown {
  if (!Array.isArray(credits.credits)) return null;
  const times = credits.credits
    .map((item) => {
      const row = asRecord(item);
      return row?.expires_at;
    })
    .filter((v) => v != null && v !== "")
    .map((raw) => ({ raw, ms: toMilliseconds(raw) }))
    .filter((o): o is { raw: unknown; ms: number } => Number.isFinite(o.ms));
  if (!times.length) return null;
  times.sort((a, b) => a.ms - b.ms);
  return times[0].raw;
}

export function GptBlock({
  usage,
  quota,
  now,
}: {
  usage: ProviderState<Record<string, unknown>>;
  quota: ProviderState<Record<string, unknown>>;
  now: number;
}) {
  if (usage.loading || quota.loading) {
    return (
      <div className="skeleton-stack" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (!usage.data) {
    const unconfigured = usage.errorCode === "GPT_NOT_CONFIGURED";
    return (
      <StateCard
        title={unconfigured ? "未配置 GPT 用量" : "GPT 查询失败"}
        message={
          unconfigured
            ? "GPT 用量尚未完成配置，请检查应用设置。"
            : usage.error || "暂时无法获取 GPT 数据。"
        }
        isError={!unconfigured}
      />
    );
  }

  const fiveHour = asRecord(usage.data.five_hour) as WindowData | null;
  const sevenDay = asRecord(usage.data.seven_day) as WindowData | null;
  const windows: Array<[string, WindowData | null]> = [
    ["5 小时窗口", fiveHour],
    ["7 天窗口", sevenDay],
  ];

  let rendered = 0;
  const cards = windows.map(([title, data]) => {
    if (!data) return null;
    const usedPercent = clampPercent(data.utilization);
    const remainingPercent = clampPercent(100 - usedPercent);
    rendered += 1;
    return (
      <RemainingWindow
        key={title}
        title={title}
        remainingPercent={remainingPercent}
        usedLabel={`已用 ${formatPercent(usedPercent)}%`}
        resetAt={data.resets_at}
        warnResetSoon
        now={now}
        stats={data.window_stats}
      />
    );
  });

  const resetCredits = (() => {
    if (quota.error && !quota.data) {
      return (
        <StateCard
          title="重置次数查询失败"
          message={quota.error}
          isError
        />
      );
    }
    if (!quota.data) return null;
    const credits = asRecord(quota.data.rate_limit_reset_credits);
    if (!credits || !Number.isFinite(Number(credits.available_count))) {
      return null;
    }
    return (
      <ResetCreditsCard
        availableCount={Number(credits.available_count)}
        soonestExpiresAt={soonestCreditExpiry(credits)}
        now={now}
      />
    );
  })();

  if (rendered === 0 && !resetCredits) {
    return (
      <StateCard
        title="暂无窗口数据"
        message="当前暂无 5 小时或 7 天窗口数据。"
      />
    );
  }

  return (
    <>
      {usage.error ? (
        <Notice>
          本次刷新失败，当前展示上一次成功数据：{usage.error}
        </Notice>
      ) : null}
      {cards}
      {resetCredits}
    </>
  );
}

export function gptPanelMeta(
  usage: ProviderState<Record<string, unknown>>,
  quota: ProviderState<Record<string, unknown>>
): { subtitle: string; meta: string; status: { kind: string; label: string } } {
  if (usage.loading || quota.loading) {
    return {
      subtitle: "GPT 用量",
      meta: "正在获取 5 小时与 7 天用量",
      status: { kind: "", label: "同步中" },
    };
  }
  if (!usage.data) {
    const unconfigured = usage.errorCode === "GPT_NOT_CONFIGURED";
    return {
      subtitle: "GPT 用量",
      meta: unconfigured ? "GPT 用量尚未配置" : "未取得 GPT 用量",
      status: {
        kind: unconfigured ? "warning" : "error",
        label: unconfigured ? "待配置" : "不可用",
      },
    };
  }
  return {
    subtitle: `账户 ${String(usage.data.account_id ?? 2)}`,
    meta: `数据更新于 ${formatDateTime(usage.data.updated_at)}`,
    status: {
      kind: usage.error || quota.error ? "warning" : "ready",
      label: usage.error || quota.error ? "上次数据" : "已同步",
    },
  };
}
