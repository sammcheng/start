import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db, get_redis, require_seller
from app.models.tool import ToolStatus
from app.models.user import User
from app.schemas.tool import (
    ToolCreate,
    ToolFilters,
    ToolListResponse,
    ToolResponse,
    ToolUpdate,
)
from app.services import tool_service

router = APIRouter(prefix="/tools", tags=["tools"])


# ---------------------------------------------------------------------------
# Dependency: parse ToolFilters from query params
# ---------------------------------------------------------------------------


def _parse_filters(
    category: str | None = Query(None),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    search: str | None = Query(None, max_length=100),
    sort_by: str = Query("newest", pattern="^(popular|newest|price_low|price_high)$"),
) -> ToolFilters:
    return ToolFilters(
        category=category,  # type: ignore[arg-type]
        min_price=min_price,
        max_price=max_price,
        search=search,
        sort_by=sort_by,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# GET /tools/me  — must be declared BEFORE /{slug} to avoid routing collision
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=list[ToolResponse],
    summary="Get current seller's tools",
)
async def get_my_tools(
    current_user: Annotated[User, Depends(require_seller)],
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> list[ToolResponse]:
    """Return all tools owned by the authenticated seller (any status)."""
    tools = await tool_service.get_seller_tools(db, current_user.id)
    slugs = [t.slug for t in tools]
    views = await tool_service.get_view_counts(redis, slugs)

    return [
        ToolResponse.model_validate(t).model_copy(update={"view_count": views.get(t.slug, 0)})
        for t in tools
    ]


# ---------------------------------------------------------------------------
# POST /tools
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ToolResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tool",
)
async def create_tool(
    body: ToolCreate,
    current_user: Annotated[User, Depends(require_seller)],
    db: AsyncSession = Depends(get_db),
) -> ToolResponse:
    """Create a tool in 'draft' status. Requires seller role."""
    tool = await tool_service.create_tool(db, current_user.id, body)
    return ToolResponse.model_validate(tool)


# ---------------------------------------------------------------------------
# GET /tools
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=ToolListResponse,
    summary="List live tools",
)
async def list_tools(
    filters: Annotated[ToolFilters, Depends(_parse_filters)],
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ToolListResponse:
    """Public endpoint. Returns paginated live tools with optional filters."""
    items, total = await tool_service.list_live_tools(db, filters, page, limit)
    slugs = [t.slug for t in items]
    views = await tool_service.get_view_counts(redis, slugs)

    tool_responses = [
        ToolResponse.model_validate(t).model_copy(update={"view_count": views.get(t.slug, 0)})
        for t in items
    ]

    return ToolListResponse(
        items=tool_responses,
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if total else 0,
    )


# ---------------------------------------------------------------------------
# GET /tools/{slug}
# ---------------------------------------------------------------------------


@router.get(
    "/{slug}",
    response_model=ToolResponse,
    summary="Get tool by slug",
)
async def get_tool(
    slug: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ToolResponse:
    """Public endpoint. Returns full tool details and increments the view counter."""
    tool = await tool_service.get_tool_by_slug(db, slug)
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TOOL_NOT_FOUND", "message": f"No tool with slug '{slug}'."},
        )

    view_count = await tool_service.increment_view_counter(redis, slug)
    return ToolResponse.model_validate(tool).model_copy(update={"view_count": view_count})


# ---------------------------------------------------------------------------
# PUT /tools/{tool_id}
# ---------------------------------------------------------------------------


@router.put(
    "/{tool_id}",
    response_model=ToolResponse,
    summary="Update a tool",
)
async def update_tool(
    tool_id: uuid.UUID,
    body: ToolUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ToolResponse:
    """Update allowed fields. Caller must own the tool. Blocked while in 'processing'."""
    tool = await tool_service.get_tool_by_id(db, tool_id)
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TOOL_NOT_FOUND", "message": "Tool not found."},
        )
    if tool.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_OWNER", "message": "You do not own this tool."},
        )
    if tool.status == ToolStatus.processing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "TOOL_PROCESSING",
                "message": "Cannot update a tool while it is being processed.",
            },
        )

    updated = await tool_service.update_tool(db, tool, body)
    view_count = await tool_service.get_view_count(redis, updated.slug)
    return ToolResponse.model_validate(updated).model_copy(update={"view_count": view_count})


# ---------------------------------------------------------------------------
# DELETE /tools/{tool_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{tool_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Pause (soft-delete) a tool",
)
async def delete_tool(
    tool_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Sets tool status to 'paused'. Does not delete from the database.
    Logs a warning if the tool has had recent usage activity.
    """
    tool = await tool_service.get_tool_by_id(db, tool_id)
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TOOL_NOT_FOUND", "message": "Tool not found."},
        )
    if tool.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_OWNER", "message": "You do not own this tool."},
        )

    if await tool_service.has_active_consumers(db, tool_id):
        import logging
        logging.getLogger(__name__).warning(
            "Tool %s (%s) paused by seller %s but has active consumers in last 30 days",
            tool.slug,
            tool_id,
            current_user.id,
        )

    await tool_service.pause_tool(db, tool)
