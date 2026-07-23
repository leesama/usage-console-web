import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ClientRequest, IncomingMessage as ProxyIncomingMessage } from "node:http";

/**
 * 本地开发统一从 http://127.0.0.1:5173 访问应用。
 * `/api` 使用 VITE_API_PROXY_TARGET 指定的数据环境。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = (env.VITE_API_PROXY_TARGET || "http://127.0.0.1:7878").replace(
    /\/$/,
    ""
  );
  let targetOrigin = target;
  try {
    targetOrigin = new URL(target).origin;
  } catch {
    /* keep raw */
  }

  const apiProxy: ProxyOptions = {
    target,
    changeOrigin: true,
    secure: true,
    // 让登录状态绑定到本地应用地址。
    cookieDomainRewrite: "",
    cookiePathRewrite: "/",
    configure: (proxy) => {
      proxy.on(
        "proxyReq",
        (proxyReq: ClientRequest, _req: IncomingMessage) => {
          // 让请求头与当前数据环境保持一致。
          proxyReq.setHeader("Origin", targetOrigin);
          proxyReq.setHeader("Referer", `${targetOrigin}/`);
          proxyReq.setHeader("X-Forwarded-Proto", "https");
          proxyReq.setHeader("X-Forwarded-Host", new URL(targetOrigin).host);
        }
      );
      proxy.on(
        "proxyRes",
        (proxyRes: ProxyIncomingMessage, _req: IncomingMessage, _res: ServerResponse) => {
          const raw = proxyRes.headers["set-cookie"];
          if (!raw) return;
          const list = Array.isArray(raw) ? raw : [raw];
          proxyRes.headers["set-cookie"] = list.map((cookie) =>
            cookie
              // 绑定到 127.0.0.1 本地应用地址。
              .replace(/;\s*Domain=[^;]*/gi, "")
              // 本地开发保持同站点登录状态。
              .replace(/;\s*SameSite=Strict/gi, "; SameSite=Lax")
          );
        }
      );
      proxy.on("error", (err: Error) => {
        console.error("[vite /api proxy]", target, err.message);
      });
    },
  };

  return {
    plugins: [react()],
    appType: "spa",
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      assetsDir: "assets",
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      // 用于 HMR 与开发工具。
      cors: true,
      proxy: {
        // API 请求保持为当前应用来源。
        "/api": apiProxy,
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      cors: true,
      proxy: {
        "/api": apiProxy,
      },
    },
  };
});
