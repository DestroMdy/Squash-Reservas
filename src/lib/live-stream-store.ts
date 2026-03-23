import "server-only";
import { randomUUID } from "crypto";
import { normalizeLiveStreamConfig } from "@/lib/live-stream";
import { LiveScoreboard, LiveStreamConfig } from "@/types/db";

const LIVE_STREAM_KV_KEY = "sr:live-stream:config";
const LIVE_STREAM_SCOREBOARD_KV_KEY = "sr:live-stream:scoreboard";
const LIVE_STREAM_SQUORE_TOKEN_KV_KEY = "sr:live-stream:squore-token";

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
    throw new Error("La configuracion de KV no esta disponible.");
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

  const payload = (await response.json()) as {
    result?: string | number | null;
  };

  return payload.result ?? null;
}

export function isLiveStreamStoreConfigured() {
  return Boolean(getKvConfig());
}

export async function getStoredLiveStream() {
  const result = await callKv(["get", LIVE_STREAM_KV_KEY]);

  if (typeof result !== "string" || !result.trim()) {
    return null;
  }

  try {
    return normalizeLiveStreamConfig(JSON.parse(result)) as LiveStreamConfig | null;
  } catch {
    return null;
  }
}

export async function setStoredLiveStream(
  value: Omit<LiveStreamConfig, "embed_url"> | LiveStreamConfig
) {
  const normalized = normalizeLiveStreamConfig(value);

  if (!normalized) {
    throw new Error("La configuracion del vivo es invalida.");
  }

  await callKv(["set", LIVE_STREAM_KV_KEY, JSON.stringify(normalized)]);
  return normalized;
}

export async function clearStoredLiveStream() {
  await callKv(["del", LIVE_STREAM_KV_KEY]);
}

export async function getStoredLiveScoreboard() {
  const result = await callKv(["get", LIVE_STREAM_SCOREBOARD_KV_KEY]);

  if (typeof result !== "string" || !result.trim()) {
    return null;
  }

  try {
    return JSON.parse(result) as LiveScoreboard;
  } catch {
    return null;
  }
}

export async function setStoredLiveScoreboard(scoreboard: LiveScoreboard) {
  await callKv([
    "set",
    LIVE_STREAM_SCOREBOARD_KV_KEY,
    JSON.stringify(scoreboard)
  ]);

  return scoreboard;
}

export async function clearStoredLiveScoreboard() {
  await callKv(["del", LIVE_STREAM_SCOREBOARD_KV_KEY]);
}

export async function getStoredLiveSquoreToken() {
  const result = await callKv(["get", LIVE_STREAM_SQUORE_TOKEN_KV_KEY]);

  if (typeof result !== "string" || !result.trim()) {
    return null;
  }

  return result.trim();
}

export async function ensureStoredLiveSquoreToken() {
  const existing = await getStoredLiveSquoreToken();

  if (existing) {
    return existing;
  }

  const nextToken = randomUUID().replaceAll("-", "");
  await callKv(["set", LIVE_STREAM_SQUORE_TOKEN_KV_KEY, nextToken]);
  return nextToken;
}
