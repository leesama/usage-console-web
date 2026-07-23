  (function () {
    const root = document.documentElement;
    const lockedTheme = root.dataset.themeLock;
    if (lockedTheme === "light" || lockedTheme === "dark") {
      root.dataset.theme = lockedTheme;
      root.dataset.themePreference = "locked";
      return;
    }

    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem("usage-theme");
    } catch (_) {
      savedTheme = null;
    }
    const hasSavedTheme = savedTheme === "light" || savedTheme === "dark";
    root.dataset.theme = hasSavedTheme ? savedTheme : systemTheme;
    root.dataset.themePreference = hasSavedTheme ? "manual" : "system";
  })();
