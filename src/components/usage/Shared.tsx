import type { ReactNode } from "react";
import {
  clampPercent,
  formatCompact,
  formatCurrency,
  formatNumber,
  formatRemaining,
  isResetSoon,
  remainingTone,
} from "../../lib/format";

export function StateCard({
  title,
  message,
  isError = false,
  codeText,
}: {
  title: string;
  message: string;
  isError?: boolean;
  codeText?: string | null;
}) {
  return (
    <div className={`state-card${isError ? " error" : ""}`}>
      <h3>{title}</h3>
      <p>{message}</p>
      {codeText ? <code>{codeText}</code> : null}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}

export function RemainingMeter({ percent }: { percent: number }) {
  const safe = clampPercent(percent);
  const tone = remainingTone(safe);
  return (
    <div
      className="meter remaining-meter"
      role="progressbar"
      aria-label={`剩余 ${safe}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
    >
      <div
        className={`meter-fill${tone ? ` ${tone}` : ""}`}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export function Countdown({
  resetAt,
  now,
  warnResetSoon = false,
  className = "countdown",
}: {
  resetAt: unknown;
  now: number;
  warnResetSoon?: boolean;
  className?: string;
}) {
  const soon = warnResetSoon && isResetSoon(resetAt, now);
  return (
    <span className={`${className}${soon ? " reset-soon" : ""}`.trim()}>
      {formatRemaining(resetAt, now)}
    </span>
  );
}

export function RemainingWindow({
  title,
  remainingPercent,
  usedLabel,
  resetAt,
  warnResetSoon = false,
  now,
  stats,
}: {
  title: string;
  remainingPercent: number;
  usedLabel: string;
  resetAt?: unknown;
  warnResetSoon?: boolean;
  now: number;
  stats?: {
    requests?: unknown;
    tokens?: unknown;
    cost?: unknown;
  } | null;
}) {
  const tone = remainingTone(remainingPercent);
  const display =
    Number.isFinite(remainingPercent)
      ? remainingPercent % 1 === 0
        ? String(remainingPercent)
        : remainingPercent.toFixed(1)
      : "0";

  return (
    <article className="usage-window remaining-window">
      <div className="usage-head">
        <h3 className="usage-title">{title}</h3>
        <div className={`usage-value remaining-value${tone ? ` ${tone}` : ""}`}>
          <span className="usage-number">{display}</span>
          <small>% 剩余</small>
        </div>
      </div>
      <RemainingMeter percent={remainingPercent} />
      <div className="usage-meta">
        <span>{usedLabel}</span>
        <Countdown
          resetAt={resetAt}
          now={now}
          warnResetSoon={warnResetSoon}
        />
      </div>
      {stats ? (
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">请求</span>
            <span className="stat-value">{formatNumber(stats.requests)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Tokens</span>
            <span className="stat-value">{formatCompact(stats.tokens)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">费用估算</span>
            <span className="stat-value">{formatCurrency(stats.cost)}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function ResetCreditsCard({
  availableCount,
  soonestExpiresAt,
  now,
}: {
  availableCount: number;
  soonestExpiresAt: unknown;
  now: number;
}) {
  return (
    <article className="usage-window">
      <div className="usage-head">
        <h3 className="usage-title">剩余重置次数</h3>
        <div className="usage-value">
          <span className="usage-number">{formatNumber(availableCount)}</span>
          <small>次</small>
        </div>
      </div>
      <div className="usage-meta">
        <span>用尽后可手动重置用量窗口</span>
        <Countdown
          resetAt={soonestExpiresAt}
          now={now}
          warnResetSoon
        />
      </div>
    </article>
  );
}
