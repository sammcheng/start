import logging

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from svix.webhooks import Webhook, WebhookVerificationError

from app.config import settings
from app.dependencies import get_db
from app.models import User
from fastapi import Depends

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _primary_email(clerk_user: dict) -> str | None:
    primary_id = clerk_user.get("primary_email_address_id")
    for email_obj in clerk_user.get("email_addresses", []):
        if email_obj.get("id") == primary_id:
            return email_obj.get("email_address")
    return None


def _display_name(clerk_user: dict) -> str:
    first = clerk_user.get("first_name") or ""
    last = clerk_user.get("last_name") or ""
    return (f"{first} {last}".strip()) or clerk_user.get("username") or clerk_user.get("id", "")


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def clerk_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Receives and processes Clerk webhook events.

    Validates the svix signature before touching the database.
    Handles: user.created, user.updated, user.deleted
    """
    body = await request.body()

    # svix requires these three headers for verification
    svix_headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }

    secret = settings.clerk_webhook_secret
    if not secret:
        logger.error("CLERK_WEBHOOK_SECRET is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "MISCONFIGURATION", "message": "Webhook secret not set."},
        )

    try:
        wh = Webhook(secret)
        event: dict = wh.verify(body, svix_headers)
    except WebhookVerificationError:
        logger.warning("Clerk webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_SIGNATURE", "message": "Webhook signature invalid."},
        )

    event_type: str = event.get("type", "")
    clerk_user: dict = event.get("data", {})
    clerk_id: str = clerk_user.get("id", "")

    logger.info("Clerk webhook received: %s for clerk_id=%s", event_type, clerk_id)

    if event_type == "user.created":
        await _handle_user_created(db, clerk_id, clerk_user)
    elif event_type == "user.updated":
        await _handle_user_updated(db, clerk_id, clerk_user)
    elif event_type == "user.deleted":
        await _handle_user_deleted(db, clerk_id)
    else:
        logger.debug("Unhandled Clerk event type: %s", event_type)


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------


async def _handle_user_created(
    db: AsyncSession, clerk_id: str, clerk_user: dict
) -> None:
    # Idempotent: skip if already exists (e.g. webhook re-delivery)
    existing = await db.execute(select(User).where(User.clerk_id == clerk_id))
    if existing.scalar_one_or_none():
        logger.info("user.created: User %s already exists, skipping", clerk_id)
        return

    email = _primary_email(clerk_user)
    if not email:
        logger.error("user.created: No primary email for clerk_id=%s", clerk_id)
        return

    username = clerk_user.get("username") or clerk_id
    user = User(
        clerk_id=clerk_id,
        email=email,
        username=username,
        display_name=_display_name(clerk_user),
        avatar_url=clerk_user.get("image_url"),
    )
    db.add(user)
    await db.commit()
    logger.info("user.created: Created local user for clerk_id=%s", clerk_id)


async def _handle_user_updated(
    db: AsyncSession, clerk_id: str, clerk_user: dict
) -> None:
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if not user:
        # Can happen if webhook fires before user.created; treat as create
        logger.warning("user.updated: User %s not found, creating instead", clerk_id)
        await _handle_user_created(db, clerk_id, clerk_user)
        return

    email = _primary_email(clerk_user)
    if email:
        user.email = email
    if clerk_user.get("username"):
        user.username = clerk_user["username"]
    user.display_name = _display_name(clerk_user)
    if clerk_user.get("image_url") is not None:
        user.avatar_url = clerk_user["image_url"]

    await db.commit()
    logger.info("user.updated: Updated local user for clerk_id=%s", clerk_id)


async def _handle_user_deleted(db: AsyncSession, clerk_id: str) -> None:
    await db.execute(
        update(User).where(User.clerk_id == clerk_id).values(is_active=False)
    )
    await db.commit()
    logger.info("user.deleted: Soft-deleted local user for clerk_id=%s", clerk_id)
