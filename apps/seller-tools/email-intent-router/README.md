# Email Intent Router

A lightweight Node/Express API that classifies inbound email text into routing intents for Hackmarket marketplace demos.

## Endpoints

- `GET /health` - health check
- `POST /classify` - classify email text
- `POST /api/analyze` - alias of classify
- `POST /` - Hackmarket-compatible root endpoint

## Request

```json
{
  "email": "Hi team, I was charged twice. Please refund one payment.",
  "categories": ["support", "sales", "billing", "spam"]
}
```

## Response

```json
{
  "success": true,
  "category": "billing",
  "confidence": 0.91,
  "scores": {
    "support": 0.05,
    "sales": 0.02,
    "billing": 0.91,
    "spam": 0.02
  },
  "priority": "normal",
  "timestamp": "2026-05-16T00:00:00.000Z"
}
```

## Local Run

```bash
cd apps/seller-tools/email-intent-router
npm ci
cp env.example .env
npm start
```

## Environment

- `PORT` (default: `3000`)
- `ALLOWED_ORIGINS` (default: `*`)
