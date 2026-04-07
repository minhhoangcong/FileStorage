const buckets = new Map();

const WINDOW_MS = Math.max(30_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 600_000));
const MAX_REQUESTS = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 20));

const now = () => Date.now();

const getKey = (req) => `${req.ip || "unknown"}:${req.path}`;

const getBucket = (key) => {
  const hit = buckets.get(key);
  if (!hit || now() > hit.resetAt) {
    const fresh = { count: 0, resetAt: now() + WINDOW_MS };
    buckets.set(key, fresh);
    return fresh;
  }
  return hit;
};

export const authRateLimiter = (req, res, next) => {
  const key = getKey(req);
  const bucket = getBucket(key);
  bucket.count += 1;

  const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
  res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).send({
      success: false,
      message: "Too many auth requests, please try again later",
    });
  }
  return next();
};
