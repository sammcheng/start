from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

import httpx
from fastapi import Request

HOP_BY_HOP_HEADERS = {
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def build_upstream_url(api_endpoint: str, tool_path: str = "", query: bytes = b"") -> httpx.URL:
    parsed = urlsplit(api_endpoint)
    base_path = parsed.path.rstrip("/")
    extra_path = f"/{tool_path.lstrip('/')}" if tool_path else ""
    combined_path = f"{base_path}{extra_path}" or "/"
    upstream = urlunsplit((parsed.scheme, parsed.netloc, combined_path, "", ""))
    return httpx.URL(upstream).copy_with(query=query)


def filter_request_headers(headers, *, strip_api_key: bool = True) -> dict[str, str]:
    filtered: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in HOP_BY_HOP_HEADERS:
            continue
        if strip_api_key and lower == "x-api-key":
            continue
        filtered[key] = value
    return filtered


def filter_response_headers(headers) -> dict[str, str]:
    filtered: dict[str, str] = {}
    for key, value in headers.items():
        if key.lower() in HOP_BY_HOP_HEADERS:
            continue
        filtered[key] = value
    return filtered


async def forward_request(
    *,
    api_endpoint: str,
    request: Request,
    request_body: bytes,
    request_id: str,
    tool_slug: str,
    tool_path: str = "",
    timeout_seconds: int = 30,
    extra_headers: dict[str, str] | None = None,
) -> httpx.Response:
    url = build_upstream_url(api_endpoint, tool_path, request.url.query.encode("utf-8"))
    headers = filter_request_headers(request.headers)
    headers["X-HackMarket-Request-Id"] = request_id
    headers["X-HackMarket-Tool-Slug"] = tool_slug
    if extra_headers:
        headers.update(extra_headers)

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        return await client.request(
            method=request.method,
            url=url,
            content=request_body,
            headers=headers,
        )
