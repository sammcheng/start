import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.tool import InputType, OutputType, OwnershipType, ToolCategory, ToolStatus


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class ToolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tagline: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category: ToolCategory
    input_type: InputType
    output_type: OutputType
    ownership_type: OwnershipType
    price_per_request: Decimal = Field(ge=0, decimal_places=6)
    input_schema: dict | None = None
    output_schema: dict | None = None
    github_url: str | None = None
    demo_url: str | None = None
    documentation: str | None = None


class ToolUpdate(BaseModel):
    """All fields are optional — only provided fields are updated."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    tagline: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: ToolCategory | None = None
    input_type: InputType | None = None
    output_type: OutputType | None = None
    ownership_type: OwnershipType | None = None
    price_per_request: Decimal | None = Field(default=None, ge=0, decimal_places=6)
    input_schema: dict | None = None
    output_schema: dict | None = None
    github_url: str | None = None
    demo_url: str | None = None
    api_endpoint: str | None = None
    docker_image_uri: str | None = None
    documentation: str | None = None


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class SellerInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    avatar_url: str | None = None
    username: str


class ToolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seller_id: uuid.UUID
    seller: SellerInfo
    name: str
    slug: str
    tagline: str
    description: str
    category: ToolCategory
    status: ToolStatus
    ownership_type: OwnershipType
    input_type: InputType
    output_type: OutputType
    input_schema: dict | None = None
    output_schema: dict | None = None
    price_per_request: Decimal
    demo_url: str | None = None
    api_endpoint: str | None = None
    docker_image_uri: str | None = None
    github_url: str | None = None
    documentation: str | None = None
    avg_response_time_ms: int | None = None
    total_requests: int
    uptime_percentage: Decimal | None = None
    is_featured: bool
    view_count: int = 0
    created_at: datetime
    updated_at: datetime


class ToolListResponse(BaseModel):
    items: list[ToolResponse]
    total: int
    page: int
    limit: int
    pages: int


# ---------------------------------------------------------------------------
# Query-parameter schema (used via Depends in router)
# ---------------------------------------------------------------------------

SortBy = Literal["popular", "newest", "price_low", "price_high"]


class ToolFilters(BaseModel):
    category: ToolCategory | None = None
    min_price: Decimal | None = Field(default=None, ge=0)
    max_price: Decimal | None = Field(default=None, ge=0)
    search: str | None = Field(default=None, max_length=100)
    sort_by: SortBy = "newest"
