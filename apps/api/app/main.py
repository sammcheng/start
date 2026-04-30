import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.error_handler import setup_error_handlers

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

PRODUCTION_ORIGIN = "https://hackmarket.io"


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    logger.info("Starting Hackmarket API (env=%s)", settings.environment)
    yield
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

# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
setup_error_handlers(app)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
from app.routers import auth, tools  # noqa: E402

app.include_router(auth.router, prefix="/v1")
app.include_router(tools.router, prefix="/v1")

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
