# Token 驾驶室

统一查看 GPT、Grok、智谱 GLM 与 DeepSeek 用量和账号状态的 AI 用量控制台。

## 功能

- 登录后进入私人 Token 驾驶室
- 四块驾驶舱屏幕集中展示 GPT、Grok、GLM 与 DeepSeek 数据
- 查看额度窗口、Key 用量、账号调度状态与订阅余额
- 支持手动同步和 60 秒自动刷新
- 提供地球近轨、粒子星空和屏幕推近等驾驶舱交互效果

## 快速开始

```bash
git clone https://github.com/leesama/usage-console-web.git
cd usage-console-web
cp .env.example .env.local
# 将 .env.local 中的 VITE_API_PROXY_TARGET 改为实际数据环境
pnpm install
pnpm dev
```

本仓库使用 **pnpm**（见 `packageManager`）。不要混用 npm/yarn。  
pnpm v11 需允许 esbuild 构建脚本：已在 `pnpm-workspace.yaml` 配置 `allowBuilds.esbuild: true`。

启动后打开 `http://127.0.0.1:5173/login`。修改 `.env.local` 后需重新启动应用。

## 技术栈

- React 19 + TypeScript 7
- React Router 7
- Vite 8
- Canvas、WebGL 与 Three.js 驾驶舱效果
- pnpm

## 构建

```bash
pnpm build
pnpm preview
```

构建产物位于 `dist/`。
