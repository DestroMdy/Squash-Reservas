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

function normalizeSquoreAssetUrl(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return `https://squore.double-yellow.be${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getNestedStringValue(
  payload: RawScorePayload,
  parentKey: string,
  childKey: string
) {
  const parent = payload[parentKey];

  if (!parent || typeof parent !== "object") {
    return null;
  }

  const value = (parent as Record<string, unknown>)[childKey];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getCurrentGamePoints(gameScores: string | null) {
  if (!gameScores) {
    return {
      playerOne: null,
      playerTwo: null
    };
  }

  const segments = gameScores
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  if (!lastSegment) {
    return {
      playerOne: null,
      playerTwo: null
    };
  }

  const match = lastSegment.match(/(-?\d+)\s*-\s*(-?\d+)/);
  if (!match) {
    return {
      playerOne: null,
      playerTwo: null
    };
  }

  return {
    playerOne: Number(match[1]),
    playerTwo: Number(match[2])
  };
}

export function normalizeSquoreScoreboard(payload: RawScorePayload) {
  const playerOneName = getStringValue(payload, "player1");
  const playerTwoName = getStringValue(payload, "player2");

  if (!playerOneName || !playerTwoName) {
    return null;
  }

  const currentGamePoints = getCurrentGamePoints(getStringValue(payload, "gamescores"));

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
    current_game_points_player_one: currentGamePoints.playerOne,
    current_game_points_player_two: currentGamePoints.playerTwo,
    played_on: getStringValue(payload, "whendate"),
    played_time: getStringValue(payload, "whentime"),
    updated_at: new Date().toISOString()
  } as LiveScoreboard;
}

export function normalizeSquoreRecentMatch(payload: RawScorePayload) {
  const playerOneName = getStringValue(payload, "A");
  const playerTwoName = getStringValue(payload, "B");

  if (!playerOneName || !playerTwoName) {
    return null;
  }

  const winner = getStringValue(payload, "isVictoryFor");
  const winnerSide = winner === "A" ? 1 : winner === "B" ? 2 : null;
  const durationSeconds = getNumberValue(payload, "duration");

  const gameScores = getStringValue(payload, "gamescores");
  const currentGamePoints = getCurrentGamePoints(gameScores);

  return {
    source: "squore",
    event_name: getStringValue(payload, "event"),
    division_name: getStringValue(payload, "division"),
    round_name: getStringValue(payload, "round"),
    location: getStringValue(payload, "court"),
    player_one_name: playerOneName,
    player_one_avatar_url: normalizeSquoreAssetUrl(getStringValue(payload, "avtA")),
    player_two_name: playerTwoName,
    player_two_avatar_url: normalizeSquoreAssetUrl(getStringValue(payload, "avtB")),
    result: getStringValue(payload, "result"),
    game_scores: gameScores,
    winner_name:
      winnerSide === 1
        ? playerOneName
        : winnerSide === 2
          ? playerTwoName
          : null,
    winner_side: winnerSide,
    duration_minutes:
      durationSeconds !== null ? Math.max(0, Math.round(durationSeconds / 60)) : null,
    total_points_player_one: null,
    total_points_player_two: null,
    current_game_points_player_one: currentGamePoints.playerOne,
    current_game_points_player_two: currentGamePoints.playerTwo,
    played_on: getStringValue(payload, "date"),
    played_time: getStringValue(payload, "time"),
    updated_at: new Date().toISOString()
  } satisfies LiveScoreboard;
}

export function normalizeSquoreMqttMatch(payload: RawScorePayload) {
  const playerOneName =
    getNestedStringValue(payload, "players", "A") || getStringValue(payload, "A");
  const playerTwoName =
    getNestedStringValue(payload, "players", "B") || getStringValue(payload, "B");

  if (!playerOneName || !playerTwoName) {
    return null;
  }

  const gameScores = getStringValue(payload, "gamescores");
  const currentGamePoints = getCurrentGamePoints(gameScores);
  const winner = getStringValue(payload, "isVictoryFor");
  const winnerSide = winner === "A" ? 1 : winner === "B" ? 2 : null;

  return {
    source: "squore",
    event_name:
      getNestedStringValue(payload, "event", "name") ||
      getStringValue(payload, "eventname") ||
      getStringValue(payload, "event"),
    division_name:
      getNestedStringValue(payload, "event", "division") ||
      getStringValue(payload, "eventdivision") ||
      getStringValue(payload, "division"),
    round_name: getStringValue(payload, "round") || getStringValue(payload, "eventround"),
    location:
      getNestedStringValue(payload, "event", "location") ||
      getStringValue(payload, "location") ||
      getStringValue(payload, "court"),
    player_one_name: playerOneName,
    player_one_avatar_url: normalizeSquoreAssetUrl(
      getNestedStringValue(payload, "avatars", "A") ||
        getStringValue(payload, "avtA")
    ),
    player_two_name: playerTwoName,
    player_two_avatar_url: normalizeSquoreAssetUrl(
      getNestedStringValue(payload, "avatars", "B") ||
        getStringValue(payload, "avtB")
    ),
    result: getStringValue(payload, "result"),
    game_scores: gameScores,
    winner_name:
      winnerSide === 1
        ? playerOneName
        : winnerSide === 2
          ? playerTwoName
          : null,
    winner_side: winnerSide,
    duration_minutes: getNumberValue(payload, "duration"),
    total_points_player_one: null,
    total_points_player_two: null,
    current_game_points_player_one: currentGamePoints.playerOne,
    current_game_points_player_two: currentGamePoints.playerTwo,
    played_on:
      getNestedStringValue(payload, "when", "date") ||
      getStringValue(payload, "whendate") ||
      getStringValue(payload, "date"),
    played_time:
      getNestedStringValue(payload, "when", "time") ||
      getStringValue(payload, "whentime") ||
      getStringValue(payload, "time"),
    updated_at: new Date().toISOString()
  } satisfies LiveScoreboard;
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
