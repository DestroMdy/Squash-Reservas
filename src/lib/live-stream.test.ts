import { describe, expect, it } from "vitest";
import {
  buildYouTubeEmbedUrl,
  extractYouTubeVideoId,
  getPrimaryLiveCourt,
  normalizeAdminLiveStreamConfig,
  normalizeLiveStreamConfig
} from "@/lib/live-stream";

describe("live-stream helpers", () => {
  it("extracts the video id from a YouTube watch URL", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts the video id from a short URL", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("normalizes the config, keeps the banner URL and builds the embed", () => {
    const config = normalizeLiveStreamConfig({
      title: "Fecha 3",
      banner_url: "https://example.com/banner.jpg",
      youtube_url: "https://www.youtube.com/live/dQw4w9WgXcQ",
      is_live: true
    });

    expect(config).not.toBeNull();
    expect(config?.banner_url).toBe("https://example.com/banner.jpg");
    expect(config?.youtube_video_id).toBe("dQw4w9WgXcQ");
    expect(config?.embed_url).toBe(buildYouTubeEmbedUrl("dQw4w9WgXcQ"));
    expect(config?.squore_device_id).toBeNull();
    expect(config?.is_live).toBe(true);
  });

  it("keeps the optional Tournament Software URL and Squore device id on admin config", () => {
    const config = normalizeAdminLiveStreamConfig({
      title: "Cancha 1",
      youtube_url: "https://www.youtube.com/live/dQw4w9WgXcQ",
      tournament_software_post_url: "https://example.com/post-result",
      squore_device_id: "XFQE3A"
    });

    expect(config?.tournament_software_post_url).toBe(
      "https://example.com/post-result"
    );
    expect(config?.squore_device_id).toBe("XFQE3A");
  });

  it("prefers the first active live court over scheduled courts", () => {
    const primaryCourt = getPrimaryLiveCourt([
      {
        id: "court-1",
        label: "Cancha 1",
        stream: {
          title: "Cancha 1",
          description: null,
          banner_url: null,
          youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          youtube_video_id: "dQw4w9WgXcQ",
          embed_url: buildYouTubeEmbedUrl("dQw4w9WgXcQ"),
          squore_device_id: null,
          scoreboard_delay_seconds: 5,
          is_live: false,
          starts_at: null,
          updated_at: new Date().toISOString(),
          updated_by: null
        },
        scoreboard: null
      },
      {
        id: "court-2",
        label: "Cancha 2",
        stream: {
          title: "Cancha 2",
          description: null,
          banner_url: null,
          youtube_url: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
          youtube_video_id: "3JZ_D3ELwOQ",
          embed_url: buildYouTubeEmbedUrl("3JZ_D3ELwOQ"),
          squore_device_id: null,
          scoreboard_delay_seconds: 5,
          is_live: true,
          starts_at: null,
          updated_at: new Date().toISOString(),
          updated_by: null
        },
        scoreboard: null
      }
    ]);

    expect(primaryCourt?.id).toBe("court-2");
  });
});
