  "use strict";

  const REFRESH_MS = 60000;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const numberFormatter = new Intl.NumberFormat("zh-CN");
  const compactFormatter = new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  });
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
  const preciseCurrencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });

  const state = {
    glm: null,
    gpt: null,
    gptQuota: null,
    keyUsage: null,
    ds: null,
    glmError: null,
    gptError: null,
    gptQuotaError: null,
    keyUsageError: null,
    dsError: null,
    loading: false,
    lastUpdated: null,
    autoTimer: null
  };

  class ApiError extends Error {
    constructor(message, code) {
      super(message);
      this.name = "ApiError";
      this.code = code || "UNKNOWN";
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function lockedTheme() {
    const value = document.documentElement.dataset.themeLock;
    return value === "light" || value === "dark" ? value : null;
  }

  function updateThemeControl() {
    const locked = lockedTheme();
    const theme = locked || (document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const button = byId("themeBtn");
    const isDark = theme === "dark";

    if (locked) {
      document.documentElement.dataset.theme = locked;
      document.documentElement.dataset.themePreference = "locked";
      button.textContent = locked === "dark" ? "深空主题" : "明亮主题";
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("aria-label", "宇宙座舱已固定使用高对比深空主题");
      button.disabled = true;
      return;
    }

    button.textContent = isDark ? "深色主题" : "浅色主题";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "当前为深色主题，切换为浅色主题" : "当前为浅色主题，切换为深色主题"
    );
  }

  function applyTheme(theme, persist) {
    const locked = lockedTheme();
    const effectiveTheme = locked || theme;
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.themePreference = locked ? "locked" : (persist ? "manual" : "system");
    if (persist && !locked) {
      try {
        localStorage.setItem("usage-theme", effectiveTheme);
      } catch (_) {
        document.documentElement.dataset.themePreference = "manual";
      }
    }
    updateThemeControl();
    if (window.TokenPulse) window.TokenPulse.themeChanged();
  }

  function toggleTheme() {
    if (lockedTheme()) return;
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyTheme(current === "dark" ? "light" : "dark", true);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function append(parent) {
    for (let index = 1; index < arguments.length; index += 1) {
      const child = arguments[index];
      if (child) parent.appendChild(child);
    }
    return parent;
  }

  async function requestJson(path, options) {
    const method = (options && options.method) || "GET";
    const headers = {
      "Accept": "application/json"
    };
    // same-origin: works with Vite /api proxy and with monolithic backend.
    // credentials included so session cookies always attach.
    const init = {
      method: method,
      credentials: "include",
      headers: headers,
      cache: "no-store"
    };
    if (options && options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, init);
    const data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      if (response.status === 401) {
        window.location.replace("/login?expired=1");
      }
      throw new ApiError(data.error || ("请求失败，HTTP " + response.status), data.code);
    }
    return data;
  }

  async function revealGlmKey(keyId) {
    const data = await requestJson("/api/usage/reveal-key", {
      method: "POST",
      body: { id: keyId }
    });
    const apiKey = typeof data.apiKey === "string" ? data.apiKey : "";
    if (!apiKey) {
      throw new ApiError("未返回完整 Key", "KEY_EMPTY");
    }
    return apiKey;
  }

  async function initializeSession() {
    try {
      const session = await requestJson("/api/auth/session");
      if (session.mode === "password") {
        byId("sessionUser").textContent = session.username || "当前账号";
        byId("authControls").hidden = false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function logout() {
    const button = byId("logoutBtn");
    button.disabled = true;
    button.textContent = "正在退出";
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
    } finally {
      window.location.replace("/login");
    }
  }

  function setProviderStatus(provider, kind, label) {
    const badge = byId(provider + "Status");
    badge.className = "status-badge" + (kind ? " " + kind : "");
    badge.textContent = label;
    if (kind) {
      const surface = badge.closest(".gpt-pane") || badge.closest(".provider-panel");
      if (surface) {
        surface.classList.remove("just-updated");
        requestAnimationFrame(function () {
          surface.classList.add("just-updated");
          window.setTimeout(function () {
            surface.classList.remove("just-updated");
          }, 950);
        });
      }
    }
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? numberFormatter.format(number) : "-";
  }

  function formatCompact(value) {
    const number = Number(value);
    return Number.isFinite(number) ? compactFormatter.format(number) : "-";
  }

  function formatCurrency(value) {
    const number = Number(value);
    return Number.isFinite(number) ? currencyFormatter.format(number) : "-";
  }

  function formatUsageCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    if (number !== 0 && Math.abs(number) < 0.01) {
      return preciseCurrencyFormatter.format(number);
    }
    return currencyFormatter.format(number);
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toFixed(number % 1 === 0 ? 0 : 1);
  }

  function clampPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, number));
  }

  function toMilliseconds(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") {
      return value < 1000000000000 ? value * 1000 : value;
    }
    if (/^\d+$/.test(String(value))) {
      const numeric = Number(value);
      return numeric < 1000000000000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function formatDateTime(value) {
    const timestamp = toMilliseconds(value);
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function formatFullDateTime(value) {
    const timestamp = toMilliseconds(value);
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function formatRemaining(value) {
    const timestamp = toMilliseconds(value);
    if (!timestamp) return "重置时间未知";
    const difference = timestamp - Date.now();
    if (difference <= 0) return "等待窗口更新";
    const totalMinutes = Math.floor(difference / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return days + " 天 " + hours + " 小时后重置";
    if (hours > 0) return hours + " 小时 " + minutes + " 分钟后重置";
    return Math.max(minutes, 1) + " 分钟后重置";
  }

  const RESET_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  function isResetSoon(value, now) {
    const timestamp = toMilliseconds(value);
    const reference = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    if (!timestamp) return false;
    const difference = timestamp - reference;
    return difference > 0 && difference < RESET_SOON_THRESHOLD_MS;
  }

  function updateCountdownNode(node) {
    const now = Date.now();
    node.textContent = formatRemaining(node.dataset.resetAt);
    node.classList.toggle(
      "reset-soon",
      node.dataset.warnResetSoon === "true" && isResetSoon(node.dataset.resetAt, now)
    );
  }

  function remainingTone(percent) {
    const safePercent = clampPercent(percent);
    if (safePercent <= 10) return "remaining-critical";
    if (safePercent <= 30) return "remaining-warning";
    return "";
  }

  function remainingMeter(percent) {
    const root = element("div", "meter remaining-meter");
    const fill = element("div", "meter-fill");
    const safePercent = clampPercent(percent);
    const targetWidth = safePercent + "%";
    fill.style.width = reducedMotionQuery.matches ? targetWidth : "0%";
    const tone = remainingTone(safePercent);
    if (tone) fill.classList.add(tone);
    root.setAttribute("role", "progressbar");
    root.setAttribute("aria-label", "剩余 " + formatPercent(safePercent) + "%");
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", "100");
    root.setAttribute("aria-valuenow", String(safePercent));
    root.appendChild(fill);
    if (!reducedMotionQuery.matches) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fill.style.width = targetWidth;
        });
      });
    }
    return root;
  }

  function animatePercent(node, value) {
    const target = clampPercent(value);
    if (reducedMotionQuery.matches) {
      node.textContent = formatPercent(target);
      return;
    }

    const start = performance.now();
    const duration = 720;
    function step(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = formatPercent(target * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function notice(message) {
    return element("div", "notice", message);
  }

  function stateCard(title, message, isError, codeText) {
    const card = element("div", "state-card" + (isError ? " error" : ""));
    append(card, element("h3", "", title), element("p", "", message));
    if (codeText) card.appendChild(element("code", "", codeText));
    return card;
  }

  function remainingWindow(options) {
    const card = element("article", "usage-window remaining-window");
    const head = element("div", "usage-head");
    const title = element("h3", "usage-title", options.title);
    const value = element("div", "usage-value remaining-value");
    const tone = remainingTone(options.remainingPercent);
    if (tone) value.classList.add(tone);
    const number = element("span", "usage-number", "0");
    append(value, number, element("small", "", "% 剩余"));
    animatePercent(number, options.remainingPercent);
    append(head, title, value);
    append(card, head, remainingMeter(options.remainingPercent));

    const meta = element("div", "usage-meta");
    const countdown = element("span", "countdown", formatRemaining(options.resetAt));
    if (options.resetAt) countdown.dataset.resetAt = String(options.resetAt);
    if (options.warnResetSoon) countdown.dataset.warnResetSoon = "true";
    updateCountdownNode(countdown);
    append(
      meta,
      element("span", "", options.usedLabel),
      countdown
    );
    card.appendChild(meta);

    if (options.stats) {
      const stats = element("div", "stat-grid");
      const items = [
        ["请求", formatNumber(options.stats.requests)],
        ["Tokens", formatCompact(options.stats.tokens)],
        ["费用估算", formatCurrency(options.stats.cost)]
      ];
      items.forEach(function (item) {
        const stat = element("div", "stat");
        append(stat, element("span", "stat-label", item[0]), element("span", "stat-value", item[1]));
        stats.appendChild(stat);
      });
      card.appendChild(stats);
    }

    if (Array.isArray(options.details) && options.details.length > 0) {
      const tags = element("div", "detail-tags");
      options.details.forEach(function (detail) {
        const label = (detail.modelCode || detail.model_code || "工具") + ": " + formatNumber(detail.usage);
        tags.appendChild(element("span", "detail-tag", label));
      });
      card.appendChild(tags);
    }
    return card;
  }

  // 剩余重置次数卡片：展示 rate_limit_reset_credits.available_count 及额度过期倒计时。
  // 复用 .usage-window 视觉，但语义是「可用次数」而非百分比，故不走 meter。
  function resetCreditsCard(credits) {
    const card = element("article", "usage-window");
    const head = element("div", "usage-head");
    const title = element("h3", "usage-title", "剩余重置次数");
    const value = element("div", "usage-value");
    const number = element("span", "usage-number", formatNumber(credits.available_count));
    append(value, number, element("small", "", "次"));
    append(head, title, value);
    append(card, head);

    const meta = element("div", "usage-meta");
    const soonest = credits.soonest_expires_at;
    const countdown = element("span", "countdown", formatRemaining(soonest));
    if (soonest) countdown.dataset.resetAt = String(soonest);
    countdown.dataset.warnResetSoon = "true";
    updateCountdownNode(countdown);
    append(
      meta,
      element("span", "", "用尽后可手动重置用量窗口"),
      countdown
    );
    card.appendChild(meta);

    return card;
  }

  // 从 quota 响应解析剩余重置次数，挑出最近过期的额度，渲染进 fragment。
  function appendResetCredits(fragment, quota, quotaError) {
    if (quotaError) {
      fragment.appendChild(stateCard("重置次数查询失败", quotaError.message, true));
      return;
    }
    if (!quota) return; // 首次加载未拿到数据，静默跳过

    const credits = quota.rate_limit_reset_credits;
    if (!credits || !Number.isFinite(Number(credits.available_count))) return;

    // credits.credits[] 每项含 expires_at；取最早过期的一个作为「额度过期」倒计时。
    let soonest = null;
    if (Array.isArray(credits.credits)) {
      const times = credits.credits
        .map(function (c) { return c && c.expires_at; })
        .filter(function (v) { return v; })
        .map(function (v) { return { raw: v, ms: toMilliseconds(v) }; })
        .filter(function (o) { return Number.isFinite(o.ms); });
      if (times.length > 0) {
        times.sort(function (a, b) { return a.ms - b.ms; });
        soonest = times[0].raw;
      }
    }

    fragment.appendChild(resetCreditsCard({
      available_count: Number(credits.available_count),
      soonest_expires_at: soonest
    }));
  }

  function normalizeRows(payload) {
    if (!payload || (typeof payload === "object" && Object.keys(payload).length === 0)) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.list)) return payload.list;
    if (Array.isArray(payload.usage)) return payload.usage;
    if (payload.usage && typeof payload.usage === "object") return [payload.usage];
    return [payload];
  }

  function humanizeKey(key) {
    const labels = {
      model: "模型",
      modelCode: "模型",
      model_code: "模型",
      name: "名称",
      usage: "用量",
      count: "次数",
      tokens: "Tokens",
      inputTokens: "输入 Tokens",
      outputTokens: "输出 Tokens",
      input_tokens: "输入 Tokens",
      output_tokens: "输出 Tokens",
      cost: "费用"
    };
    return labels[key] || key;
  }

  function displayCell(value) {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "number") return formatNumber(value);
    return String(value);
  }

  function dataTable(payload) {
    const rows = normalizeRows(payload);
    if (rows.length === 0) {
      return element("div", "empty-copy", "当前接口未返回维度明细。");
    }

    const keys = [];
    rows.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      Object.keys(row).forEach(function (key) {
        if (!keys.includes(key)) keys.push(key);
      });
    });
    if (keys.length === 0) return element("div", "empty-copy", "当前接口未返回可展示字段。");

    const wrap = element("div", "table-wrap");
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    keys.forEach(function (key) {
      headRow.appendChild(element("th", "", humanizeKey(key)));
    });
    head.appendChild(headRow);

    const body = document.createElement("tbody");
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      keys.forEach(function (key) {
        const value = row && typeof row === "object" ? row[key] : row;
        const td = element("td", typeof value === "number" ? "numeric" : "", displayCell(value));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    append(table, head, body);
    wrap.appendChild(table);
    return wrap;
  }

  function disclosure(title, payload, error) {
    const details = document.createElement("details");
    details.appendChild(element("summary", "", title));
    const body = element("div", "detail-body");
    if (error) body.appendChild(element("div", "empty-copy", error));
    else body.appendChild(dataTable(payload));
    details.appendChild(body);
    return details;
  }

  function glmLimit(account, matcher) {
    const limits = account && account.quotaLimit && account.quotaLimit.limits;
    if (!Array.isArray(limits)) return null;
    return limits.find(function (item) {
      return matcher(String(item && item.type || ""), item || {});
    }) || null;
  }

  function glmRemainingPercent(item) {
    const used = Number(item && item.percentage);
    return Number.isFinite(used) ? clampPercent(100 - used) : null;
  }

  function glmWeeklyRemaining(account) {
    return glmRemainingPercent(glmLimit(account, function (type) {
      return type.includes("每周");
    }));
  }

  function glmCompactMetric(label, item, kind) {
    const metric = element("div", "glm-metric" + (kind === "weekly" ? " is-weekly" : ""));
    metric.appendChild(element("span", "glm-metric-label", label));

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
        : (Number.isFinite(total) && Number.isFinite(current) ? Math.max(0, total - current) : null);
      if (remaining !== null) {
        valueText = formatNumber(remaining);
        unitText = "次剩余";
        hasRemaining = true;
      }
      if (Number.isFinite(total) && total > 0 && Number.isFinite(current)) {
        progress = clampPercent((total - current) / total * 100);
        usageText = "已用 " + formatNumber(current) + " / " + formatNumber(total);
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
      if (Number.isFinite(used)) usageText = "已用 " + formatPercent(used) + "%";
    }

    const value = element("div", "glm-metric-value");
    append(value, element("strong", "", valueText), element("small", "", unitText));
    metric.appendChild(value);
    const tone = hasRemaining ? remainingTone(progress) : "";
    if (tone) metric.classList.add(tone);
    const track = element("div", "glm-mini-meter");
    const fill = element("span", "");
    fill.style.width = progress + "%";
    track.appendChild(fill);
    metric.appendChild(track);

    const meta = element("div", "glm-metric-meta");
    meta.appendChild(element("span", "", usageText));
    if (item && item.nextResetTime) {
      const countdown = element("span", "countdown", formatRemaining(item.nextResetTime));
      countdown.dataset.resetAt = String(item.nextResetTime);
      updateCountdownNode(countdown);
      meta.appendChild(countdown);
    }
    metric.appendChild(meta);
    return metric;
  }

  function fallbackCopyText(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.inset = "0 auto auto -9999px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      input.remove();
    }
    if (!copied) throw new Error("浏览器未允许写入剪贴板");
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    fallbackCopyText(text);
  }

  function glmKeySecret(account, index) {
    const keyId = typeof account.id === "string" && account.id
      ? account.id
      : ("key-" + (index + 1));
    const preview = typeof account.apiKeyPreview === "string"
      ? account.apiKeyPreview
      : (typeof account.apiKey === "string" ? account.apiKey : "");
    const label = account.label || ("Key " + (index + 1));
    const row = element("div", "glm-key-secret");
    row.appendChild(element("span", "glm-key-secret-label", "API Key"));
    const value = element("code", "glm-key-secret-value", preview || "未返回 Key");
    value.setAttribute("aria-label", "掩码 API Key");
    value.title = "默认仅显示掩码；复制前需确认并单独拉取完整 Key";
    row.appendChild(value);

    const button = element("button", "glm-copy-button", preview ? "复制" : "不可用");
    button.type = "button";
    button.disabled = !preview;
    button.setAttribute("aria-label", "确认后复制 " + label + " 的完整 Key");
    button.setAttribute("aria-live", "polite");
    if (preview) {
      let resetTimer = null;
      button.addEventListener("click", async function () {
        if (resetTimer) window.clearTimeout(resetTimer);
        const confirmed = window.confirm(
          "即将获取 " + label + " 的完整 API Key 并复制到剪贴板。\n\n"
          + "请勿在公共设备或屏幕共享时操作；完整 Key 仅短暂显示。"
        );
        if (!confirmed) {
          return;
        }
        button.disabled = true;
        button.classList.remove("is-copied", "is-error");
        button.textContent = "获取中";
        try {
          const apiKey = await revealGlmKey(keyId);
          await copyText(apiKey);
          value.textContent = apiKey;
          value.setAttribute("aria-label", "完整 API Key（短暂显示）");
          button.textContent = "已复制";
          button.classList.add("is-copied");
          resetTimer = window.setTimeout(function () {
            value.textContent = preview;
            value.setAttribute("aria-label", "掩码 API Key");
            button.textContent = "复制";
            button.classList.remove("is-copied", "is-error");
            button.disabled = false;
            resetTimer = null;
          }, 4000);
        } catch (_error) {
          value.textContent = preview;
          value.setAttribute("aria-label", "掩码 API Key");
          button.textContent = "复制失败";
          button.classList.add("is-error");
          resetTimer = window.setTimeout(function () {
            button.textContent = "复制";
            button.classList.remove("is-copied", "is-error");
            button.disabled = false;
            resetTimer = null;
          }, 1600);
        }
      });
    }
    row.appendChild(button);
    return row;
  }

  function glmAccountCard(account, index) {
    const card = element("section", "glm-key-card");
    const header = element("div", "glm-key-header");
    const identity = element("div", "glm-key-identity");
    const order = element("span", "glm-key-order", String(index + 1).padStart(2, "0"));
    append(identity, order, element("h3", "", account.label || ("Key " + (index + 1))));
    if (account.quotaLimit && account.quotaLimit.level) {
      identity.appendChild(element("span", "glm-plan-tag", String(account.quotaLimit.level).toUpperCase()));
    }

    const accountStatus = account.status || "ready";
    const statusClass = accountStatus === "ready" ? "ready" : (accountStatus === "partial" ? "warning" : "error");
    const statusText = accountStatus === "ready" ? "已同步" : (accountStatus === "partial" ? "部分可用" : "查询失败");
    append(header, identity, element("span", "glm-key-status " + statusClass, statusText));
    card.appendChild(header);
    card.appendChild(glmKeySecret(account, index));

    const requestError = account.errors && account.errors.request;
    const quotaError = account.errors && account.errors.quotaLimit;
    if (requestError || quotaError || !account.quotaLimit) {
      card.appendChild(element("div", "glm-key-error", requestError || quotaError || "暂无配额数据"));
      return card;
    }

    const metrics = element("div", "glm-key-metrics");
    append(
      metrics,
      glmCompactMetric("5 小时", glmLimit(account, function (type) { return type.includes("5 小时"); }), "token"),
      glmCompactMetric("周额度", glmLimit(account, function (type) { return type.includes("每周"); }), "weekly"),
      glmCompactMetric("MCP", glmLimit(account, function (type) { return type.includes("MCP"); }), "mcp")
    );
    card.appendChild(metrics);
    return card;
  }

  function renderGlm() {
    const content = byId("glmContent");
    content.setAttribute("aria-busy", "false");

    if (!state.glm) {
      const unconfigured = state.glmError && state.glmError.code === "GLM_NOT_CONFIGURED";
      setProviderStatus("glm", unconfigured ? "warning" : "error", unconfigured ? "待配置" : "不可用");
      byId("glmSubtitle").textContent = "多 Key 用量";
      byId("glmMeta").textContent = "未取得 GLM 用量";
      content.replaceChildren(
        stateCard(
          unconfigured ? "未配置 GLM" : "GLM 查询失败",
          unconfigured
            ? "GLM 用量尚未完成配置，请检查应用设置。"
            : (state.glmError ? state.glmError.message : "暂时无法获取 GLM 数据。"),
          !unconfigured
        )
      );
      return;
    }

    const accounts = Array.isArray(state.glm.accounts)
      ? state.glm.accounts
      : [Object.assign({ label: "Key 1", status: "ready" }, state.glm)];
    const total = Number(state.glm.total) || accounts.length;
    const available = Number.isFinite(Number(state.glm.available))
      ? Number(state.glm.available)
      : accounts.filter(function (account) { return account.status !== "error"; }).length;
    const hasFailures = available < total;
    setProviderStatus(
      "glm",
      state.glmError || hasFailures ? "warning" : "ready",
      available + " / " + total + " 可用"
    );
    const platformName = state.glm.platform === "ZAI"
      ? "Z.ai 团队版"
      : (state.glm.platform === "MIXED" ? "智谱多平台" : "智谱 BigModel 团队版");
    byId("glmSubtitle").textContent = total + " 个 Key · " + platformName;
    if (state.glm.timeWindow && state.glm.timeWindow.start) {
      byId("glmMeta").textContent = state.glm.timeWindow.start + " 至 " + state.glm.timeWindow.end;
    } else {
      byId("glmMeta").textContent = "当前配额状态";
    }

    const fragment = document.createDocumentFragment();
    if (state.glmError) fragment.appendChild(notice("本次刷新失败，当前展示上一次成功数据：" + state.glmError.message));
    if (hasFailures) fragment.appendChild(notice("部分 Key 暂时不可用，其余 Key 的数据已正常更新。"));

    const sortedAccounts = accounts.slice().sort(function (left, right) {
      const leftRemaining = glmWeeklyRemaining(left);
      const rightRemaining = glmWeeklyRemaining(right);
      const leftScore = Number.isFinite(leftRemaining) ? leftRemaining : -1;
      const rightScore = Number.isFinite(rightRemaining) ? rightRemaining : -1;
      return rightScore - leftScore || String(left.label || "").localeCompare(String(right.label || ""), "zh-CN", { numeric: true });
    });
    const list = element("div", "glm-key-list");
    sortedAccounts.forEach(function (account, index) {
      list.appendChild(glmAccountCard(account, index));
    });
    fragment.appendChild(list);
    content.replaceChildren(fragment);
  }

  function renderGpt() {
    const content = byId("gptContent");
    content.setAttribute("aria-busy", "false");

    if (!state.gpt) {
      const unconfigured = state.gptError && state.gptError.code === "GPT_NOT_CONFIGURED";
      setProviderStatus("gpt", unconfigured ? "warning" : "error", unconfigured ? "待配置" : "不可用");
      byId("gptSubtitle").textContent = "GPT 用量";
      byId("gptMeta").textContent = unconfigured ? "GPT 用量尚未配置" : "未取得 GPT 用量";
      content.replaceChildren(
        stateCard(
          unconfigured ? "未配置 GPT 用量" : "GPT 查询失败",
          unconfigured
            ? "GPT 用量尚未完成配置，请检查应用设置。"
            : (state.gptError ? state.gptError.message : "暂时无法获取 GPT 数据。"),
          !unconfigured
        )
      );
      return;
    }

    setProviderStatus("gpt", (state.gptError || state.gptQuotaError) ? "warning" : "ready", (state.gptError || state.gptQuotaError) ? "上次数据" : "已同步");
    byId("gptSubtitle").textContent = "账户 " + (state.gpt.account_id || 2);
    byId("gptMeta").textContent = "数据更新于 " + formatDateTime(state.gpt.updated_at);
    if (state.gpt.timezone) byId("timezoneSummary").textContent = state.gpt.timezone;

    const fragment = document.createDocumentFragment();
    if (state.gptError) fragment.appendChild(notice("本次刷新失败，当前展示上一次成功数据：" + state.gptError.message));

    const windows = [
      ["5 小时窗口", state.gpt.five_hour],
      ["7 天窗口", state.gpt.seven_day]
    ];
    let rendered = 0;
    windows.forEach(function (entry) {
      const data = entry[1];
      if (!data) return;
      const usedPercent = clampPercent(data.utilization);
      const remainingPercent = clampPercent(100 - usedPercent);
      fragment.appendChild(remainingWindow({
        title: entry[0],
        remainingPercent: remainingPercent,
        usedLabel: "已用 " + formatPercent(usedPercent) + "%",
        resetAt: data.resets_at,
        warnResetSoon: true,
        stats: data.window_stats
      }));
      rendered += 1;
    });

    // 剩余重置次数（来自独立的 /api/gpt-quota，与窗口用量并列展示）
    appendResetCredits(fragment, state.gptQuota, state.gptQuotaError);

    if (rendered === 0 && !state.gptQuota) {
      fragment.appendChild(stateCard("暂无窗口数据", "当前暂无 5 小时或 7 天窗口数据。", false));
    }
    content.replaceChildren(fragment);
  }

  function keyUsageCell(label, value, className, role) {
    const cell = element("div", "key-cell" + (className ? " " + className : ""), value);
    cell.dataset.label = label;
    cell.setAttribute("role", role || "cell");
    return cell;
  }

  function renderKeyUsage() {
    const content = byId("keyUsageContent");
    content.setAttribute("aria-busy", "false");

    if (!state.keyUsage) {
      const unconfigured = state.keyUsageError &&
        state.keyUsageError.code === "GPT_NOT_CONFIGURED";
      setProviderStatus(
        "keyUsage",
        unconfigured ? "warning" : "error",
        unconfigured ? "待配置" : "不可用"
      );
      byId("keyUsageSubtitle").textContent = "Key 用量";
      byId("keyUsageMeta").textContent = unconfigured
        ? "GPT Key 用量尚未配置"
        : "未取得 Key 用量";
      content.replaceChildren(
        stateCard(
          unconfigured ? "未配置 GPT Key 用量" : "Key 用量查询失败",
          unconfigured
            ? "GPT Key 用量尚未完成配置，请检查应用设置。"
            : (state.keyUsageError ? state.keyUsageError.message : "暂时无法获取 Key 用量。"),
          !unconfigured
        )
      );
      return;
    }

    const rows = Array.isArray(state.keyUsage.keys) ? state.keyUsage.keys : [];
    const hasTotal = Boolean(state.keyUsage.has_total_usage) &&
      rows.some(function (row) {
        return Number.isFinite(Number(row.total_usage));
      });

    setProviderStatus(
      "keyUsage",
      state.keyUsageError ? "warning" : "ready",
      state.keyUsageError ? "上次数据" : "已同步"
    );
    byId("keyUsageSubtitle").textContent = rows.length + " 个 Key";
    byId("keyUsageMeta").textContent = "实际费用统计，单位 USD · 暂无额度上限";

    const fragment = document.createDocumentFragment();
    if (state.keyUsageError) {
      fragment.appendChild(
        notice("本次刷新失败，当前展示上一次成功数据：" + state.keyUsageError.message)
      );
    }

    if (rows.length === 0) {
      fragment.appendChild(stateCard("暂无 Key", "当前暂无可展示的 Key。", false));
      content.replaceChildren(fragment);
      return;
    }

    const table = element("div", "key-table" + (hasTotal ? " has-total" : ""));
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", "GPT Key 用量");

    const head = element("div", "key-row key-table-head");
    head.setAttribute("role", "row");
    const headers = [
      ["名称", "key-name"],
      ["并发数", ""],
      ["今日用量", ""],
      ["近 30 天用量", ""]
    ];
    if (hasTotal) headers.push(["总用量", ""]);
    headers.forEach(function (header) {
      head.appendChild(keyUsageCell(header[0], header[0], header[1], "columnheader"));
    });
    table.appendChild(head);

    rows.forEach(function (row) {
      const line = element("div", "key-row");
      line.setAttribute("role", "row");
      line.appendChild(keyUsageCell("名称", row.name || "未命名 Key", "key-name"));
      line.appendChild(keyUsageCell("并发数", formatNumber(row.concurrency)));
      line.appendChild(keyUsageCell("今日用量", formatUsageCurrency(row.today_usage)));
      line.appendChild(
        keyUsageCell("近 30 天用量", formatUsageCurrency(row.last_30_days_usage))
      );
      if (hasTotal) {
        line.appendChild(keyUsageCell("总用量", formatUsageCurrency(row.total_usage)));
      }
      table.appendChild(line);
    });

    fragment.appendChild(table);
    content.replaceChildren(fragment);
  }

  function dsResetPeriodLabel(value) {
    const labels = {
      daily: "每日重置",
      weekly: "每周重置",
      monthly: "每月重置",
      yearly: "每年重置"
    };
    return labels[String(value || "").toLowerCase()] || "周期重置";
  }

  function dsDateItem(label, value, showCountdown) {
    const item = element("div", "ds-date-item");
    append(
      item,
      element("span", "ds-date-label", label),
      element("strong", "ds-date-value", formatFullDateTime(value))
    );
    if (showCountdown) {
      const countdown = element("span", "ds-reset-countdown", formatRemaining(value));
      if (value) countdown.dataset.resetAt = String(value);
      updateCountdownNode(countdown);
      item.appendChild(countdown);
    }
    return item;
  }

  function dsSubscriptionCard(data) {
    const card = element("article", "ds-subscription-card");
    const planRow = element("div", "ds-plan-row");
    const planCopy = element("div");
    append(
      planCopy,
      element("span", "ds-kicker", "当前订阅"),
      element("h3", "", data.planTitle || "当前套餐")
    );
    const days = Number(data.remainingDays);
    const validity = element(
      "span",
      "ds-validity",
      Number.isFinite(days) ? "剩余 " + formatNumber(days) + " 天" : "订阅有效"
    );
    append(planRow, planCopy, validity);

    const balance = element("div", "ds-balance");
    const usedPercent = clampPercent(data.usedPercent);
    const remainingPercent = clampPercent(100 - usedPercent);
    const tone = remainingTone(remainingPercent);
    if (tone) balance.classList.add(tone);
    append(
      balance,
      element("span", "ds-balance-label", "剩余额度"),
      element("strong", "ds-balance-value", formatCurrency(data.remaining)),
      element(
        "span",
        "ds-quota-line",
        "已用 " + formatCurrency(data.used) + " / 总额度 " + formatCurrency(data.total)
      )
    );

    const usage = element("div", "ds-usage");
    const usageHead = element("div", "ds-usage-head");
    const remainingLabel = element("strong", tone, "剩余 " + Math.round(remainingPercent) + "%");
    append(
      usageHead,
      remainingLabel,
      element("span", "", "已用 " + Math.round(usedPercent) + "% · " + dsResetPeriodLabel(data.resetPeriod))
    );
    append(usage, usageHead, remainingMeter(remainingPercent));

    const dates = element("div", "ds-date-grid");
    append(
      dates,
      dsDateItem("有效至", data.endAt, false),
      dsDateItem("下一次重置", data.nextResetAt, true)
    );
    append(card, planRow, balance, usage, dates);
    return card;
  }

  function renderDs() {
    const content = byId("dsContent");
    content.setAttribute("aria-busy", "false");

    if (!state.ds) {
      const unconfigured = state.dsError && state.dsError.code === "DS_NOT_CONFIGURED";
      setProviderStatus("ds", unconfigured ? "warning" : "error", unconfigured ? "待配置" : "不可用");
      byId("dsSubtitle").textContent = "订阅额度";
      byId("dsMeta").textContent = unconfigured ? "DS 用量尚未配置" : "未取得 DS 订阅额度";
      content.replaceChildren(
        stateCard(
          unconfigured ? "未配置 DS 用量" : "DS 查询失败",
          unconfigured
            ? "DS 用量尚未完成配置，请检查应用设置。"
            : (state.dsError ? state.dsError.message : "暂时无法获取 DS 订阅数据。"),
          !unconfigured
        )
      );
      return;
    }

    setProviderStatus("ds", state.dsError ? "warning" : "ready", state.dsError ? "上次数据" : "已同步");
    byId("dsSubtitle").textContent = (state.ds.planTitle || "当前套餐") + " · " + dsResetPeriodLabel(state.ds.resetPeriod);
    byId("dsMeta").textContent = "DeepSeek 订阅额度 · 更新于 " + formatDateTime(state.ds.updatedAt);
    const fragment = document.createDocumentFragment();
    if (state.dsError) {
      fragment.appendChild(notice("本次刷新失败，当前展示上一次成功数据：" + state.dsError.message));
    }
    fragment.appendChild(dsSubscriptionCard(state.ds));
    content.replaceChildren(fragment);
  }

  function updateOverview() {
    const summary = byId("providerSummary");
    const coreAvailable = Number(Boolean(state.gpt)) + Number(Boolean(state.glm)) + Number(Boolean(state.ds));
    const coreTotal = 3;
    summary.dataset.coreAvailable = String(coreAvailable);
    summary.dataset.coreTotal = String(coreTotal);
    const grokAvailable = Number(summary.dataset.grokAvailable) || 0;
    const grokTotal = Number(summary.dataset.grokTotal) || 0;
    summary.textContent = (coreAvailable + grokAvailable) + " / " + (coreTotal + grokTotal) + " 可用";
    const updated = byId("lastUpdated");
    updated.textContent = state.lastUpdated
      ? state.lastUpdated.toLocaleTimeString("zh-CN", { hour12: false })
      : "尚未完成";
    if (state.lastUpdated && !reducedMotionQuery.matches) {
      updated.classList.remove("value-pulse");
      requestAnimationFrame(function () {
        updated.classList.add("value-pulse");
      });
    }
  }

  async function syncSource(path, applyData, applyError, render, onSettled) {
    let error = null;
    try {
      const data = await requestJson(path);
      applyData(data);
    } catch (caught) {
      error = caught;
      applyError(caught);
    }
    render();
    onSettled();
    return error;
  }

  async function loadAll() {
    if (state.loading) return;
    state.loading = true;
    if (window.TokenPulse) window.TokenPulse.startSync();
    const button = byId("refreshBtn");
    button.disabled = true;
    button.textContent = "正在刷新";
    byId("refreshState").textContent = "正在同步配额与 Key 用量";
    setProviderStatus("glm", "", "同步中");
    setProviderStatus("gpt", "", "同步中");
    setProviderStatus("keyUsage", "", "同步中");
    setProviderStatus("ds", "", "同步中");

    let completed = 0;
    function markSourceComplete() {
      completed += 1;
      if (window.TokenPulse) window.TokenPulse.sourceComplete();
      state.lastUpdated = new Date();
      updateOverview();
      byId("refreshState").textContent = "已完成 " + completed + " / 5";
    }

    const errors = await Promise.all([
      syncSource(
        "/api/usage",
        function (data) {
          state.glm = data;
          state.glmError = null;
        },
        function (error) {
          state.glmError = error;
        },
        renderGlm,
        markSourceComplete
      ),
      syncSource(
        "/api/gpt-usage",
        function (data) {
          state.gpt = data;
          state.gptError = null;
        },
        function (error) {
          state.gptError = error;
        },
        renderGpt,
        markSourceComplete
      ),
      syncSource(
        "/api/gpt-quota",
        function (data) {
          state.gptQuota = data;
          state.gptQuotaError = null;
        },
        function (error) {
          state.gptQuotaError = error;
        },
        renderGpt,
        markSourceComplete
      ),
      syncSource(
        "/api/gpt-key-usage",
        function (data) {
          state.keyUsage = data;
          state.keyUsageError = null;
        },
        function (error) {
          state.keyUsageError = error;
        },
        renderKeyUsage,
        markSourceComplete
      ),
      syncSource(
        "/api/ds-usage",
        function (data) {
          state.ds = data;
          state.dsError = null;
        },
        function (error) {
          state.dsError = error;
        },
        renderDs,
        markSourceComplete
      )
    ]);

    state.lastUpdated = new Date();
    state.loading = false;

    updateOverview();

    const failed = errors.filter(Boolean).length;
    byId("refreshState").textContent = failed === 0
      ? "全部用量已更新"
      : (failed === 1 ? "已完成，1 个查询需要处理" : "已完成，" + failed + " 个查询需要处理");
    button.disabled = false;
    button.textContent = "刷新数据";
    if (window.TokenPulse) window.TokenPulse.finishSync(failed === 0);
  }

  function updateCountdowns() {
    document.querySelectorAll("[data-reset-at]").forEach(function (node) {
      updateCountdownNode(node);
    });
  }

  function configureAutoRefresh(enabled) {
    const label = byId("autoLabel");
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
    if (enabled) {
      state.autoTimer = setInterval(loadAll, REFRESH_MS);
      label.textContent = "自动刷新 60 秒";
    } else {
      label.textContent = "自动刷新";
    }
    try {
      localStorage.setItem("usage-auto-refresh", enabled ? "1" : "0");
    } catch (_) {
      return;
    }
  }

  byId("themeBtn").addEventListener("click", toggleTheme);
  byId("refreshBtn").addEventListener("click", loadAll);
  byId("logoutBtn").addEventListener("click", logout);
  byId("autoToggle").addEventListener("change", function (event) {
    configureAutoRefresh(event.target.checked);
  });
  themeMediaQuery.addEventListener("change", function (event) {
    if (document.documentElement.dataset.themePreference === "system") {
      applyTheme(event.matches ? "dark" : "light", false);
    }
  });

  let autoEnabled = false;
  try {
    autoEnabled = localStorage.getItem("usage-auto-refresh") === "1";
  } catch (_) {
    autoEnabled = false;
  }
  updateThemeControl();
  byId("autoToggle").checked = autoEnabled;
  configureAutoRefresh(autoEnabled);
  setInterval(updateCountdowns, 30000);
  initializeSession().then(function (authenticated) {
    if (authenticated) loadAll();
  });
