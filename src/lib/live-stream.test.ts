import { describe, expect, it } from "vitest";
import {
  buildYouTubeEmbedUrl,
  extractYouTubeVideoId,
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
    expect(config?.is_live).toBe(true);
  });
});
