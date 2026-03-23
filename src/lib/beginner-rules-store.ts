import "server-only";

const BEGINNER_RULES_ACK_KV_KEY = "sr:beginner-rules:ack";

const inMemoryAcknowledgements = new Map<string, string>();

type BeginnerRulesAckMap = Record<string, string>;

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

  const payload = (await response.json()) as {
    result?: string | number | null;
  };

  return payload.result ?? null;
}

async function getStoredMap() {
  const kv = getKvConfig();

  if (!kv) {
    return Object.fromEntries(inMemoryAcknowledgements.entries());
  }

  const result = await callKv(["get", BEGINNER_RULES_ACK_KV_KEY]);

  if (typeof result !== "string" || !result.trim()) {
    return {} as BeginnerRulesAckMap;
  }

  try {
    return JSON.parse(result) as BeginnerRulesAckMap;
  } catch {
    return {} as BeginnerRulesAckMap;
  }
}

async function persistMap(map: BeginnerRulesAckMap) {
  const kv = getKvConfig();

  if (!kv) {
    inMemoryAcknowledgements.clear();
    Object.entries(map).forEach(([userId, acknowledgedAt]) => {
      inMemoryAcknowledgements.set(userId, acknowledgedAt);
    });
    return;
  }

  await callKv(["set", BEGINNER_RULES_ACK_KV_KEY, JSON.stringify(map)]);
}

export async function getBeginnerRulesAcknowledgedAt(userId: string) {
  const map = await getStoredMap();
  return map[userId] || null;
}

export async function setBeginnerRulesAcknowledgedAt(
  userId: string,
  acknowledgedAt = new Date().toISOString()
) {
  const map = await getStoredMap();
  map[userId] = acknowledgedAt;
  await persistMap(map);
  return acknowledgedAt;
}
