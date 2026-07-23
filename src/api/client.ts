export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export type SessionInfo = {
  authenticated: boolean;
  mode?: string;
  username?: string;
  expiresInSeconds?: number;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** API 请求统一使用应用内的 `/api/...` 相对路径。 */
function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must be absolute on this origin, got: ${path}`);
  }
  // Guard against accidental absolute cross-origin URLs.
  if (/^https?:\/\//i.test(path)) {
    throw new Error("API 地址必须使用 /api/... 应用内相对路径。");
  }
  return path;
}

export async function apiJson<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<T> {
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = {
    method,
    // 登录状态始终跟随当前应用来源。
    credentials: "include",
    cache: "no-store",
    headers,
    signal: options?.signal,
  };
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(resolveApiUrl(path), init);
  const data = await parseJson(response);

  if (!response.ok) {
    const message =
      (typeof data.error === "string" && data.error) ||
      `请求失败，HTTP ${response.status}`;
    const code = typeof data.code === "string" ? data.code : undefined;
    throw new ApiError(message, code);
  }

  return data as T;
}

export async function fetchSession(): Promise<SessionInfo> {
  return apiJson<SessionInfo>("/api/auth/session");
}

export async function login(
  username: string,
  password: string
): Promise<SessionInfo> {
  return apiJson<SessionInfo>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function logout(): Promise<void> {
  await apiJson("/api/auth/logout", { method: "POST" });
}

export async function revealGlmKey(id: string): Promise<string> {
  const data = await apiJson<{ apiKey?: string }>("/api/usage/reveal-key", {
    method: "POST",
    body: { id },
  });
  if (!data.apiKey) {
    throw new ApiError("未返回完整 Key", "KEY_EMPTY");
  }
  return data.apiKey;
}
