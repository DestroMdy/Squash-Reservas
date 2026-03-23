import "server-only";
import { normalizeLiveStreamConfig } from "@/lib/live-stream";
import { LiveStreamConfig } from "@/types/db";

const LIVE_STREAM_KV_KEY = "sr:live-stream:config";

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
