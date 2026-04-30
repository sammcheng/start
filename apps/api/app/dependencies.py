import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Annotated

import httpx
import redis.asyncio as aioredis
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.exceptions import Forbidden, InvalidAPIKeyError, Unauthorized
from app.models import APIKey, User
from app.models.user import UserRole
from app.utils.hashing import hash_api_key

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------

_redis_client: aioredis.Redis = aioredis.from_url(
    settings.redis_url, decode_responses=True
)


async def get_redis() -> aioredis.Redis:
    return _redis_client


# ---------------------------------------------------------------------------
# Clerk JWT verification
# ---------------------------------------------------------------------------

# In-memory JWKS cache: {"keys": [...], "fetched_at": float}
_jwks_cache: dict = {}
_JWKS_TTL = 3600  # seconds before re-fetching


async def _get_jwks() -> list[dict]:
    now = time.monotonic()
    if _jwks_cache.get("keys") and now - _jwks_cache.get("fetched_at", 0) < _JWKS_TTL:
        return _jwks_cache["keys"]

    jwks_url = settings.clerk_jwks_url
    if not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "MISCONFIGURATION", "message": "CLERK_JWKS_URL is not set."},
        )

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        data = resp.json()

    _jwks_cache["keys"] = data["keys"]
    _jwks_cache["fetched_at"] = now
    return data["keys"]


async def _verify_clerk_jwt(token: str) -> dict:
    """Validate a Clerk JWT and return its decoded claims."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise Unauthorized("Malformed JWT.") from exc

    kid = header.get("kid")
    keys = await _get_jwks()
    jwk = next((k for k in keys if k.get("kid") == kid), None)

    if jwk is None:
        # Key may have rotated — flush cache and retry once
        _jwks_cache.clear()
        keys = await _get_jwks()
        jwk = next((k for k in keys if k.get("kid") == kid), None)

    if jwk is None:
        raise Unauthorized("Token signing key not found.")

    try:
        claims: dict = jwt.decode(token, jwk, algorithms=["RS256"])
    except JWTError as exc:
        raise Unauthorized("Token verification failed.") from exc

    return claims


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise Unauthorized("Authorization header required.")
    return authorization[len("Bearer "):]


# ---------------------------------------------------------------------------
# Core auth dependencies
# ---------------------------------------------------------------------------


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validate the Clerk Bearer JWT and return the matching active User row.
    User creation is handled by the Clerk webhook (POST /auth/webhook).
    Raises 401 if the token is invalid or the user is not found / inactive.
    """
    token = _extract_bearer(authorization)
    claims = await _verify_clerk_jwt(token)
    clerk_id: str = claims["sub"]

    result = await db.execute(
        select(User).where(User.clerk_id == clerk_id, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise Unauthorized("No active account found. Please complete registration.")
    return user


async def require_seller(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Return the current user only if they have seller capability."""
    if current_user.role not in (UserRole.seller, UserRole.both, UserRole.admin):
        raise Forbidden("A seller account is required for this action.")
    return current_user


# ---------------------------------------------------------------------------
# API-key dependency (for tool consumers)
# ---------------------------------------------------------------------------


async def validate_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> tuple[User, APIKey]:
    """
    Validate the ``X-Api-Key`` header, mark it as used, and return
    ``(user, api_key)``. Raises 401 on any failure.
    """
    if not x_api_key:
        raise InvalidAPIKeyError("X-Api-Key header required.")

    key_hash = hash_api_key(x_api_key)
    result = await db.execute(
        select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active.is_(True))
    )
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise InvalidAPIKeyError()

    user_result = await db.execute(
        select(User).where(User.id == api_key.user_id, User.is_active.is_(True))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise InvalidAPIKeyError("API key owner not found.")

    await db.execute(
        update(APIKey)
        .where(APIKey.id == api_key.id)
        .values(last_used_at=datetime.now(timezone.utc))
    )
    await db.commit()

    return user, api_key
