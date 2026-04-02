import {
  AdminLiveStreamConfig,
  LiveCourtId,
  LiveCourtState,
  LiveStreamConfig
} from "@/types/db";

export const LIVE_COURTS = [
  { id: "court-1", label: "Cancha 1" },
  { id: "court-2", label: "Cancha 2" }
] as const satisfies ReadonlyArray<{ id: LiveCourtId; label: string }>;

type RawLiveStreamConfig = Partial<LiveStreamConfig> & {
  title?: string | null;
  description?: string | null;
  banner_url?: string | null;
  youtube_url?: string | null;
  youtube_video_id?: string | null;
  squore_device_id?: string | null;
  squore_mqtt_broker_url?: string | null;
  squore_mqtt_match_topic?: string | null;
  squore_mqtt_change_topic?: string | null;
  scoreboard_delay_seconds?: number | string | null;
  is_enabled?: boolean | null;
  is_live?: boolean | null;
  starts_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

type RawAdminLiveStreamConfig = RawLiveStreamConfig & {
  tournament_software_post_url?: string | null;
};

export function isLiveCourtId(value: string | null | undefined): value is LiveCourtId {
  return LIVE_COURTS.some((court) => court.id === value);
}

export function getLiveCourtLabel(courtId: LiveCourtId) {
  return LIVE_COURTS.find((court) => court.id === courtId)?.label || "Cancha";
}

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

export function normalizeOptionalHttpUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmed);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function normalizeScoreboardDelaySeconds(value: number | string | null | undefined) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return 5;
  }

  return Math.min(30, Math.max(0, Math.round(numericValue)));
}

function normalizeSquoreDeviceId(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\s+/g, "");
  return /^[A-Za-z0-9_-]{3,40}$/.test(normalized) ? normalized : null;
}

function normalizeMqttBrokerUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmed);

    if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function normalizeMqttTopic(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
    banner_url: normalizeOptionalHttpUrl(raw.banner_url),
    youtube_url: raw.youtube_url.trim(),
    youtube_video_id: videoId,
    embed_url: buildYouTubeEmbedUrl(videoId),
    squore_device_id: normalizeSquoreDeviceId(raw.squore_device_id),
    squore_mqtt_broker_url: normalizeMqttBrokerUrl(raw.squore_mqtt_broker_url),
    squore_mqtt_match_topic: normalizeMqttTopic(raw.squore_mqtt_match_topic),
    squore_mqtt_change_topic: normalizeMqttTopic(raw.squore_mqtt_change_topic),
    scoreboard_delay_seconds: normalizeScoreboardDelaySeconds(
      raw.scoreboard_delay_seconds
    ),
    is_enabled: raw.is_enabled !== false,
    is_live: raw.is_enabled === false ? false : Boolean(raw.is_live),
    starts_at: raw.starts_at?.trim() || null,
    updated_at: updatedAt,
    updated_by: raw.updated_by?.trim() || null
  } as LiveStreamConfig;
}

export function normalizeAdminLiveStreamConfig(
  raw: RawAdminLiveStreamConfig | null | undefined
) {
  const normalized = normalizeLiveStreamConfig(raw);

  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    tournament_software_post_url: normalizeOptionalHttpUrl(
      raw?.tournament_software_post_url
    )
  } as AdminLiveStreamConfig;
}

export function toPublicLiveStreamConfig(
  stream: AdminLiveStreamConfig | LiveStreamConfig | null | undefined
) {
  if (!stream) {
    return null;
  }

  const { tournament_software_post_url: _ignored, ...publicStream } =
    stream as AdminLiveStreamConfig;

  return publicStream as LiveStreamConfig;
}

export function isLiveStreamEnabled(
  stream: Pick<LiveStreamConfig, "is_enabled"> | null | undefined
) {
  return Boolean(stream && stream.is_enabled !== false);
}

export function getPrimaryLiveCourt<T extends Pick<LiveCourtState, "stream">>(
  courts: T[]
) {
  return (
    courts.find((court) => isLiveStreamEnabled(court.stream) && court.stream?.is_live) ||
    courts.find((court) => isLiveStreamEnabled(court.stream)) ||
    null
  );
}
