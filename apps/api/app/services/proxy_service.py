from __future__ import annotations

import re
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


def normalize_platform_gateway_error(response: httpx.Response) -> tuple[int, bytes, dict[str, str], str] | None:
    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type.lower():
        return None

    body = response.text
    normalized = body.lower()
    if (
        "bad gateway" not in normalized
        and ">502<" not in normalized
        and "service is currently unavailable" not in normalized
    ):
        return None

    platform = None
    if "powered by render" in normalized:
        platform = "Render"
    elif "powered by vercel" in normalized:
        platform = "Vercel"

    platform_request_id_match = re.search(r"Request ID:\s*([^\s<]+)", body, re.IGNORECASE)
    platform_request_id = platform_request_id_match.group(1) if platform_request_id_match else None

    message = "The tool service is temporarily unavailable. Please try again in a minute."
    payload = {
        "error": {
            "code": "TOOL_UNAVAILABLE",
            "message": message,
        }
    }
    if platform:
        payload["error"]["platform"] = platform
    if platform_request_id:
        payload["error"]["platform_request_id"] = platform_request_id

    import json

    return (
        httpx.codes.BAD_GATEWAY,
        json.dumps(payload).encode("utf-8"),
        {"content-type": "application/json"},
        "application/json",
    )


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
