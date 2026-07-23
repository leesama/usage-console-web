const numberFormatter = new Intl.NumberFormat("zh-CN");
const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const preciseCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function formatNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormatter.format(number) : "-";
}

export function formatCompact(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? compactFormatter.format(number) : "-";
}

export function formatCurrency(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? currencyFormatter.format(number) : "-";
}

export function formatUsageCurrency(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (number !== 0 && Math.abs(number) < 0.01) {
    return preciseCurrencyFormatter.format(number);
  }
  return currencyFormatter.format(number);
}

export function formatPercent(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(number % 1 === 0 ? 0 : 1);
}

export function clampPercent(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function toMilliseconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (/^\d+$/.test(String(value))) {
    const numeric = Number(value);
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatDateTime(value: unknown): string {
  const timestamp = toMilliseconds(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatFullDateTime(value: unknown): string {
  const timestamp = toMilliseconds(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatRemaining(value: unknown, now = Date.now()): string {
  const timestamp = toMilliseconds(value);
  if (!timestamp) return "重置时间未知";
  const difference = timestamp - now;
  if (difference <= 0) return "等待窗口更新";
  const totalMinutes = Math.floor(difference / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} 天 ${hours} 小时后重置`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟后重置`;
  return `${Math.max(minutes, 1)} 分钟后重置`;
}

const RESET_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isResetSoon(value: unknown, now = Date.now()): boolean {
  const timestamp = toMilliseconds(value);
  if (!timestamp) return false;
  const difference = timestamp - now;
  return difference > 0 && difference < RESET_SOON_THRESHOLD_MS;
}

export function remainingTone(percent: unknown): string {
  const safePercent = clampPercent(percent);
  if (safePercent <= 10) return "remaining-critical";
  if (safePercent <= 30) return "remaining-warning";
  return "";
}
