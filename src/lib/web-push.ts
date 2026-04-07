import "server-only";

import webpush from "web-push";
import {
  getPushSubscriptionsForUsers,
  isPushSubscriptionStoreConfigured,
  removePushSubscriptions
} from "@/lib/push-subscriptions-store";

type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

let vapidConfigured = false;

function getTrimmedEnv(name: "WEB_PUSH_VAPID_PUBLIC_KEY" | "WEB_PUSH_VAPID_PRIVATE_KEY" | "WEB_PUSH_VAPID_SUBJECT") {
  return process.env[name]?.trim() || null;
}

function ensureWebPushConfigured() {
  if (vapidConfigured) {
    return;
  }

  const publicKey = getTrimmedEnv("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = getTrimmedEnv("WEB_PUSH_VAPID_PRIVATE_KEY");
  const subject =
    getTrimmedEnv("WEB_PUSH_VAPID_SUBJECT") ||
    "https://squashreservas.vercel.app";

  if (!publicKey || !privateKey) {
    throw new Error("Faltan las claves VAPID para Web Push.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

function isEndpointExpired(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const payload = error as {
    statusCode?: number;
    body?: string;
    message?: string;
  };

  return (
    payload.statusCode === 404 ||
    payload.statusCode === 410 ||
    payload.body?.includes("expired") === true ||
    payload.message?.includes("expired") === true
  );
}

export function getWebPushPublicKey() {
  return getTrimmedEnv("WEB_PUSH_VAPID_PUBLIC_KEY");
}

export function isWebPushConfigured() {
  return Boolean(
    getTrimmedEnv("WEB_PUSH_VAPID_PUBLIC_KEY") &&
      getTrimmedEnv("WEB_PUSH_VAPID_PRIVATE_KEY") &&
      isPushSubscriptionStoreConfigured()
  );
}

export async function sendWebPushToUserIds(
  userIds: string[],
  payload: PushNotificationPayload
) {
  if (!isWebPushConfigured() || !userIds.length) {
    return {
      sent: 0,
      failed: 0
    };
  }

  ensureWebPushConfigured();

  const subscriptions = await getPushSubscriptionsForUsers(userIds);

  if (!subscriptions.length) {
    return {
      sent: 0,
      failed: 0
    };
  }

  const serializedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    data: payload.data || {}
  });

  const invalidEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (entry) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: entry.subscription.endpoint || "",
            expirationTime: entry.subscription.expirationTime || null,
            keys: {
              auth: entry.subscription.keys?.auth || "",
              p256dh: entry.subscription.keys?.p256dh || ""
            }
          },
          serializedPayload
        );
        sent += 1;
      } catch (error) {
        failed += 1;

        if (isEndpointExpired(error)) {
          const endpoint = entry.subscription.endpoint?.trim();
          if (endpoint) {
            invalidEndpoints.push(endpoint);
          }
        }
      }
    })
  );

  if (invalidEndpoints.length) {
    await removePushSubscriptions(invalidEndpoints).catch(() => null);
  }

  return {
    sent,
    failed
  };
}
