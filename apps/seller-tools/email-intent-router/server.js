const express = require('express');
const cors = require('cors');

const DEFAULT_CATEGORIES = ['support', 'sales', 'billing', 'spam'];

const CATEGORY_KEYWORDS = {
  support: [
    'help',
    'support',
    'bug',
    'issue',
    'error',
    'broken',
    'not working',
    'reset password',
    'login',
  ],
  sales: [
    'pricing',
    'quote',
    'demo',
    'purchase',
    'buy',
    'plan',
    'enterprise',
    'discount',
  ],
  billing: [
    'invoice',
    'billing',
    'refund',
    'charge',
    'receipt',
    'payment',
    'credit card',
  ],
  spam: [
    'free money',
    'click here',
    'winner',
    'act now',
    'limited offer',
    'crypto giveaway',
  ],
};

const app = express();
const port = Number.parseInt(process.env.PORT || '3000', 10);
const startedAt = Date.now();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'));
    },
  }),
);
app.use(express.json({ limit: '1mb' }));

function sanitizeCategories(inputCategories) {
  if (!Array.isArray(inputCategories) || inputCategories.length === 0) {
    return DEFAULT_CATEGORIES;
  }

  const unique = [];
  for (const value of inputCategories) {
    if (typeof value !== 'string') {
      continue;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized || unique.includes(normalized)) {
      continue;
    }

    unique.push(normalized);
  }

  return unique.length ? unique : DEFAULT_CATEGORIES;
}

function scoreCategories(emailText, categories) {
  const text = emailText.toLowerCase();
  const scores = {};

  for (const category of categories) {
    const keywords = CATEGORY_KEYWORDS[category] || [category];
    let score = 0;

    for (const phrase of keywords) {
      if (text.includes(phrase)) {
        score += 1;
      }
    }

    scores[category] = score;
  }

  return scores;
}

function toProbabilities(rawScores) {
  const epsilon = 0.1;
  const adjusted = Object.fromEntries(
    Object.entries(rawScores).map(([category, score]) => [category, score + epsilon]),
  );

  const total = Object.values(adjusted).reduce((sum, value) => sum + value, 0);
  const probabilities = {};
  for (const [category, value] of Object.entries(adjusted)) {
    probabilities[category] = Number((value / total).toFixed(4));
  }

  return probabilities;
}

function classifyEmail(email, categories) {
  const resolvedCategories = sanitizeCategories(categories);
  const rawScores = scoreCategories(email, resolvedCategories);
  const probabilities = toProbabilities(rawScores);

  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const [topCategory, topScore] = ranked[0];

  return {
    category: topCategory,
    confidence: topScore,
    scores: probabilities,
    priority: email.toLowerCase().includes('urgent') ? 'high' : 'normal',
  };
}

function handleClassify(req, res) {
  const { email, categories } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({
      error: 'Validation failed',
      message: '`email` must be a non-empty string.',
    });
    return;
  }

  const result = classifyEmail(email.trim(), categories);
  res.json({
    success: true,
    ...result,
    timestamp: new Date().toISOString(),
  });
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'email-intent-router',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
  });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'email-intent-router',
    status: 'ok',
    message: 'Use POST /classify with { email, categories? }',
  });
});

app.post('/classify', handleClassify);
app.post('/api/analyze', handleClassify);
app.post('/', handleClassify);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`email-intent-router listening on port ${port}`);
});
