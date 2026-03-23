import "server-only";
import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import { LiveCourtId, LiveIngestStatus } from "@/types/db";

const LIVE_INGEST_STATUS_KV_KEY = "sr:live-center:ingest-status";

type LiveIngestStatusMap = Record<LiveCourtId, LiveIngestStatus | null>;

function createEmptyStatusMap(): LiveIngestStatusMap {
  return {
    "court-1": null,
    "court-2": null
  };
}

function normalizeStatusMap(raw: Record<string, unknown> | null | undefined) {
  const statusMap = createEmptyStatusMap();

  if (!raw || typeof raw !== "object") {
    return statusMap;
  }

  for (const courtId of ["court-1", "court-2"] as LiveCourtId[]) {
    const value = raw[courtId];
    if (!value || typeof value !== "object") {
      continue;
    }

    const current = value as Partial<LiveIngestStatus>;
    statusMap[courtId] = {
      last_score_received_at: current.last_score_received_at || null,
      last_forwarded_at: current.last_forwarded_at || null,
      last_forward_error: current.last_forward_error || null,
      latest_payload_summary: current.latest_payload_summary || null
    };
  }

  return statusMap;
}

async function getStatusMap() {
  return normalizeStatusMap(
    await getJsonKv<Record<string, unknown>>(LIVE_INGEST_STATUS_KV_KEY)
  );
}

async function saveStatusMap(statusMap: LiveIngestStatusMap) {
  if (!Object.values(statusMap).some(Boolean)) {
    await deleteKv(LIVE_INGEST_STATUS_KV_KEY);
    return;
  }

  await setJsonKv(LIVE_INGEST_STATUS_KV_KEY, statusMap);
}

export function isLiveIngestStatusStoreConfigured() {
  return isKvConfigured();
}

export async function getLiveIngestStatuses() {
  return getStatusMap();
}

export async function updateLiveIngestStatus(
  courtId: LiveCourtId,
  partial: Partial<LiveIngestStatus>
) {
  const statusMap = await getStatusMap();
  statusMap[courtId] = {
    last_score_received_at: statusMap[courtId]?.last_score_received_at || null,
    last_forwarded_at: statusMap[courtId]?.last_forwarded_at || null,
    last_forward_error: statusMap[courtId]?.last_forward_error || null,
    latest_payload_summary: statusMap[courtId]?.latest_payload_summary || null,
    ...partial
  };

  await saveStatusMap(statusMap);
  return statusMap[courtId];
}

export async function clearLiveIngestStatus(courtId: LiveCourtId) {
  const statusMap = await getStatusMap();
  statusMap[courtId] = null;
  await saveStatusMap(statusMap);
  return null;
}
