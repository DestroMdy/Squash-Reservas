import "server-only";

import { deleteKv, getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";

const EXTERNAL_TOURNAMENT_FLYERS_KV_KEY = "sr:external-tournament:flyers";

type TournamentFlyerMap = Record<string, string>;

function normalizeFlyerMap(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") {
    return {} as TournamentFlyerMap;
  }

  return Object.entries(raw).reduce<TournamentFlyerMap>((acc, [key, value]) => {
    if (typeof value === "string" && value.trim()) {
      acc[key] = value.trim();
    }
    return acc;
  }, {});
}

export function isExternalTournamentFlyerStoreConfigured() {
  return isKvConfigured();
}

export async function getStoredExternalTournamentFlyerMap() {
  return normalizeFlyerMap(
    await getJsonKv<Record<string, unknown>>(EXTERNAL_TOURNAMENT_FLYERS_KV_KEY)
  );
}

export async function getStoredExternalTournamentFlyer(
  tournamentId: string
) {
  const flyerMap = await getStoredExternalTournamentFlyerMap();
  return flyerMap[tournamentId] || null;
}

export async function setStoredExternalTournamentFlyer(
  tournamentId: string,
  flyerUrl: string
) {
  const flyerMap = await getStoredExternalTournamentFlyerMap();
  flyerMap[tournamentId] = flyerUrl.trim();
  await setJsonKv(EXTERNAL_TOURNAMENT_FLYERS_KV_KEY, flyerMap);
  return flyerMap;
}

export async function deleteStoredExternalTournamentFlyer(
  tournamentId: string
) {
  const flyerMap = await getStoredExternalTournamentFlyerMap();

  if (!(tournamentId in flyerMap)) {
    return flyerMap;
  }

  delete flyerMap[tournamentId];

  if (!Object.keys(flyerMap).length) {
    await deleteKv(EXTERNAL_TOURNAMENT_FLYERS_KV_KEY);
    return {};
  }

  await setJsonKv(EXTERNAL_TOURNAMENT_FLYERS_KV_KEY, flyerMap);
  return flyerMap;
}

export async function attachExternalTournamentFlyers<
  T extends {
    id: string;
    flyer_url?: string | null;
  }
>(tournaments: T[]) {
  if (!tournaments.length || !isExternalTournamentFlyerStoreConfigured()) {
    return tournaments.map((tournament) => ({
      ...tournament,
      flyer_url: tournament.flyer_url || null
    }));
  }

  const flyerMap = await getStoredExternalTournamentFlyerMap();

  return tournaments.map((tournament) => ({
    ...tournament,
    flyer_url: flyerMap[tournament.id] || tournament.flyer_url || null
  }));
}
