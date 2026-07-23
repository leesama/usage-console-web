import { formatNumber, formatUsageCurrency } from "../../lib/format";
import { Notice, StateCard } from "./Shared";
import type { ProviderState } from "./GptBlock";

export function KeyUsageBlock({
  state,
}: {
  state: ProviderState<Record<string, unknown>>;
}) {
  if (state.loading) {
    return (
      <div className="skeleton-stack key-skeleton" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (!state.data) {
    const unconfigured = state.errorCode === "GPT_NOT_CONFIGURED";
    return (
      <StateCard
        title={unconfigured ? "未配置 GPT Key 用量" : "Key 用量查询失败"}
        message={
          unconfigured
            ? "GPT Key 用量尚未完成配置，请检查应用设置。"
            : state.error || "暂时无法获取 Key 用量。"
        }
        isError={!unconfigured}
      />
    );
  }

  const rows = Array.isArray(state.data.keys)
    ? (state.data.keys as Record<string, unknown>[])
    : [];
  const hasTotal =
    Boolean(state.data.has_total_usage) &&
    rows.some((row) => Number.isFinite(Number(row.total_usage)));

  if (!rows.length) {
    return (
      <>
        {state.error ? (
          <Notice>
            本次刷新失败，当前展示上一次成功数据：{state.error}
          </Notice>
        ) : null}
        <StateCard title="暂无 Key" message="当前暂无可展示的 Key。" />
      </>
    );
  }

  const headers = [
    ["名称", "key-name"],
    ["并发数", ""],
    ["今日用量", ""],
    ["近 30 天用量", ""],
  ] as Array<[string, string]>;
  if (hasTotal) headers.push(["总用量", ""]);

  return (
    <>
      {state.error ? (
        <Notice>
          本次刷新失败，当前展示上一次成功数据：{state.error}
        </Notice>
      ) : null}
      <div
        className={`key-table${hasTotal ? " has-total" : ""}`}
        role="table"
        aria-label="GPT Key 用量"
      >
        <div className="key-row key-table-head" role="row">
          {headers.map(([label, className]) => (
            <div
              key={label}
              className={`key-cell${className ? ` ${className}` : ""}`}
              data-label={label}
              role="columnheader"
            >
              {label}
            </div>
          ))}
        </div>
        {rows.map((row, index) => (
          <div className="key-row" role="row" key={String(row.id ?? index)}>
            <div className="key-cell key-name" data-label="名称" role="cell">
              {String(row.name || "未命名 Key")}
            </div>
            <div className="key-cell" data-label="并发数" role="cell">
              {formatNumber(row.concurrency)}
            </div>
            <div className="key-cell" data-label="今日用量" role="cell">
              {formatUsageCurrency(row.today_usage)}
            </div>
            <div className="key-cell" data-label="近 30 天用量" role="cell">
              {formatUsageCurrency(row.last_30_days_usage)}
            </div>
            {hasTotal ? (
              <div className="key-cell" data-label="总用量" role="cell">
                {formatUsageCurrency(row.total_usage)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

export function keyUsagePanelMeta(
  state: ProviderState<Record<string, unknown>>
): { subtitle: string; meta: string; status: { kind: string; label: string } } {
  if (state.loading) {
    return {
      subtitle: "正在读取 Key 列表",
      meta: "正在统计今日与近 30 天用量",
      status: { kind: "", label: "同步中" },
    };
  }
  if (!state.data) {
    const unconfigured = state.errorCode === "GPT_NOT_CONFIGURED";
    return {
      subtitle: "Key 用量",
      meta: unconfigured ? "GPT Key 用量尚未配置" : "未取得 Key 用量",
      status: {
        kind: unconfigured ? "warning" : "error",
        label: unconfigured ? "待配置" : "不可用",
      },
    };
  }
  const rows = Array.isArray(state.data.keys) ? state.data.keys : [];
  return {
    subtitle: `${rows.length} 个 Key`,
    meta: "实际费用统计，单位 USD · 暂无额度上限",
    status: {
      kind: state.error ? "warning" : "ready",
      label: state.error ? "上次数据" : "已同步",
    },
  };
}
