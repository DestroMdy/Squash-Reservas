import "server-only";
import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import { BookingWaitlistEntry } from "@/types/db";

const BOOKING_WAITLIST_KV_KEY = "sr:booking-waitlists";

type WaitlistMap = Record<string, BookingWaitlistEntry[]>;

function normalizeWaitlistMap(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") {
    return {} as WaitlistMap;
  }

  return Object.entries(raw).reduce<WaitlistMap>((acc, [slotId, entries]) => {
    if (!Array.isArray(entries)) {
      return acc;
    }

    const normalizedEntries = entries
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => entry as Partial<BookingWaitlistEntry>)
      .filter((entry) => entry.user_id && entry.time_slot_id)
      .map((entry) => ({
        time_slot_id: entry.time_slot_id as string,
        user_id: entry.user_id as string,
        created_at: entry.created_at || new Date().toISOString()
      }));

    if (normalizedEntries.length) {
      acc[slotId] = normalizedEntries;
    }

    return acc;
  }, {});
}

async function getWaitlistMap() {
  return normalizeWaitlistMap(
    await getJsonKv<Record<string, unknown>>(BOOKING_WAITLIST_KV_KEY)
  );
}

async function saveWaitlistMap(waitlistMap: WaitlistMap) {
  if (!Object.keys(waitlistMap).length) {
    await deleteKv(BOOKING_WAITLIST_KV_KEY);
    return;
  }

  await setJsonKv(BOOKING_WAITLIST_KV_KEY, waitlistMap);
}

export function isBookingWaitlistStoreConfigured() {
  return isKvConfigured();
}

export async function getWaitlistForSlot(slotId: string) {
  const waitlistMap = await getWaitlistMap();
  return waitlistMap[slotId] || [];
}

export async function getWaitlistSnapshot(slotIds: string[], userId?: string | null) {
  const waitlistMap = await getWaitlistMap();

  return slotIds.reduce<
    Record<
      string,
      {
        count: number;
        joined: boolean;
      }
    >
  >((acc, slotId) => {
    const entries = waitlistMap[slotId] || [];
    acc[slotId] = {
      count: entries.length,
      joined: Boolean(userId && entries.some((entry) => entry.user_id === userId))
    };
    return acc;
  }, {});
}

export async function addUserToWaitlist(slotId: string, userId: string) {
  const waitlistMap = await getWaitlistMap();
  const currentEntries = waitlistMap[slotId] || [];

  if (!currentEntries.some((entry) => entry.user_id === userId)) {
    currentEntries.push({
      time_slot_id: slotId,
      user_id: userId,
      created_at: new Date().toISOString()
    });
  }

  waitlistMap[slotId] = currentEntries.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  await saveWaitlistMap(waitlistMap);
  return waitlistMap[slotId];
}

export async function removeUserFromWaitlist(slotId: string, userId: string) {
  const waitlistMap = await getWaitlistMap();
  const nextEntries = (waitlistMap[slotId] || []).filter(
    (entry) => entry.user_id !== userId
  );

  if (nextEntries.length) {
    waitlistMap[slotId] = nextEntries;
  } else {
    delete waitlistMap[slotId];
  }

  await saveWaitlistMap(waitlistMap);
  return nextEntries;
}

export async function clearWaitlistForSlot(slotId: string) {
  const waitlistMap = await getWaitlistMap();
  delete waitlistMap[slotId];
  await saveWaitlistMap(waitlistMap);
}
