#!/bin/sh
set -eu

PORT_TO_BIND="${PORT:-8000}"
WORKERS="${GUNICORN_WORKERS:-1}"

echo "Running database migrations..."
alembic upgrade head

echo "Seeding bootstrap marketplace data if enabled..."
python -m app.bootstrap_seed

echo "Starting API on port ${PORT_TO_BIND} with ${WORKERS} workers..."
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WORKERS}" \
  --bind "0.0.0.0:${PORT_TO_BIND}" \
  --access-logfile - \
  --error-logfile -
