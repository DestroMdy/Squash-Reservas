import { LiveScoreboard } from "@/types/db";

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
    player_two_name: playerTwoName,
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
