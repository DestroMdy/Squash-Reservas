import { describe, expect, it } from "vitest";
import {
  buildYouTubeEmbedUrl,
  extractYouTubeVideoId,
  normalizeLiveStreamConfig
} from "@/lib/live-stream";

describe("live-stream helpers", () => {
  it("extrae el video id desde una URL watch de YouTube", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("extrae el video id desde una URL corta", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("normaliza la configuración y arma el embed", () => {
    const config = normalizeLiveStreamConfig({
      title: "Fecha 3",
      youtube_url: "https://www.youtube.com/live/dQw4w9WgXcQ",
      is_live: true
    });

    expect(config).not.toBeNull();
    expect(config?.youtube_video_id).toBe("dQw4w9WgXcQ");
    expect(config?.embed_url).toBe(buildYouTubeEmbedUrl("dQw4w9WgXcQ"));
    expect(config?.is_live).toBe(true);
  });
});
