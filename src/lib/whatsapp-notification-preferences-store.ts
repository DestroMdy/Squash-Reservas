import "server-only";

import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";

const WHATSAPP_NOTIFICATION_PREFERENCES_KV_KEY =
  "sr:whatsapp-notification-preferences";

type WaitlistWhatsAppPreferenceRecord = {
  waitlist_opt_in: boolean;
  updated_at: string;
};

type WaitlistWhatsAppPreferenceMap = Record<
  string,
  WaitlistWhatsAppPreferenceRecord
>;

function normalizePreferenceMap(
  raw: Record<string, unknown> | null | undefined
) {
  if (!raw || typeof raw !== "object") {
    return {} as WaitlistWhatsAppPreferenceMap;
  }

  return Object.entries(raw).reduce<WaitlistWhatsAppPreferenceMap>(
    (acc, [userId, value]) => {
      if (!value || typeof value !== "object") {
        return acc;
      }

      const record = value as Partial<WaitlistWhatsAppPreferenceRecord>;

      if (record.waitlist_opt_in !== true) {
        return acc;
      }

      acc[userId] = {
        waitlist_opt_in: true,
        updated_at: record.updated_at || new Date().toISOString()
      };

      return acc;
    },
    {}
  );
}

async function getPreferenceMap() {
  return normalizePreferenceMap(
    await getJsonKv<Record<string, unknown>>(
      WHATSAPP_NOTIFICATION_PREFERENCES_KV_KEY
    )
  );
}

async function savePreferenceMap(
  preferenceMap: WaitlistWhatsAppPreferenceMap
) {
  if (!Object.keys(preferenceMap).length) {
    await deleteKv(WHATSAPP_NOTIFICATION_PREFERENCES_KV_KEY);
    return;
  }

  await setJsonKv(WHATSAPP_NOTIFICATION_PREFERENCES_KV_KEY, preferenceMap);
}

export function isWhatsAppNotificationPreferenceStoreConfigured() {
  return isKvConfigured();
}

export async function getWaitlistWhatsAppPreference(userId: string) {
  const preferenceMap = await getPreferenceMap();
  return preferenceMap[userId] || null;
}

export async function getWaitlistWhatsAppPreferences(userIds: string[]) {
  const preferenceMap = await getPreferenceMap();

  return userIds.reduce<Record<string, WaitlistWhatsAppPreferenceRecord | null>>(
    (acc, userId) => {
      acc[userId] = preferenceMap[userId] || null;
      return acc;
    },
    {}
  );
}

export async function setWaitlistWhatsAppPreference(
  userId: string,
  waitlistOptIn: boolean
) {
  const preferenceMap = await getPreferenceMap();

  if (waitlistOptIn) {
    preferenceMap[userId] = {
      waitlist_opt_in: true,
      updated_at: new Date().toISOString()
    };
  } else {
    delete preferenceMap[userId];
  }

  await savePreferenceMap(preferenceMap);
}

