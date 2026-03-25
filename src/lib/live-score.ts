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

function tokenizeName(value: string | null | undefined) {
  return normalizeNameForLookup(value)
    .split(" ")
    .filter(Boolean);
}

function isMeaningfulPrefixMatch(left: string, right: string) {
  const minLength = Math.min(left.length, right.length);

  if (minLength < 3) {
    return false;
  }

  return left.startsWith(right) || right.startsWith(left);
}

function scoreAutomaticProfileMatch(
  squoreName: string,
  profile: LiveAvatarProfile
) {
  const squoreTokens = tokenizeName(squoreName);
  const profileTokens = tokenizeName(profile.full_name);

  if (!squoreTokens.length || !profileTokens.length) {
    return null;
  }

  const squoreNormalized = squoreTokens.join(" ");
  const profileNormalized = profileTokens.join(" ");

  if (squoreNormalized === profileNormalized) {
    return 100;
  }

  if (
    squoreTokens.length === profileTokens.length &&
    squoreTokens.every((token) => profileTokens.includes(token))
  ) {
    return 90;
  }

  const squoreFirst = squoreTokens[0];
  const squoreLast = squoreTokens[squoreTokens.length - 1];
  const profileFirst = profileTokens[0];
  const profileLast = profileTokens[profileTokens.length - 1];

  if (squoreLast === profileLast) {
    if (
      squoreFirst[0] === profileFirst[0] &&
      (squoreFirst.length === 1 ||
        profileFirst.length === 1 ||
        isMeaningfulPrefixMatch(squoreFirst, profileFirst))
    ) {
      return 80;
    }

    if (isMeaningfulPrefixMatch(squoreFirst, profileFirst)) {
      return 75;
    }
  }

  return null;
}

function resolveAutomaticProfileMatch(
  squoreName: string,
  profiles: LiveAvatarProfile[]
) {
  let bestMatch: LiveAvatarProfile | null = null;
  let bestScore = -1;
  let duplicateBestScore = false;

  for (const profile of profiles) {
    const score = scoreAutomaticProfileMatch(squoreName, profile);

    if (score === null) {
      continue;
    }

    if (score > bestScore) {
      bestMatch = profile;
      bestScore = score;
      duplicateBestScore = false;
      continue;
    }

    if (score === bestScore) {
      duplicateBestScore = true;
    }
  }

  if (duplicateBestScore || !bestMatch) {
    return null;
  }

  return bestMatch;
}

export function attachLiveScoreboardAvatars(
  scoreboard: LiveScoreboard,
  profiles: LiveAvatarProfile[],
  mappings: LivePlayerMapping[] = []
) {
  const profilesByName = new Map<
    string,
    { profile_name: string | null; avatar_url: string | null }
  >();
  const mappedProfilesByName = new Map<
    string,
    { avatar_url: string | null; profile_name: string | null }
  >();

  for (const profile of profiles) {
    const normalizedName = normalizeNameForLookup(profile.full_name);

    if (!normalizedName || profilesByName.has(normalizedName)) {
      continue;
    }

    profilesByName.set(normalizedName, {
      profile_name: profile.full_name || null,
      avatar_url: profile.avatar_url || null
    });
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
  const playerOneAutomaticProfile = resolveAutomaticProfileMatch(
    scoreboard.player_one_name,
    profiles
  );
  const playerTwoAutomaticProfile = resolveAutomaticProfileMatch(
    scoreboard.player_two_name,
    profiles
  );
  const playerOneExactProfile = profilesByName.get(
    normalizeNameForLookup(scoreboard.player_one_name)
  );
  const playerTwoExactProfile = profilesByName.get(
    normalizeNameForLookup(scoreboard.player_two_name)
  );

  const playerOneAvatar =
    playerOneMapping?.avatar_url ||
    playerOneExactProfile?.avatar_url ||
    playerOneAutomaticProfile?.avatar_url ||
    null;
  const playerTwoAvatar =
    playerTwoMapping?.avatar_url ||
    playerTwoExactProfile?.avatar_url ||
    playerTwoAutomaticProfile?.avatar_url ||
    null;

  return {
    ...scoreboard,
    player_one_name:
      playerOneMapping?.profile_name ||
      playerOneExactProfile?.profile_name ||
      playerOneAutomaticProfile?.full_name ||
      scoreboard.player_one_name,
    player_one_avatar_url: playerOneAvatar,
    player_two_name:
      playerTwoMapping?.profile_name ||
      playerTwoExactProfile?.profile_name ||
      playerTwoAutomaticProfile?.full_name ||
      scoreboard.player_two_name,
    player_two_avatar_url: playerTwoAvatar
  } satisfies LiveScoreboard;
}
