import { LivePlayerMapping, LiveScoreboard } from "@/types/db";
import { LiveAvatarProfile } from "@/lib/live-avatar-profiles";

type RawScorePayload = Record<string, unknown>;

function getStringValue(payload: RawScorePayload, key: string) {
  const value = payload[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getNumberValue(payload: RawScorePayload, key: string) {
  const value = getStringValue(payload, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getWinnerSide(payload: RawScorePayload) {
  const winner = getStringValue(payload, "winner12");

  if (winner === "1") {
    return 1;
  }

  if (winner === "2") {
    return 2;
  }

  return null;
}

export function normalizeSquoreScoreboard(payload: RawScorePayload) {
  const playerOneName = getStringValue(payload, "player1");
  const playerTwoName = getStringValue(payload, "player2");

  if (!playerOneName || !playerTwoName) {
    return null;
  }

  return {
    source: "squore",
    event_name: getStringValue(payload, "eventname"),
    division_name: getStringValue(payload, "eventdivision"),
    round_name: getStringValue(payload, "eventround"),
    location: getStringValue(payload, "location"),
    player_one_name: playerOneName,
    player_one_avatar_url: null,
    player_two_name: playerTwoName,
    player_two_avatar_url: null,
    result: getStringValue(payload, "result"),
    game_scores: getStringValue(payload, "gamescores"),
    winner_name: getStringValue(payload, "winner"),
    winner_side: getWinnerSide(payload),
    duration_minutes: getNumberValue(payload, "duration"),
    total_points_player_one: getNumberValue(payload, "totalpointsplayer1"),
    total_points_player_two: getNumberValue(payload, "totalpointsplayer2"),
    played_on: getStringValue(payload, "whendate"),
    played_time: getStringValue(payload, "whentime"),
    updated_at: new Date().toISOString()
  } as LiveScoreboard;
}

function normalizeNameForLookup(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function attachLiveScoreboardAvatars(
  scoreboard: LiveScoreboard,
  profiles: LiveAvatarProfile[],
  mappings: LivePlayerMapping[] = []
) {
  const profilesByName = new Map<string, string>();
  const mappedProfilesByName = new Map<
    string,
    { avatar_url: string | null; profile_name: string | null }
  >();

  for (const profile of profiles) {
    const normalizedName = normalizeNameForLookup(profile.full_name);

    if (!normalizedName || !profile.avatar_url || profilesByName.has(normalizedName)) {
      continue;
    }

    profilesByName.set(normalizedName, profile.avatar_url);
  }

  for (const mapping of mappings) {
    const normalizedName = normalizeNameForLookup(mapping.squore_name);

    if (!normalizedName || mappedProfilesByName.has(normalizedName)) {
      continue;
    }

    mappedProfilesByName.set(normalizedName, {
      avatar_url: mapping.avatar_url || null,
      profile_name: mapping.profile_name || null
    });
  }

  const playerOneMapping = mappedProfilesByName.get(
    normalizeNameForLookup(scoreboard.player_one_name)
  );
  const playerTwoMapping = mappedProfilesByName.get(
    normalizeNameForLookup(scoreboard.player_two_name)
  );

  const playerOneAvatar =
    playerOneMapping?.avatar_url ||
    profilesByName.get(normalizeNameForLookup(scoreboard.player_one_name)) ||
    null;
  const playerTwoAvatar =
    playerTwoMapping?.avatar_url ||
    profilesByName.get(normalizeNameForLookup(scoreboard.player_two_name)) ||
    null;

  return {
    ...scoreboard,
    player_one_name: playerOneMapping?.profile_name || scoreboard.player_one_name,
    player_one_avatar_url: playerOneAvatar,
    player_two_name: playerTwoMapping?.profile_name || scoreboard.player_two_name,
    player_two_avatar_url: playerTwoAvatar
  } satisfies LiveScoreboard;
}
