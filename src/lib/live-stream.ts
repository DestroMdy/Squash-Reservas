import { LiveStreamConfig } from "@/types/db";

type RawLiveStreamConfig = Partial<LiveStreamConfig> & {
  title?: string | null;
  description?: string | null;
  youtube_url?: string | null;
  youtube_video_id?: string | null;
  is_live?: boolean | null;
  starts_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export function extractYouTubeVideoId(url: string) {
  const value = url.trim();

  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    const host = parsedUrl.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const candidate = parsedUrl.pathname.replaceAll("/", "");
      return /^[\w-]{11}$/.test(candidate) ? candidate : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsedUrl.pathname === "/watch") {
        const candidate = parsedUrl.searchParams.get("v") || "";
        return /^[\w-]{11}$/.test(candidate) ? candidate : null;
      }

      const match = parsedUrl.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{11})/);
      return match?.[1] || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function normalizeLiveStreamConfig(
  raw: RawLiveStreamConfig | null | undefined
) {
  if (!raw?.title?.trim() || !raw.youtube_url?.trim()) {
    return null;
  }

  const videoId =
    raw.youtube_video_id?.trim() || extractYouTubeVideoId(raw.youtube_url);

  if (!videoId) {
    return null;
  }

  const updatedAt = raw.updated_at?.trim() || new Date().toISOString();

  return {
    title: raw.title.trim(),
    description: raw.description?.trim() || null,
    youtube_url: raw.youtube_url.trim(),
    youtube_video_id: videoId,
    embed_url: buildYouTubeEmbedUrl(videoId),
    is_live: Boolean(raw.is_live),
    starts_at: raw.starts_at?.trim() || null,
    updated_at: updatedAt,
    updated_by: raw.updated_by?.trim() || null
  } as LiveStreamConfig;
}
