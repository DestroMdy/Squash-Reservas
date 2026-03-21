import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/server-rate-limit";

describe("server-rate-limit", () => {
  const originalKvUrl = process.env.KV_REST_API_URL;
  const originalKvToken = process.env.KV_REST_API_TOKEN;

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T12:00:00Z"));
  });

  afterEach(() => {
    process.env.KV_REST_API_URL = originalKvUrl;
    process.env.KV_REST_API_TOKEN = originalKvToken;
    vi.useRealTimers();
  });

  it("bloquea cuando supera el máximo en memoria", async () => {
    const key = `qa-${Date.now()}`;

    expect(await checkRateLimit({ key, max: 2, windowMs: 1_000 })).toEqual({
      ok: true,
      retryAfterSeconds: 0
    });
    expect(await checkRateLimit({ key, max: 2, windowMs: 1_000 })).toEqual({
      ok: true,
      retryAfterSeconds: 0
    });

    const blocked = await checkRateLimit({ key, max: 2, windowMs: 1_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("se recupera al vencer la ventana", async () => {
    const key = `qa-reset-${Date.now()}`;

    await checkRateLimit({ key, max: 1, windowMs: 1_000 });
    const blocked = await checkRateLimit({ key, max: 1, windowMs: 1_000 });
    expect(blocked.ok).toBe(false);

    vi.advanceTimersByTime(1_001);

    const reopened = await checkRateLimit({ key, max: 1, windowMs: 1_000 });
    expect(reopened).toEqual({
      ok: true,
      retryAfterSeconds: 0
    });
  });
});
