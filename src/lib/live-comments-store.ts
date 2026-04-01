import "server-only";
import { randomUUID } from "crypto";
import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import { LiveComment, LiveCourtId } from "@/types/db";

const LIVE_COMMENTS_KV_KEY = "sr:live-center:comments";
const MAX_COMMENTS_PER_COURT = 150;

type LiveCommentsMap = Record<LiveCourtId, LiveComment[]>;

function createEmptyCommentsMap(): LiveCommentsMap {
  return {
    "court-1": [],
    "court-2": []
  };
}

function normalizeLiveComment(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const current = value as Partial<LiveComment>;

  if (
    typeof current.id !== "string" ||
    typeof current.court_id !== "string" ||
    typeof current.user_id !== "string" ||
    typeof current.full_name !== "string" ||
    typeof current.body !== "string" ||
    typeof current.created_at !== "string"
  ) {
    return null;
  }

  return {
    id: current.id,
    court_id: current.court_id as LiveCourtId,
    user_id: current.user_id,
    full_name: current.full_name,
    avatar_url:
      typeof current.avatar_url === "string" ? current.avatar_url : null,
    body: current.body,
    created_at: current.created_at
  } satisfies LiveComment;
}

function normalizeCommentsMap(raw: Record<string, unknown> | null | undefined) {
  const commentsMap = createEmptyCommentsMap();

  if (!raw || typeof raw !== "object") {
    return commentsMap;
  }

  for (const courtId of ["court-1", "court-2"] as LiveCourtId[]) {
    const value = raw[courtId];

    if (!Array.isArray(value)) {
      continue;
    }

    const normalizedComments = value.reduce<LiveComment[]>((acc, entry) => {
      const normalizedComment = normalizeLiveComment(entry);

      if (normalizedComment) {
        acc.push(normalizedComment);
      }

      return acc;
    }, []);

    commentsMap[courtId] = normalizedComments
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .slice(-MAX_COMMENTS_PER_COURT);
  }

  return commentsMap;
}

async function getCommentsMap() {
  return normalizeCommentsMap(
    await getJsonKv<Record<string, unknown>>(LIVE_COMMENTS_KV_KEY)
  );
}

async function saveCommentsMap(commentsMap: LiveCommentsMap) {
  if (!Object.values(commentsMap).some((entries) => entries.length > 0)) {
    await deleteKv(LIVE_COMMENTS_KV_KEY);
    return;
  }

  await setJsonKv(LIVE_COMMENTS_KV_KEY, commentsMap);
}

export function isLiveCommentsStoreConfigured() {
  return isKvConfigured();
}

export async function getStoredLiveCenterCommentsMap() {
  return getCommentsMap();
}

export async function getStoredLiveCourtComments(courtId: LiveCourtId) {
  const commentsMap = await getCommentsMap();
  return commentsMap[courtId];
}

export async function addStoredLiveCourtComment(
  courtId: LiveCourtId,
  value: Omit<LiveComment, "id" | "created_at" | "court_id"> & {
    id?: string | null;
    created_at?: string | null;
  }
) {
  const commentsMap = await getCommentsMap();

  const comment: LiveComment = {
    id: value.id?.trim() || randomUUID(),
    court_id: courtId,
    user_id: value.user_id,
    full_name: value.full_name.trim(),
    avatar_url: value.avatar_url || null,
    body: value.body.trim(),
    created_at: value.created_at?.trim() || new Date().toISOString()
  };

  commentsMap[courtId] = [...commentsMap[courtId], comment]
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .slice(-MAX_COMMENTS_PER_COURT);

  await saveCommentsMap(commentsMap);
  return comment;
}

export async function clearStoredLiveCourtComments(courtId: LiveCourtId) {
  const commentsMap = await getCommentsMap();
  commentsMap[courtId] = [];
  await saveCommentsMap(commentsMap);
}
