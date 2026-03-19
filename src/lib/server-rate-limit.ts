type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
};

const RATE_LIMIT_STORE_KEY = "__sr_rate_limit_store__";

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitEntry>;
  };

  if (!globalScope[RATE_LIMIT_STORE_KEY]) {
    globalScope[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>();
  }

  return globalScope[RATE_LIMIT_STORE_KEY]!;
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit({
  key,
  max,
  windowMs
}: {
  key: string;
  max: number;
  windowMs: number;
}): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs
    });

    return {
      ok: true,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      )
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    ok: true,
    retryAfterSeconds: 0
  };
}
