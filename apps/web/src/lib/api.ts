export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

export function getGatewayBaseUrl(): string {
  if (API_BASE.endsWith("/v1")) {
    return `${API_BASE.slice(0, -3)}/api/v1`;
  }
  return `${API_BASE}/api/v1`;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------

export interface RequestOptions {
  /** Clerk JWT — pass from auth().getToken() or useAuth().getToken() */
  token?: string | null;
  cache?: RequestCache;
  /** Next.js fetch extensions */
  next?: { revalidate?: number | false; tags?: string[] };
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: options.cache,
    next: options.next,
  });

  // No-content responses
  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, "PARSE_ERROR", "Failed to parse response");
  }

  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: Record<string, unknown>; request_id?: string | null } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "Request failed",
      err?.details ?? {},
      err?.request_id ?? null
    );
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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
    cache: options.cache,
    next: options.next,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, "PARSE_ERROR", "Failed to parse response");
  }

  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: Record<string, unknown>; request_id?: string | null } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "Request failed",
      err?.details ?? {},
      err?.request_id ?? null
    );
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Query string builder
// ---------------------------------------------------------------------------

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
