import { useEffect } from "react";

type TokenPulseApi = {
  startSync: () => void;
  sourceComplete: () => void;
  finishSync: (success: boolean) => void;
  themeChanged: () => void;
};

type CockpitWindow = Window & {
  TokenPulse?: TokenPulseApi;
};

type LegacyScript = {
  id: string;
  src: string;
  module?: boolean;
};

const scriptLoads = new Map<string, Promise<void>>();

const EARTH_SCRIPT: LegacyScript = {
  id: "usage-earth-three",
  src: "/static/earth-three.js?v=20260722-production-assets-v18",
  module: true,
};

const COCKPIT_SCRIPTS: LegacyScript[] = [
  {
    id: "usage-cosmos-webgl",
    src: "/static/cosmos-webgl.js?v=20260722-hyperjump-v15",
  },
  {
    id: "usage-token-motion",
    src: "/static/token-motion.js?v=20260722-immersive-earth-v12",
  },
  {
    id: "usage-cockpit-controls",
    src: "/static/cockpit.js?v=20260722-two-axis-drag-v17",
  },
];

function loadLegacyScript({ id, src, module = false }: LegacyScript): Promise<void> {
  const pending = scriptLoads.get(id);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    const onError = () => {
      scriptLoads.delete(id);
      reject(new Error(`无法加载座舱脚本：${src}`));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.id = id;
      script.src = src;
      script.async = false;
      if (module) script.type = "module";
      document.body.appendChild(script);
    }
  });

  scriptLoads.set(id, promise);
  return promise;
}

function pulse(): TokenPulseApi | undefined {
  return (window as CockpitWindow).TokenPulse;
}

export function startCockpitSync(): void {
  document.body.classList.remove("sync-complete");
  document.body.classList.add("is-syncing");
  pulse()?.startSync();
}

export function completeCockpitSource(): void {
  pulse()?.sourceComplete();
}

export function finishCockpitSync(success: boolean): void {
  const tokenPulse = pulse();
  if (tokenPulse) {
    tokenPulse.finishSync(success);
    return;
  }

  document.body.classList.remove("is-syncing");
  document.body.classList.add("sync-complete");
  window.setTimeout(() => {
    document.body.classList.remove("sync-complete");
  }, 900);
}

export function notifyCockpitThemeChanged(): void {
  pulse()?.themeChanged();
}

/**
 * Mounts the historical WebGL/Three.js cockpit after React has created the DOM
 * nodes those scripts expect. Route transitions use a full navigation so the
 * legacy animation listeners are released by the browser.
 */
export function useCockpitEffects(): void {
  useEffect(() => {
    const body = document.body;
    const previousTitle = document.title;

    document.title = "Token 驾驶室 · 银河远征座舱";
    body.classList.add("cockpit-body", "cosmos-body");

    void loadLegacyScript(EARTH_SCRIPT).catch((error) => {
      console.warn("[cockpit] 地球渲染器加载失败", error);
    });

    void (async () => {
      for (const script of COCKPIT_SCRIPTS) {
        try {
          await loadLegacyScript(script);
        } catch (error) {
          console.warn("[cockpit] 座舱脚本加载失败", error);
        }
      }

      if (body.classList.contains("is-syncing")) {
        pulse()?.startSync();
      }
    })();

    return () => {
      document.title = previousTitle;
      body.classList.remove(
        "cockpit-body",
        "cosmos-body",
        "is-syncing",
        "sync-complete",
        "cockpit-screen-focus",
        "is-cockpit-dragging",
        "is-hyperjump"
      );
    };
  }, []);
}
