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

function getKvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

async function callKv(command: string[]) {
  const kv = getKvConfig();
  if (!kv) {
    return null;
  }

  const encodedCommand = command
    .map((part) => encodeURIComponent(part))
    .join("/");

  const response = await fetch(`${kv.url}/${encodedCommand}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kv.token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`KV request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: string | number | null };
  return payload.result;
}

async function checkPersistentRateLimit({
  key,
  max,
  windowMs
}: {
  key: string;
  max: number;
  windowMs: number;
}): Promise<RateLimitResult | null> {
  const kv = getKvConfig();
  if (!kv) {
    return null;
  }

  const namespacedKey = `sr:rate-limit:${key}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const currentCountRaw = await callKv(["incr", namespacedKey]);
  const currentCount = Number(currentCountRaw ?? 0);

  if (currentCount === 1) {
    await callKv(["expire", namespacedKey, String(windowSeconds)]);
  }

  if (currentCount <= max) {
    return {
      ok: true,
      retryAfterSeconds: 0
    };
  }

  const ttlRaw = await callKv(["ttl", namespacedKey]);
  const ttl = Number(ttlRaw ?? windowSeconds);

  return {
    ok: false,
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds
  };
}

function checkMemoryRateLimit({
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

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function checkRateLimit({
  key,
  max,
  windowMs
}: {
  key: string;
  max: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  try {
    const persistentResult = await checkPersistentRateLimit({
      key,
      max,
      windowMs
    });

    if (persistentResult) {
      return persistentResult;
    }
  } catch {
    // Fall back to in-memory protection if KV is unavailable.
  }

  return checkMemoryRateLimit({
    key,
    max,
    windowMs
  });
}
