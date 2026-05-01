import logging
import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.config import settings
from app.middleware.error_handler import setup_error_handlers
from app.request_context import get_request_id, reset_request_id, set_request_id
from app.services import billing_service, bootstrap_service


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s",
)
logger = logging.getLogger(__name__)
for handler in logging.getLogger().handlers:
    handler.addFilter(RequestIdFilter())

PRODUCTION_ORIGIN = "https://hackmarket.io"


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    logger.info("Starting Hackmarket API (env=%s)", settings.environment)
    await bootstrap_service.ensure_bootstrap_marketplace_data()
    scheduler_stop = asyncio.Event()
    scheduler_task = asyncio.create_task(billing_service.run_scheduler_loop(scheduler_stop))
    yield
    scheduler_stop.set()
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    from app.dependencies import _redis_client
    await _redis_client.aclose()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Hackmarket API",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
cors_origins = list(settings.cors_origins)
if settings.environment == "production":
    cors_origins.append(PRODUCTION_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("X-HackMarket-Request-Id") or str(uuid.uuid4())
    request.state.request_id = request_id
    token = set_request_id(request_id)
    try:
        response = await call_next(request)
    finally:
        reset_request_id(token)
    response.headers["X-HackMarket-Request-Id"] = request_id
    return response

# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
setup_error_handlers(app)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
from app.routers import api_keys, auth, billing, dashboard, gateway, seller, tools, upload, usage  # noqa: E402

app.include_router(auth.router, prefix="/v1")
app.include_router(tools.router, prefix="/v1")
app.include_router(upload.router, prefix="/v1")
app.include_router(api_keys.router, prefix="/v1")
app.include_router(billing.router, prefix="/v1")
app.include_router(dashboard.router, prefix="/v1")
app.include_router(seller.router, prefix="/v1")
app.include_router(usage.router, prefix="/v1")
app.include_router(gateway.router)

# Future routers — uncomment as they are created:
# from app.routers import users, api_keys
# app.include_router(users.router, prefix="/v1/users", tags=["users"])
# app.include_router(api_keys.router, prefix="/v1/api-keys", tags=["api-keys"])


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "environment": settings.environment}
