import { describe, expect, it } from "vitest";
import {
  attachLiveScoreboardAvatars,
  normalizeSquoreMqttMatch,
  normalizeSquoreRecentMatch,
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
    expect(score?.current_game_points_player_one).toBe(11);
    expect(score?.current_game_points_player_two).toBe(7);
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

  it("automatically matches abbreviated first names and surnames against profiles", () => {
    const score = normalizeSquoreScoreboard({
      player1: "A. Rivero",
      player2: "Nico Asmus"
    });

    const enriched = attachLiveScoreboardAvatars(score!, [
      {
        id: "profile-1",
        full_name: "Agustin Rivero",
        avatar_url: "https://example.com/agustin.jpg"
      },
      {
        id: "profile-2",
        full_name: "Nicolas Asmus",
        avatar_url: "https://example.com/nicolas.jpg"
      }
    ]);

    expect(enriched.player_one_name).toBe("Agustin Rivero");
    expect(enriched.player_one_avatar_url).toBe("https://example.com/agustin.jpg");
    expect(enriched.player_two_name).toBe("Nicolas Asmus");
    expect(enriched.player_two_avatar_url).toBe("https://example.com/nicolas.jpg");
  });

  it("normalizes a recent Squore live-feed match into the live scoreboard shape", () => {
    const score = normalizeSquoreRecentMatch({
      event: "Circuito Patagonico",
      division: "Primera",
      round: "Final",
      court: "Cancha 1",
      A: "Agustin Rivero",
      B: "Nicolas Asmus",
      result: "3-1",
      gamescores: "11-4,9-11,11-8,11-7",
      isVictoryFor: "A",
      duration: "1800",
      date: "2026-04-01",
      time: "19:45:00",
      avtA: "/images/a.png"
    });

    expect(score).not.toBeNull();
    expect(score?.player_one_name).toBe("Agustin Rivero");
    expect(score?.winner_side).toBe(1);
    expect(score?.player_one_avatar_url).toBe(
      "https://squore.double-yellow.be/images/a.png"
    );
    expect(score?.current_game_points_player_one).toBe(11);
    expect(score?.current_game_points_player_two).toBe(7);
  });

  it("normalizes a Squore MQTT payload into the live scoreboard shape", () => {
    const score = normalizeSquoreMqttMatch({
      players: {
        A: "Agustin Rivero",
        B: "Federico Vera"
      },
      avatars: {
        A: "/images/agustin.png",
        B: "/images/fede.png"
      },
      event: {
        name: "Circuito Patagonico",
        location: "Cancha 1",
        division: "Primera"
      },
      round: "Final",
      result: "1-1",
      gamescores: "11-8,8-11,4-2",
      when: {
        date: "2026-04-01",
        time: "18:10:00-03:00"
      }
    });

    expect(score).not.toBeNull();
    expect(score?.player_one_name).toBe("Agustin Rivero");
    expect(score?.player_two_name).toBe("Federico Vera");
    expect(score?.current_game_points_player_one).toBe(4);
    expect(score?.current_game_points_player_two).toBe(2);
    expect(score?.player_one_avatar_url).toBe(
      "https://squore.double-yellow.be/images/agustin.png"
    );
  });

  it("matches inverted token order from Squore against the profile name", () => {
    const score = normalizeSquoreScoreboard({
      player1: "Rivero Agustin",
      player2: "Asmus Nicolas"
    });

    const enriched = attachLiveScoreboardAvatars(score!, [
      {
        id: "profile-1",
        full_name: "Agustin Rivero",
        avatar_url: "https://example.com/agustin.jpg"
      },
      {
        id: "profile-2",
        full_name: "Nicolas Asmus",
        avatar_url: "https://example.com/nicolas.jpg"
      }
    ]);

    expect(enriched.player_one_name).toBe("Agustin Rivero");
    expect(enriched.player_two_name).toBe("Nicolas Asmus");
  });
});
