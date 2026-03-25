import { describe, expect, it } from "vitest";
import {
  attachLiveScoreboardAvatars,
  normalizeSquoreScoreboard
} from "@/lib/live-score";

describe("live-score helpers", () => {
  it("normalizes a Squore payload into the live scoreboard shape", () => {
    const score = normalizeSquoreScoreboard({
      eventname: "Circuito Patagónico",
      eventround: "Semi",
      location: "Puerto Madryn",
      player1: "Alan Freire",
      player2: "Nicolas Asmus",
      result: "3-1",
      gamescores: "11-6,9-11,11-8,11-7",
      winner: "Alan Freire",
      winner12: "1",
      duration: "42",
      totalpointsplayer1: "42",
      totalpointsplayer2: "32",
      whendate: "2026-03-23",
      whentime: "21:00-03:00"
    });

    expect(score).not.toBeNull();
    expect(score?.player_one_name).toBe("Alan Freire");
    expect(score?.player_two_name).toBe("Nicolas Asmus");
    expect(score?.winner_side).toBe(1);
    expect(score?.result).toBe("3-1");
  });

  it("prioritizes manual Squore mappings for avatar and display name", () => {
    const score = normalizeSquoreScoreboard({
      player1: "A. Rivero",
      player2: "Nico Asmus"
    });

    expect(score).not.toBeNull();

    const enriched = attachLiveScoreboardAvatars(
      score!,
      [],
      [
        {
          id: "mapping-1",
          squore_name: "A. Rivero",
          profile_id: "profile-1",
          profile_name: "Agustin Rivero",
          avatar_url: "https://example.com/agustin.jpg",
          updated_at: new Date().toISOString()
        }
      ]
    );

    expect(enriched.player_one_name).toBe("Agustin Rivero");
    expect(enriched.player_one_avatar_url).toBe("https://example.com/agustin.jpg");
    expect(enriched.player_two_name).toBe("Nico Asmus");
  });
});
