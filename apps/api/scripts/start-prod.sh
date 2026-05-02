#!/bin/sh
set -eu

PORT_TO_BIND="${PORT:-8000}"
WORKERS="${GUNICORN_WORKERS:-1}"
BOOTSTRAP_TOOL_SEED="${ENABLE_BOOTSTRAP_TOOL_SEED:-false}"

echo "Running database migrations..."
alembic upgrade head

if [ "${BOOTSTRAP_TOOL_SEED}" = "true" ]; then
  echo "Seeding bootstrap marketplace data..."
  python -m app.bootstrap_seed
else
  echo "Skipping bootstrap marketplace seed (ENABLE_BOOTSTRAP_TOOL_SEED=${BOOTSTRAP_TOOL_SEED})."
fi

echo "Starting API on port ${PORT_TO_BIND} with ${WORKERS} workers..."
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WORKERS}" \
  --bind "0.0.0.0:${PORT_TO_BIND}" \
  --access-logfile - \
  --error-logfile -
