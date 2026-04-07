import "server-only";

import { getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";

const PUSH_SUBSCRIPTIONS_KEY = "push:subscriptions:v1";

export type StoredPushSubscription = {
  user_id: string;
  subscription: PushSubscriptionJSON;
  updated_at: string;
  user_agent?: string | null;
};

type StoredPushSubscriptionMap = Record<string, StoredPushSubscription>;

function normalizeEndpoint(
  subscription: Pick<PushSubscriptionJSON, "endpoint"> | null | undefined
) {
  const endpoint = subscription?.endpoint?.trim();
  return endpoint || null;
}

async function readPushSubscriptions() {
  return (
    (await getJsonKv<StoredPushSubscriptionMap>(PUSH_SUBSCRIPTIONS_KEY)) || {}
  );
}

async function writePushSubscriptions(store: StoredPushSubscriptionMap) {
  await setJsonKv(PUSH_SUBSCRIPTIONS_KEY, store);
}

export function isPushSubscriptionStoreConfigured() {
  return isKvConfigured();
}

export async function upsertPushSubscription({
  userId,
  subscription,
  userAgent
}: {
  userId: string;
  subscription: PushSubscriptionJSON;
  userAgent?: string | null;
}) {
  if (!isPushSubscriptionStoreConfigured()) {
    return;
  }

  const endpoint = normalizeEndpoint(subscription);
  if (!endpoint) {
    throw new Error("La suscripcion push no tiene un endpoint valido.");
  }

  const store = await readPushSubscriptions();
  store[endpoint] = {
    user_id: userId,
    subscription,
    updated_at: new Date().toISOString(),
    user_agent: userAgent || null
  };
  await writePushSubscriptions(store);
}

export async function removePushSubscription(endpoint: string) {
  if (!isPushSubscriptionStoreConfigured()) {
    return;
  }

  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    return;
  }

  const store = await readPushSubscriptions();
  if (!store[normalizedEndpoint]) {
    return;
  }

  delete store[normalizedEndpoint];
  await writePushSubscriptions(store);
}

export async function removePushSubscriptions(endpoints: string[]) {
  if (!isPushSubscriptionStoreConfigured() || !endpoints.length) {
    return;
  }

  const store = await readPushSubscriptions();
  let changed = false;

  for (const endpoint of endpoints) {
    const normalizedEndpoint = endpoint.trim();
    if (!normalizedEndpoint || !store[normalizedEndpoint]) {
      continue;
    }

    delete store[normalizedEndpoint];
    changed = true;
  }

  if (changed) {
    await writePushSubscriptions(store);
  }
}

export async function getPushSubscriptionsForUsers(userIds: string[]) {
  if (!isPushSubscriptionStoreConfigured() || !userIds.length) {
    return [] as StoredPushSubscription[];
  }

  const allowedUserIds = new Set(userIds);
  const store = await readPushSubscriptions();

  return Object.values(store).filter((entry) => {
    const endpoint = normalizeEndpoint(entry.subscription);
    return Boolean(endpoint && allowedUserIds.has(entry.user_id));
  });
}
