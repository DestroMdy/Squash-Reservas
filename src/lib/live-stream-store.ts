import "server-only";
import { randomUUID } from "crypto";
import {
  getLiveCourtLabel,
  LIVE_COURTS,
  normalizeAdminLiveStreamConfig
} from "@/lib/live-stream";
import {
  AdminLiveStreamConfig,
  LiveCourtId,
  LiveCourtState,
  LiveScoreboard
} from "@/types/db";

const LIVE_CENTER_CONFIG_KV_KEY = "sr:live-center:config";
const LIVE_CENTER_SCOREBOARDS_KV_KEY = "sr:live-center:scoreboards";
const LIVE_CENTER_SQUORE_TOKENS_KV_KEY = "sr:live-center:squore-tokens";

const LEGACY_LIVE_STREAM_KV_KEY = "sr:live-stream:config";
const LEGACY_LIVE_STREAM_SCOREBOARD_KV_KEY = "sr:live-stream:scoreboard";
const LEGACY_LIVE_STREAM_SQUORE_TOKEN_KV_KEY = "sr:live-stream:squore-token";

type LiveCenterConfigMap = Record<LiveCourtId, AdminLiveStreamConfig | null>;
type LiveCenterScoreboardMap = Record<LiveCourtId, LiveScoreboard | null>;
type LiveCenterTokenMap = Record<LiveCourtId, string | null>;

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

async function getJsonKv<T>(key: string) {
  const result = await callKv(["get", key]);

  if (typeof result !== "string" || !result.trim()) {
    return null;
  }

  try {
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}

async function setJsonKv(key: string, value: unknown) {
  await callKv(["set", key, JSON.stringify(value)]);
}

function createEmptyConfigMap(): LiveCenterConfigMap {
  return {
    "court-1": null,
    "court-2": null
  };
}

function createEmptyScoreboardMap(): LiveCenterScoreboardMap {
  return {
    "court-1": null,
    "court-2": null
  };
}

function createEmptyTokenMap(): LiveCenterTokenMap {
  return {
    "court-1": null,
    "court-2": null
  };
}

function serializeConfigMap(configMap: LiveCenterConfigMap) {
  const serialized: Partial<Record<LiveCourtId, AdminLiveStreamConfig>> = {};

  for (const court of LIVE_COURTS) {
    const value = configMap[court.id];
    if (value) {
      serialized[court.id] = value;
    }
  }

  return serialized;
}

function serializeScoreboardMap(scoreboardMap: LiveCenterScoreboardMap) {
  const serialized: Partial<Record<LiveCourtId, LiveScoreboard>> = {};

  for (const court of LIVE_COURTS) {
    const value = scoreboardMap[court.id];
    if (value) {
      serialized[court.id] = value;
    }
  }

  return serialized;
}

function serializeTokenMap(tokenMap: LiveCenterTokenMap) {
  const serialized: Partial<Record<LiveCourtId, string>> = {};

  for (const court of LIVE_COURTS) {
    const value = tokenMap[court.id];
    if (value) {
      serialized[court.id] = value;
    }
  }

  return serialized;
}

function hasAnyValues(values: Record<string, unknown | null>) {
  return Object.values(values).some(Boolean);
}

function normalizeConfigMap(raw: Record<string, unknown> | null | undefined) {
  const configMap = createEmptyConfigMap();

  if (!raw || typeof raw !== "object") {
    return configMap;
  }

  for (const court of LIVE_COURTS) {
    configMap[court.id] = normalizeAdminLiveStreamConfig(
      raw[court.id] as AdminLiveStreamConfig | null | undefined
    );
  }

  return configMap;
}

function normalizeScoreboardMap(raw: Record<string, unknown> | null | undefined) {
  const scoreboards = createEmptyScoreboardMap();

  if (!raw || typeof raw !== "object") {
    return scoreboards;
  }

  for (const court of LIVE_COURTS) {
    const value = raw[court.id];
    scoreboards[court.id] =
      value && typeof value === "object" ? (value as LiveScoreboard) : null;
  }

  return scoreboards;
}

function normalizeTokenMap(raw: Record<string, unknown> | null | undefined) {
  const tokens = createEmptyTokenMap();

  if (!raw || typeof raw !== "object") {
    return tokens;
  }

  for (const court of LIVE_COURTS) {
    const value = raw[court.id];
    tokens[court.id] = typeof value === "string" && value.trim() ? value.trim() : null;
  }

  return tokens;
}

async function getLegacyLiveStream() {
  const raw = await getJsonKv<Record<string, unknown>>(LEGACY_LIVE_STREAM_KV_KEY);
  return normalizeAdminLiveStreamConfig(raw as AdminLiveStreamConfig | null | undefined);
}

async function getLegacyLiveScoreboard() {
  return getJsonKv<LiveScoreboard>(LEGACY_LIVE_STREAM_SCOREBOARD_KV_KEY);
}

async function getLegacyLiveSquoreToken() {
  const result = await callKv(["get", LEGACY_LIVE_STREAM_SQUORE_TOKEN_KV_KEY]);
  return typeof result === "string" && result.trim() ? result.trim() : null;
}

export function isLiveStreamStoreConfigured() {
  return Boolean(getKvConfig());
}

export async function getStoredLiveCenterConfigMap() {
  const configMap = normalizeConfigMap(
    await getJsonKv<Record<string, unknown>>(LIVE_CENTER_CONFIG_KV_KEY)
  );

  if (hasAnyValues(configMap)) {
    return configMap;
  }

  const legacyStream = await getLegacyLiveStream();
  if (legacyStream) {
    configMap["court-1"] = legacyStream;
  }

  return configMap;
}

export async function getStoredLiveCenterScoreboardMap() {
  const scoreboardMap = normalizeScoreboardMap(
    await getJsonKv<Record<string, unknown>>(LIVE_CENTER_SCOREBOARDS_KV_KEY)
  );

  if (hasAnyValues(scoreboardMap)) {
    return scoreboardMap;
  }

  const legacyScoreboard = await getLegacyLiveScoreboard();
  if (legacyScoreboard) {
    scoreboardMap["court-1"] = legacyScoreboard;
  }

  return scoreboardMap;
}

export async function getStoredLiveCenterSquoreTokenMap() {
  const tokenMap = normalizeTokenMap(
    await getJsonKv<Record<string, unknown>>(LIVE_CENTER_SQUORE_TOKENS_KV_KEY)
  );

  if (hasAnyValues(tokenMap)) {
    return tokenMap;
  }

  const legacyToken = await getLegacyLiveSquoreToken();
  if (legacyToken) {
    tokenMap["court-1"] = legacyToken;
  }

  return tokenMap;
}

export async function getStoredLiveCenterCourts(): Promise<LiveCourtState[]> {
  const [configMap, scoreboardMap] = await Promise.all([
    getStoredLiveCenterConfigMap(),
    getStoredLiveCenterScoreboardMap()
  ]);

  return LIVE_COURTS.map((court) => ({
    id: court.id,
    label: court.label,
    stream: configMap[court.id],
    scoreboard: scoreboardMap[court.id]
  }));
}

export async function getStoredLiveCourtStream(courtId: LiveCourtId) {
  const configMap = await getStoredLiveCenterConfigMap();
  return configMap[courtId];
}

export async function setStoredLiveCourtStream(
  courtId: LiveCourtId,
  value: Omit<AdminLiveStreamConfig, "embed_url"> | AdminLiveStreamConfig
) {
  const normalized = normalizeAdminLiveStreamConfig(value);

  if (!normalized) {
    throw new Error(`La configuracion del vivo para ${getLiveCourtLabel(courtId)} es invalida.`);
  }

  const configMap = await getStoredLiveCenterConfigMap();
  configMap[courtId] = normalized;
  await setJsonKv(LIVE_CENTER_CONFIG_KV_KEY, serializeConfigMap(configMap));
  return normalized;
}

export async function clearStoredLiveCourtStream(courtId: LiveCourtId) {
  const configMap = await getStoredLiveCenterConfigMap();
  configMap[courtId] = null;

  const serialized = serializeConfigMap(configMap);
  if (hasAnyValues(serialized)) {
    await setJsonKv(LIVE_CENTER_CONFIG_KV_KEY, serialized);
  } else {
    await callKv(["del", LIVE_CENTER_CONFIG_KV_KEY]);
  }
}

export async function getStoredLiveCourtScoreboard(courtId: LiveCourtId) {
  const scoreboards = await getStoredLiveCenterScoreboardMap();
  return scoreboards[courtId];
}

export async function setStoredLiveCourtScoreboard(
  courtId: LiveCourtId,
  scoreboard: LiveScoreboard
) {
  const scoreboards = await getStoredLiveCenterScoreboardMap();
  scoreboards[courtId] = scoreboard;
  await setJsonKv(
    LIVE_CENTER_SCOREBOARDS_KV_KEY,
    serializeScoreboardMap(scoreboards)
  );

  return scoreboard;
}

export async function clearStoredLiveCourtScoreboard(courtId: LiveCourtId) {
  const scoreboards = await getStoredLiveCenterScoreboardMap();
  scoreboards[courtId] = null;

  const serialized = serializeScoreboardMap(scoreboards);
  if (hasAnyValues(serialized)) {
    await setJsonKv(LIVE_CENTER_SCOREBOARDS_KV_KEY, serialized);
  } else {
    await callKv(["del", LIVE_CENTER_SCOREBOARDS_KV_KEY]);
  }
}

export async function getStoredLiveCourtSquoreToken(courtId: LiveCourtId) {
  const tokens = await getStoredLiveCenterSquoreTokenMap();
  return tokens[courtId];
}

export async function ensureStoredLiveCourtSquoreToken(courtId: LiveCourtId) {
  const tokens = await getStoredLiveCenterSquoreTokenMap();
  const existing = tokens[courtId];

  if (existing) {
    return existing;
  }

  const nextToken = randomUUID().replaceAll("-", "");
  tokens[courtId] = nextToken;
  await setJsonKv(LIVE_CENTER_SQUORE_TOKENS_KV_KEY, serializeTokenMap(tokens));
  return nextToken;
}

export async function getStoredLiveStream() {
  return getStoredLiveCourtStream("court-1");
}

export async function setStoredLiveStream(
  value: Omit<AdminLiveStreamConfig, "embed_url"> | AdminLiveStreamConfig
) {
  return setStoredLiveCourtStream("court-1", value);
}

export async function clearStoredLiveStream() {
  return clearStoredLiveCourtStream("court-1");
}

export async function getStoredLiveScoreboard() {
  return getStoredLiveCourtScoreboard("court-1");
}

export async function setStoredLiveScoreboard(scoreboard: LiveScoreboard) {
  return setStoredLiveCourtScoreboard("court-1", scoreboard);
}

export async function clearStoredLiveScoreboard() {
  return clearStoredLiveCourtScoreboard("court-1");
}

export async function getStoredLiveSquoreToken() {
  return getStoredLiveCourtSquoreToken("court-1");
}

export async function ensureStoredLiveSquoreToken() {
  return ensureStoredLiveCourtSquoreToken("court-1");
}
