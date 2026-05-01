const DEFAULT_API_BASE =
  process.env.NODE_ENV === "production"
    ? "https://start-3lbd.onrender.com/v1"
    : "http://localhost:8000/v1";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE;
const DEFAULT_TIMEOUT_MS = 20_000;

export function getGatewayBaseUrl(): string {
  if (API_BASE.endsWith("/v1")) {
    return `${API_BASE.slice(0, -3)}/api/v1`;
  }
  return `${API_BASE}/api/v1`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly requestId: string | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  token?: string | null;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  timeoutMs?: number;
}

type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
    request_id?: string | null;
  };
};

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function toApiError(res: Response, data: unknown): ApiError {
  const err = (data as ErrorPayload | null)?.error;
  const rawText =
    data && typeof data === "object" && "raw" in (data as Record<string, unknown>)
      ? String((data as Record<string, unknown>).raw)
      : null;

  return new ApiError(
    res.status,
    err?.code ?? (res.status >= 500 ? "UPSTREAM_ERROR" : "UNKNOWN_ERROR"),
    err?.message ?? rawText ?? "Request failed",
    err?.details ?? {},
    err?.request_id ?? res.headers.get("X-HackMarket-Request-Id")
  );
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(504, "REQUEST_TIMEOUT", "The request took too long to complete.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "We could not reach the server. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: options.cache,
      next: options.next,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (res.status === 204) return undefined as T;

  const data = await parseResponseBody(res);
  if (!res.ok) {
    throw toApiError(res, data);
  }

  return data as T;
}

async function requestFormData<T>(
  method: string,
  path: string,
  body: FormData,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      method,
      headers,
      body,
      cache: options.cache,
      next: options.next,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (res.status === 204) return undefined as T;

  const data = await parseResponseBody(res);
  if (!res.ok) {
    throw toApiError(res, data);
  }

  return data as T;
}

export const api = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>("GET", path, undefined, options);
  },
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("POST", path, body, options);
  },
  postFormData<T>(path: string, body: FormData, options?: RequestOptions): Promise<T> {
    return requestFormData<T>("POST", path, body, options);
  },
  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("PUT", path, body, options);
  },
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>("DELETE", path, undefined, options);
  },
};

export function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") {
      qs.set(key, String(val));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}
