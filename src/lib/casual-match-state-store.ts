import "server-only";
import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import { CasualMatchConfirmationState } from "@/types/db";

const CASUAL_MATCH_STATE_KV_KEY = "sr:casual-match:states";

type MatchStateMap = Record<string, CasualMatchConfirmationState>;

function normalizeStateMap(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") {
    return {} as MatchStateMap;
  }

  return Object.entries(raw).reduce<MatchStateMap>((acc, [matchId, value]) => {
    if (!value || typeof value !== "object") {
      return acc;
    }

    const current = value as Partial<CasualMatchConfirmationState>;
    const status = current.status;

    if (
      status !== "pending" &&
      status !== "confirmed" &&
      status !== "revision_requested"
    ) {
      return acc;
    }

    acc[matchId] = {
      status,
      updated_at: current.updated_at || new Date().toISOString(),
      updated_by: current.updated_by || null,
      note: current.note || null
    };

    return acc;
  }, {});
}

async function getStateMap() {
  return normalizeStateMap(
    await getJsonKv<Record<string, unknown>>(CASUAL_MATCH_STATE_KV_KEY)
  );
}

async function saveStateMap(stateMap: MatchStateMap) {
  if (!Object.keys(stateMap).length) {
    await deleteKv(CASUAL_MATCH_STATE_KV_KEY);
    return;
  }

  await setJsonKv(CASUAL_MATCH_STATE_KV_KEY, stateMap);
}

export function isCasualMatchStateStoreConfigured() {
  return isKvConfigured();
}

export async function getCasualMatchConfirmationState(matchId: string) {
  const stateMap = await getStateMap();
  return stateMap[matchId] || null;
}

export async function getCasualMatchConfirmationStates(matchIds: string[]) {
  const stateMap = await getStateMap();
  return matchIds.reduce<Record<string, CasualMatchConfirmationState | null>>(
    (acc, matchId) => {
      acc[matchId] = stateMap[matchId] || null;
      return acc;
    },
    {}
  );
}

export async function setCasualMatchConfirmationState(
  matchId: string,
  nextState: CasualMatchConfirmationState
) {
  const stateMap = await getStateMap();
  stateMap[matchId] = nextState;
  await saveStateMap(stateMap);
  return nextState;
}

export async function initializeCasualMatchConfirmationState(
  matchId: string,
  createdBy: string
) {
  return setCasualMatchConfirmationState(matchId, {
    status: "pending",
    updated_at: new Date().toISOString(),
    updated_by: createdBy,
    note: null
  });
}

export async function clearCasualMatchConfirmationState(matchId: string) {
  const stateMap = await getStateMap();
  delete stateMap[matchId];
  await saveStateMap(stateMap);
}
