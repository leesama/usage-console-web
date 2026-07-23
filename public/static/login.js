(function () {
  "use strict";

  const form = document.getElementById("loginForm");
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const submit = document.getElementById("submitBtn");
  const status = document.getElementById("formStatus");
  const sessionNote = document.getElementById("sessionNote");
  const passwordToggle = document.getElementById("passwordToggle");
  const themeButton = document.getElementById("themeBtn");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let dashboardTransition = null;

  function setStatus(message, success) {
    status.textContent = message || "";
    status.className = "form-status" + (success ? " success" : "");
  }

  function updateThemeButton() {
    const dark = document.documentElement.dataset.theme !== "light";
    themeButton.textContent = dark ? "深色" : "浅色";
    themeButton.setAttribute("aria-label", dark ? "切换为浅色主题" : "切换为深色主题");
  }

  function findStylesheet(href) {
    const target = new URL(href, window.location.href).href;
    return Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find(
      function (link) {
        return link.href === target;
      }
    );
  }

  function loadStylesheet(href) {
    const existing = findStylesheet(href);
    if (existing) return Promise.resolve(existing);

    return new Promise(function (resolve, reject) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.addEventListener("load", function () { resolve(link); }, { once: true });
      link.addEventListener("error", function () {
        reject(new Error("控制台样式加载失败。"));
      }, { once: true });
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", function () {
        reject(new Error("控制台脚本加载失败。"));
      }, { once: true });
      document.body.appendChild(script);
    });
  }

  function removeLoginStylesheet() {
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(function (link) {
      if (new URL(link.href, window.location.href).pathname === "/static/login.css") {
        link.remove();
      }
    });
  }

  async function enterDashboard() {
    if (dashboardTransition) return dashboardTransition;

    dashboardTransition = (async function () {
      const response = await fetch("/", {
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "text/html" }
      });
      if (!response.ok || response.redirected) {
        throw new Error("控制台页面加载失败。请稍后重试。");
      }

      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      if (!page.querySelector(".app-shell")) {
        throw new Error("控制台页面内容无效。请稍后重试。");
      }

      const stylesheets = Array.from(page.querySelectorAll('link[rel="stylesheet"][href]'))
        .map(function (link) { return link.getAttribute("href"); })
        .filter(Boolean);
      const scripts = Array.from(page.querySelectorAll("script[src]"))
        .map(function (script) { return script.getAttribute("src"); })
        .filter(function (src) {
          return src && new URL(src, window.location.href).pathname !== "/static/theme-init.js";
        });

      await Promise.all(stylesheets.map(loadStylesheet));
      page.querySelectorAll("script").forEach(function (script) { script.remove(); });

      async function mountDashboard() {
        const nextBody = document.importNode(page.body, true);
        document.title = page.title || "AI 用量控制台";
        document.body.replaceWith(nextBody);
        window.history.replaceState(null, "", "/");
        removeLoginStylesheet();
        for (const src of scripts) {
          await loadScript(src);
        }
      }

      if (typeof document.startViewTransition === "function" && !reducedMotion.matches) {
        await document.startViewTransition(mountDashboard).finished;
      } else {
        await mountDashboard();
      }
    }());

    return dashboardTransition;
  }

  themeButton.addEventListener("click", function () {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.themePreference = "manual";
    try {
      localStorage.setItem("usage-theme", next);
    } catch (_) {
      // 主题持久化失败不影响登录。
    }
    updateThemeButton();
  });

  passwordToggle.addEventListener("click", function () {
    const reveal = password.type === "password";
    password.type = reveal ? "text" : "password";
    passwordToggle.textContent = reveal ? "隐藏" : "显示";
    passwordToggle.setAttribute("aria-pressed", String(reveal));
    password.focus();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const account = username.value.trim();
    if (!account || !password.value) {
      setStatus("请输入账号和密码。", false);
      (!account ? username : password).focus();
      return;
    }

    submit.disabled = true;
    submit.firstElementChild.textContent = "正在验证";
    setStatus("", false);
    let authenticated = false;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: account, password: password.value })
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("尝试次数过多，请稍后再试。");
        }
        throw new Error(data.error || "登录失败，请检查账号和密码。");
      }
      authenticated = true;
      password.value = "";
      setStatus("验证通过，正在进入控制台…", true);
      await enterDashboard();
    } catch (error) {
      if (authenticated) {
        // 同页切换失败时保留传统导航兜底，避免已登录用户卡在登录页。
        window.location.replace("/");
        return;
      }
      password.value = "";
      setStatus(error instanceof Error ? error.message : "登录失败，请稍后再试。", false);
      password.focus();
      submit.disabled = false;
      submit.firstElementChild.textContent = "进入控制台";
    }
  });

  async function checkSession() {
    const expired = new URLSearchParams(window.location.search).get("expired") === "1";
    if (expired) {
      sessionNote.textContent = "登录已过期，请重新验证账号。";
      sessionNote.classList.add("warning");
    }
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (response.ok) {
        await enterDashboard();
      }
    } catch (_) {
      setStatus("暂时无法连接服务，请稍后重试。", false);
    }
  }

  updateThemeButton();
  checkSession();
}());
