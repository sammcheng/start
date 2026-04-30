import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tool import Tool, ToolStatus
from app.models.usage_log import UsageLog
from app.schemas.tool import ToolCreate, ToolFilters, ToolUpdate

logger = logging.getLogger(__name__)

_VIEW_KEY_PREFIX = "tool:views:"
_VIEW_FLUSH_THRESHOLD = 50  # flush to DB every N increments (future background task hook)


# ---------------------------------------------------------------------------
# Slug helpers
# ---------------------------------------------------------------------------


def _slugify(name: str) -> str:
    """Convert a tool name to a URL-safe slug."""
    slug = name.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug.strip("-")
    return slug[:90]  # leave room for duplicate suffix


async def _find_unique_slug(db: AsyncSession, base_slug: str) -> str:
    """Return *base_slug* if available, otherwise append -2, -3, … until unique."""
    candidate = base_slug
    n = 2
    while True:
        result = await db.execute(select(Tool.id).where(Tool.slug == candidate))
        if result.scalar_one_or_none() is None:
            return candidate
        candidate = f"{base_slug}-{n}"
        n += 1


# ---------------------------------------------------------------------------
# Redis view counter
# ---------------------------------------------------------------------------


async def increment_view_counter(redis: Redis, slug: str) -> int:
    """
    Increment the Redis view counter for *slug* and return the new total.
    Actual DB flush is left to a background task (future work).
    """
    key = f"{_VIEW_KEY_PREFIX}{slug}"
    count: int = await redis.incr(key)
    return count


async def get_view_count(redis: Redis, slug: str) -> int:
    key = f"{_VIEW_KEY_PREFIX}{slug}"
    raw = await redis.get(key)
    return int(raw) if raw else 0


async def get_view_counts(redis: Redis, slugs: list[str]) -> dict[str, int]:
    """Batch-fetch view counts for a list of slugs using a pipeline."""
    if not slugs:
        return {}
    async with redis.pipeline() as pipe:
        for slug in slugs:
            await pipe.get(f"{_VIEW_KEY_PREFIX}{slug}")
        results = await pipe.execute()
    return {slug: int(v) if v else 0 for slug, v in zip(slugs, results)}


# ---------------------------------------------------------------------------
# Active-consumer check
# ---------------------------------------------------------------------------


async def has_active_consumers(db: AsyncSession, tool_id: uuid.UUID) -> bool:
    """Return True if there is any usage activity in the last 30 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(UsageLog.id)
        .where(UsageLog.tool_id == tool_id, UsageLog.request_timestamp >= cutoff)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------


async def create_tool(
    db: AsyncSession,
    seller_id: uuid.UUID,
    data: ToolCreate,
) -> Tool:
    base_slug = _slugify(data.name)
    slug = await _find_unique_slug(db, base_slug)

    tool = Tool(
        seller_id=seller_id,
        slug=slug,
        status=ToolStatus.draft,
        **data.model_dump(),
    )
    db.add(tool)
    await db.commit()

    # Re-fetch with seller relationship loaded for response serialisation
    result = await db.execute(
        select(Tool)
        .where(Tool.id == tool.id)
        .options(selectinload(Tool.seller))
    )
    return result.scalar_one()


async def get_tool_by_slug(db: AsyncSession, slug: str) -> Tool | None:
    result = await db.execute(
        select(Tool)
        .where(Tool.slug == slug)
        .options(selectinload(Tool.seller))
    )
    return result.scalar_one_or_none()


async def get_tool_by_id(db: AsyncSession, tool_id: uuid.UUID) -> Tool | None:
    result = await db.execute(
        select(Tool)
        .where(Tool.id == tool_id)
        .options(selectinload(Tool.seller))
    )
    return result.scalar_one_or_none()


async def list_live_tools(
    db: AsyncSession,
    filters: ToolFilters,
    page: int,
    limit: int,
) -> tuple[list[Tool], int]:
    """
    Return a page of live tools matching *filters*, plus the total count.
    """
    base_query = (
        select(Tool)
        .where(Tool.status == ToolStatus.live)
        .options(selectinload(Tool.seller))
    )
    count_query = select(func.count()).select_from(Tool).where(Tool.status == ToolStatus.live)

    # --- filters ---
    if filters.category is not None:
        base_query = base_query.where(Tool.category == filters.category)
        count_query = count_query.where(Tool.category == filters.category)

    if filters.min_price is not None:
        base_query = base_query.where(Tool.price_per_request >= filters.min_price)
        count_query = count_query.where(Tool.price_per_request >= filters.min_price)

    if filters.max_price is not None:
        base_query = base_query.where(Tool.price_per_request <= filters.max_price)
        count_query = count_query.where(Tool.price_per_request <= filters.max_price)

    if filters.search:
        pattern = f"%{filters.search}%"
        search_clause = or_(
            Tool.name.ilike(pattern),
            Tool.tagline.ilike(pattern),
            Tool.description.ilike(pattern),
        )
        base_query = base_query.where(search_clause)
        count_query = count_query.where(search_clause)

    # --- sorting ---
    order = {
        "popular": Tool.total_requests.desc(),
        "newest": Tool.created_at.desc(),
        "price_low": Tool.price_per_request.asc(),
        "price_high": Tool.price_per_request.desc(),
    }
    base_query = base_query.order_by(order[filters.sort_by])

    # --- pagination ---
    offset = (page - 1) * limit
    base_query = base_query.offset(offset).limit(limit)

    items_result = await db.execute(base_query)
    total_result = await db.execute(count_query)

    return list(items_result.scalars()), total_result.scalar_one()


async def get_seller_tools(db: AsyncSession, seller_id: uuid.UUID) -> list[Tool]:
    """Return all tools for a seller regardless of status, newest first."""
    result = await db.execute(
        select(Tool)
        .where(Tool.seller_id == seller_id)
        .options(selectinload(Tool.seller))
        .order_by(Tool.created_at.desc())
    )
    return list(result.scalars())


async def update_tool(db: AsyncSession, tool: Tool, data: ToolUpdate) -> Tool:
    """Apply only the fields explicitly provided in *data*."""
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(tool, field, value)
    await db.commit()
    await db.refresh(tool)
    return tool


async def pause_tool(db: AsyncSession, tool: Tool) -> Tool:
    """Set the tool status to 'paused' (soft-delete equivalent)."""
    tool.status = ToolStatus.paused
    await db.commit()
    await db.refresh(tool)
    return tool
