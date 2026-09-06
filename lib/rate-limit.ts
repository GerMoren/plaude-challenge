const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

type Bucket = { count: number; resetAt: number };

// Per-instance only: on Vercel each Function instance keeps its own map, so this
// throttles casual abuse but is not a distributed limiter. A real deployment
// would back this with Redis (or Vercel's firewall rate limiting) instead.
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  clientId: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = buckets.get(clientId);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function __resetRateLimits() {
  buckets.clear();
}
