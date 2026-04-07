const DEFAULT_ALLOWED_HEADERS = "Authorization,Content-Type";
const DEFAULT_ALLOWED_METHODS = "GET,POST,PATCH,PUT,DELETE,OPTIONS";

const parseOrigins = () =>
  String(process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return true;
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.includes(origin);
};

export const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
};

export const corsMiddleware = (req, res, next) => {
  const allowedOrigins = parseOrigins();
  const origin = req.headers.origin;

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return res.status(403).send({ success: false, message: "Origin is not allowed by CORS policy" });
  }

  if (origin) {
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes("*") ? "*" : origin);
  }
  res.setHeader("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);

  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
};
