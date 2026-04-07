"use client";

export const PUSH_STATUS_EVENT = "sr-push-status-change";

const PUSH_STATUS_STORAGE_KEY = "sr_push_notifications_enabled";
const PUSH_PROMPT_DISMISSED_KEY = "sr_push_notifications_prompt_dismissed";
const PUSH_SERVICE_WORKER_URL = "/push-sw.js";

type PushAvailabilityResponse = {
  available?: boolean;
  publicKey?: string | null;
};

function setPushStatusFlag(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PUSH_STATUS_STORAGE_KEY,
    enabled ? "true" : "false"
  );
  window.dispatchEvent(
    new CustomEvent(PUSH_STATUS_EVENT, {
      detail: { enabled }
    })
  );
}

function base64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

async function fetchPushAvailability() {
  const response = await fetch("/api/push/public-key", {
    method: "GET",
    cache: "no-store"
  });

  const payload = (await response.json()) as PushAvailabilityResponse;

  return {
    available: payload.available === true,
    publicKey: payload.publicKey || null
  };
}

async function registerPushServiceWorker() {
  const registration = await navigator.serviceWorker.register(
    PUSH_SERVICE_WORKER_URL,
    {
      scope: "/",
      updateViaCache: "none"
    }
  );

  await navigator.serviceWorker.ready;
  return registration;
}

async function persistPushSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      subscription: subscription.toJSON()
    })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      payload.error || "No se pudo activar las notificaciones push."
    );
  }
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPushStatusFlag() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(PUSH_STATUS_STORAGE_KEY) === "true";
}

export function isPushPromptDismissed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === "true";
}

export function dismissPushPrompt() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "true");
}

export function clearPushPromptDismissed() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY);
}

export async function ensurePushSubscription() {
  if (!isPushSupported()) {
    return {
      available: false,
      enabled: false,
      permission: "unsupported" as const
    };
  }

  const availability = await fetchPushAvailability();

  if (!availability.available || !availability.publicKey) {
    setPushStatusFlag(false);
    return {
      available: false,
      enabled: false,
      permission: Notification.permission
    };
  }

  const registration = await registerPushServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription && Notification.permission === "granted") {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(availability.publicKey)
    });
  }

  if (!subscription) {
    setPushStatusFlag(false);
    return {
      available: true,
      enabled: false,
      permission: Notification.permission
    };
  }

  await persistPushSubscription(subscription);
  clearPushPromptDismissed();
  setPushStatusFlag(true);

  return {
    available: true,
    enabled: true,
    permission: Notification.permission
  };
}

export async function requestPushPermissionAndSubscribe() {
  if (!isPushSupported()) {
    return {
      available: false,
      enabled: false,
      permission: "unsupported" as const
    };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    setPushStatusFlag(false);

    if (permission === "denied") {
      dismissPushPrompt();
    }

    return {
      available: true,
      enabled: false,
      permission
    };
  }

  return ensurePushSubscription();
}
