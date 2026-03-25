import "server-only";
import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import type {
  ScheduleDayOverride,
  ScheduleDayOverrideMode
} from "@/types/db";

const SCHEDULE_OVERRIDES_KV_KEY = "sr:schedule-overrides";

type ScheduleOverrideMap = Record<string, ScheduleDayOverride>;

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTimeValue(value: string | null | undefined) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function isMode(value: unknown): value is ScheduleDayOverrideMode {
  return value === "closed" || value === "custom_hours";
}

function normalizeOverride(
  slotDate: string,
  value: Partial<ScheduleDayOverride> | null | undefined
) {
  if (!value || !isMode(value.mode) || !isDateKey(slotDate)) {
    return null;
  }

  const note =
    typeof value.note === "string" && value.note.trim() ? value.note.trim() : null;
  const opensAt = normalizeTimeValue(value.opens_at);
  const closesAt = normalizeTimeValue(value.closes_at);

  if (value.mode === "custom_hours") {
    if (!opensAt || !closesAt || opensAt >= closesAt) {
      return null;
    }
  }

  return {
    slot_date: slotDate,
    mode: value.mode,
    opens_at: value.mode === "custom_hours" ? opensAt : null,
    closes_at: value.mode === "custom_hours" ? closesAt : null,
    note,
    updated_at:
      typeof value.updated_at === "string" && value.updated_at.trim()
        ? value.updated_at
        : new Date().toISOString(),
    updated_by:
      typeof value.updated_by === "string" && value.updated_by.trim()
        ? value.updated_by
        : null
  } satisfies ScheduleDayOverride;
}

function normalizeOverrideMap(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") {
    return {} as ScheduleOverrideMap;
  }

  return Object.entries(raw).reduce<ScheduleOverrideMap>((acc, [slotDate, value]) => {
    const normalized = normalizeOverride(
      slotDate,
      value as Partial<ScheduleDayOverride> | null | undefined
    );

    if (normalized) {
      acc[slotDate] = normalized;
    }

    return acc;
  }, {});
}

async function getOverrideMap() {
  return normalizeOverrideMap(
    await getJsonKv<Record<string, unknown>>(SCHEDULE_OVERRIDES_KV_KEY)
  );
}

async function saveOverrideMap(overrideMap: ScheduleOverrideMap) {
  if (!Object.keys(overrideMap).length) {
    await deleteKv(SCHEDULE_OVERRIDES_KV_KEY);
    return;
  }

  await setJsonKv(SCHEDULE_OVERRIDES_KV_KEY, overrideMap);
}

export function isScheduleOverrideStoreConfigured() {
  return isKvConfigured();
}

export async function getStoredScheduleOverride(slotDate: string) {
  if (!isScheduleOverrideStoreConfigured() || !isDateKey(slotDate)) {
    return null;
  }

  const overrideMap = await getOverrideMap();
  return overrideMap[slotDate] || null;
}

export async function getStoredScheduleOverrides() {
  if (!isScheduleOverrideStoreConfigured()) {
    return [] as ScheduleDayOverride[];
  }

  const overrideMap = await getOverrideMap();

  return Object.values(overrideMap).sort((a, b) =>
    a.slot_date.localeCompare(b.slot_date)
  );
}

export async function setStoredScheduleOverride(
  value: Omit<ScheduleDayOverride, "updated_at"> & {
    updated_at?: string | null;
  }
) {
  if (!isDateKey(value.slot_date)) {
    throw new Error("La fecha elegida no es valida.");
  }

  const normalized = normalizeOverride(value.slot_date, {
    ...value,
    updated_at: value.updated_at || new Date().toISOString()
  });

  if (!normalized) {
    throw new Error("La configuracion de agenda no es valida.");
  }

  const overrideMap = await getOverrideMap();
  overrideMap[value.slot_date] = normalized;
  await saveOverrideMap(overrideMap);
  return normalized;
}

export async function clearStoredScheduleOverride(slotDate: string) {
  if (!isDateKey(slotDate)) {
    throw new Error("La fecha elegida no es valida.");
  }

  const overrideMap = await getOverrideMap();
  delete overrideMap[slotDate];
  await saveOverrideMap(overrideMap);
  return Object.values(overrideMap).sort((a, b) =>
    a.slot_date.localeCompare(b.slot_date)
  );
}
