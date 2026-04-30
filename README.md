# Hackmarket

A monorepo containing the Hackmarket web application and API.

## Structure

```
hackmarket/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router)
│   └── api/          # FastAPI backend
├── packages/
│   └── shared/       # Shared types and constants
├── docker/
│   └── templates/    # Docker templates for containerizing tools
├── scripts/          # Utility scripts
├── .env.example      # Environment variable template
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose

### Local Development

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

2. Start infrastructure:
   ```bash
   docker compose up -d
   ```

3. Start the frontend (`apps/web`):
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

4. Start the backend (`apps/api`):
   ```bash
   cd apps/api
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
