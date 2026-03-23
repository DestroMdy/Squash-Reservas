import "server-only";

type KvConfig = {
  url: string;
  token: string;
};

export function getKvConfig(): KvConfig | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export function isKvConfigured() {
  return Boolean(getKvConfig());
}

export async function callKv(command: string[]) {
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

export async function getJsonKv<T>(key: string) {
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

export async function setJsonKv(key: string, value: unknown) {
  await callKv(["set", key, JSON.stringify(value)]);
}

export async function deleteKv(key: string) {
  await callKv(["del", key]);
}
