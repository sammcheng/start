import logging
from decimal import Decimal

from sqlalchemy import select

from app.config import settings
from app.dependencies import AsyncSessionLocal
from app.models import InputType, OutputType, OwnershipType, Tool, ToolCategory, ToolStatus, User, UserRole

logger = logging.getLogger(__name__)

CURATED_SELLER_EMAIL = "curated@hackmarket.local"
CURATED_SELLER_CLERK_ID = "system_curated_seller"
CURATED_SELLER_USERNAME = "hackmarket_curated"
CURATED_TOOL_SLUG = "home-accessibility-checker"
CURATED_EMAIL_TOOL_SLUG = "email-intent-router"


async def ensure_bootstrap_marketplace_data() -> None:
    if not settings.enable_bootstrap_tool_seed:
        return

    async with AsyncSessionLocal() as session:
        seller = await session.scalar(
            select(User).where(User.email == CURATED_SELLER_EMAIL)
        )

        if seller is None:
            seller = User(
                clerk_id=CURATED_SELLER_CLERK_ID,
                email=CURATED_SELLER_EMAIL,
                username=CURATED_SELLER_USERNAME,
                display_name="Hackmarket Curated",
                role=UserRole.seller,
                is_active=True,
            )
            session.add(seller)
            await session.flush()
            logger.info("Created curated seller account for marketplace bootstrap.")

        tool = await session.scalar(select(Tool).where(Tool.slug == CURATED_TOOL_SLUG))
        if tool is None:
            tool = Tool(
                seller_id=seller.id,
                name="Home Accessibility Checker",
                slug=CURATED_TOOL_SLUG,
                tagline="Analyze Zillow links or home photos for accessibility barriers and renovation recommendations.",
                description=(
                    "Submit a Zillow-style listing URL or upload home images to detect accessibility "
                    "barriers, estimate an overall accessibility score, and receive practical "
                    "recommendations for safer navigation."
                ),
                category=ToolCategory.computer_vision,
                status=ToolStatus.live,
                ownership_type=OwnershipType.royalty,
                input_type=InputType.json,
                output_type=OutputType.json,
                input_schema={
                    "example_input": {
                        "url": "https://www.zillow.com/homedetails/example-listing",
                        "maxImages": 8
                    },
                    "fields": [
                        {
                            "name": "url",
                            "type": "url",
                            "required": False,
                            "placeholder": "https://www.zillow.com/homedetails/...",
                        },
                        {
                            "name": "images",
                            "type": "file",
                            "required": False,
                            "placeholder": "Upload listing photos instead of a URL",
                        },
                        {
                            "name": "maxImages",
                            "type": "number",
                            "required": False,
                            "placeholder": "8",
                        },
                    ]
                },
                output_schema={
                    "example_output": {
                        "success": True,
                        "analysis": {
                            "overall_score": 78,
                            "summary": "Two accessibility barriers found near the entry path.",
                        },
                        "source": {
                            "type": "url",
                            "url": "https://www.zillow.com/homedetails/example-listing",
                            "scraped_images": 8,
                        },
                        "timestamp": "2026-05-01T00:00:00Z",
                    },
                    "type": "json",
                    "properties": {
                        "success": {"type": "boolean"},
                        "analysis": {"type": "object"},
                        "source": {"type": "object"},
                        "timestamp": {"type": "string"},
                    },
                },
                price_per_request=Decimal("0.050000"),
                api_endpoint=settings.bootstrap_tool_api_endpoint or None,
                entry_command="node server.js",
                port=3000,
                github_url="https://github.com/sammcheng/start",
                documentation=(
                    "Submit either a property listing `url` or an `images` array of processed image "
                    "payloads. Listing URLs are best-effort because some sites block automated "
                    "scraping in production, so direct photo uploads are the most reliable path. "
                    "The service returns accessibility findings, an overall score, and recommendations."
                ),
                avg_response_time_ms=420,
                uptime_percentage=Decimal("99.90"),
                is_featured=True,
            )
            session.add(tool)
            logger.info("Created curated marketplace tool seed: %s", CURATED_TOOL_SLUG)
        else:
            tool.status = ToolStatus.live
            tool.is_featured = True
            tool.api_endpoint = settings.bootstrap_tool_api_endpoint or tool.api_endpoint
            tool.input_type = InputType.json
            tool.output_type = OutputType.json
            tool.input_schema = {
                "example_input": {
                    "url": "https://www.zillow.com/homedetails/example-listing",
                    "maxImages": 8
                },
                "fields": [
                    {
                        "name": "url",
                        "type": "url",
                        "required": False,
                        "placeholder": "https://www.zillow.com/homedetails/...",
                    },
                    {
                        "name": "images",
                        "type": "file",
                        "required": False,
                        "placeholder": "Upload listing photos instead of a URL",
                    },
                    {
                        "name": "maxImages",
                        "type": "number",
                        "required": False,
                        "placeholder": "8",
                    },
                ]
            }
            tool.output_schema = {
                "example_output": {
                    "success": True,
                    "analysis": {
                        "overall_score": 78,
                        "summary": "Two accessibility barriers found near the entry path.",
                    },
                    "source": {
                        "type": "url",
                        "url": "https://www.zillow.com/homedetails/example-listing",
                        "scraped_images": 8,
                    },
                    "timestamp": "2026-05-01T00:00:00Z",
                },
                "type": "json",
                "properties": {
                    "success": {"type": "boolean"},
                    "analysis": {"type": "object"},
                    "source": {"type": "object"},
                    "timestamp": {"type": "string"},
                },
            }
            tool.price_per_request = Decimal("0.050000")
            tool.entry_command = "node server.js"
            tool.port = 3000
            tool.tagline = "Analyze Zillow links or home photos for accessibility barriers and renovation recommendations."
            tool.description = (
                "Submit a Zillow-style listing URL or upload home images to detect accessibility "
                "barriers, estimate an overall accessibility score, and receive practical "
                "recommendations for safer navigation."
            )
            tool.documentation = (
                "Submit either a property listing `url` or an `images` array of processed image "
                "payloads. Listing URLs are best-effort because some sites block automated "
                "scraping in production, so direct photo uploads are the most reliable path. "
                "The service returns accessibility findings, an overall score, and recommendations."
            )

        await session.commit()

        email_tool = await session.scalar(select(Tool).where(Tool.slug == CURATED_EMAIL_TOOL_SLUG))
        if email_tool is None:
            email_tool = Tool(
                seller_id=seller.id,
                name="Email Intent Router",
                slug=CURATED_EMAIL_TOOL_SLUG,
                tagline="Classify inbound emails into support, sales, billing, or spam with confidence scores.",
                description=(
                    "Route inbound email text into actionable intent categories. Provide optional custom "
                    "categories to adapt routing for your workflow, and receive confidence scores for each."
                ),
                category=ToolCategory.automation,
                status=ToolStatus.live,
                ownership_type=OwnershipType.royalty,
                input_type=InputType.json,
                output_type=OutputType.json,
                input_schema={
                    "example_input": {
                        "email": "Hi team, I was charged twice. Please refund one payment.",
                        "categories": ["support", "sales", "billing", "spam"],
                    },
                    "fields": [
                        {
                            "name": "email",
                            "type": "text",
                            "required": True,
                            "placeholder": "Paste inbound email text",
                        },
                        {
                            "name": "categories",
                            "type": "json",
                            "required": False,
                            "placeholder": "[\"support\", \"sales\", \"billing\", \"spam\"]",
                        },
                    ],
                },
                output_schema={
                    "example_output": {
                        "success": True,
                        "category": "billing",
                        "confidence": 0.91,
                        "scores": {
                            "support": 0.05,
                            "sales": 0.02,
                            "billing": 0.91,
                            "spam": 0.02,
                        },
                        "priority": "normal",
                        "timestamp": "2026-05-16T00:00:00Z",
                    },
                    "type": "json",
                    "properties": {
                        "success": {"type": "boolean"},
                        "category": {"type": "string"},
                        "confidence": {"type": "number"},
                        "scores": {"type": "object"},
                        "priority": {"type": "string"},
                        "timestamp": {"type": "string"},
                    },
                },
                price_per_request=Decimal("0.003000"),
                api_endpoint=settings.bootstrap_email_tool_api_endpoint or None,
                entry_command="node server.js",
                port=3000,
                github_url="https://github.com/sammcheng/start",
                documentation=(
                    "Send email text in `email` and optionally provide a custom `categories` array. "
                    "The API returns the top predicted category, confidence, per-category scores, and "
                    "a lightweight priority signal."
                ),
                avg_response_time_ms=95,
                uptime_percentage=Decimal("99.80"),
                is_featured=True,
            )
            session.add(email_tool)
            logger.info("Created curated marketplace tool seed: %s", CURATED_EMAIL_TOOL_SLUG)
        else:
            email_tool.status = ToolStatus.live
            email_tool.is_featured = True
            email_tool.api_endpoint = settings.bootstrap_email_tool_api_endpoint or email_tool.api_endpoint
            email_tool.input_type = InputType.json
            email_tool.output_type = OutputType.json
            email_tool.input_schema = {
                "example_input": {
                    "email": "Hi team, I was charged twice. Please refund one payment.",
                    "categories": ["support", "sales", "billing", "spam"],
                },
                "fields": [
                    {
                        "name": "email",
                        "type": "text",
                        "required": True,
                        "placeholder": "Paste inbound email text",
                    },
                    {
                        "name": "categories",
                        "type": "json",
                        "required": False,
                        "placeholder": "[\"support\", \"sales\", \"billing\", \"spam\"]",
                    },
                ],
            }
            email_tool.output_schema = {
                "example_output": {
                    "success": True,
                    "category": "billing",
                    "confidence": 0.91,
                    "scores": {
                        "support": 0.05,
                        "sales": 0.02,
                        "billing": 0.91,
                        "spam": 0.02,
                    },
                    "priority": "normal",
                    "timestamp": "2026-05-16T00:00:00Z",
                },
                "type": "json",
                "properties": {
                    "success": {"type": "boolean"},
                    "category": {"type": "string"},
                    "confidence": {"type": "number"},
                    "scores": {"type": "object"},
                    "priority": {"type": "string"},
                    "timestamp": {"type": "string"},
                },
            }
            email_tool.price_per_request = Decimal("0.003000")
            email_tool.entry_command = "node server.js"
            email_tool.port = 3000
            email_tool.tagline = "Classify inbound emails into support, sales, billing, or spam with confidence scores."
            email_tool.description = (
                "Route inbound email text into actionable intent categories. Provide optional custom "
                "categories to adapt routing for your workflow, and receive confidence scores for each."
            )
            email_tool.documentation = (
                "Send email text in `email` and optionally provide a custom `categories` array. "
                "The API returns the top predicted category, confidence, per-category scores, and "
                "a lightweight priority signal."
            )

        await session.commit()
