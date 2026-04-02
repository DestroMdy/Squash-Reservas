import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { clearStoredLiveCourtComments } from "@/lib/live-comments-store";
import {
  extractYouTubeVideoId,
  getLiveCourtLabel,
  isLiveCourtId,
  normalizeOptionalHttpUrl
} from "@/lib/live-stream";
import {
  clearLiveIngestStatus,
  getLiveIngestStatuses
} from "@/lib/live-ingest-status-store";
import {
  clearStoredLiveCourtScoreboard,
  getStoredLiveCourtStream,
  clearStoredLiveCourtStream,
  ensureStoredLiveCourtSquoreToken,
  getStoredLiveCenterConfigMap,
  getStoredLiveCenterCourts,
  isLiveStreamStoreConfigured,
  setStoredLiveCourtStream
} from "@/lib/live-stream-store";
import { requireAdminRequest } from "@/lib/server-auth";

type LiveStreamBody = {
  court_id?: string;
  title?: string;
  description?: string | null;
  banner_url?: string | null;
  youtube_url?: string;
  squore_device_id?: string | null;
  squore_mqtt_broker_url?: string | null;
  squore_mqtt_match_topic?: string | null;
  squore_mqtt_change_topic?: string | null;
  starts_at?: string | null;
  scoreboard_delay_seconds?: number | string | null;
  is_live?: boolean;
  tournament_software_post_url?: string | null;
};

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

function buildSquorePostUrl(request: NextRequest, courtId: string, token: string) {
  const origin = new URL(request.url).origin;
  return `${origin}/api/live-stream/squore/${courtId}/${token}`;
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

function getRequestedCourtId(request: NextRequest) {
  const courtId = new URL(request.url).searchParams.get("court_id");

  if (!isLiveCourtId(courtId)) {
    return null;
  }

  return courtId;
}

async function buildAdminCourtsResponse(request: NextRequest) {
  const [courts, configMap, ingestStatuses] = await Promise.all([
    getStoredLiveCenterCourts(),
    getStoredLiveCenterConfigMap(),
    getLiveIngestStatuses()
  ]);
  const origin = new URL(request.url).origin;

  return Promise.all(
    courts.map(async (court) => {
      const token = await ensureStoredLiveCourtSquoreToken(court.id);
      return {
        id: court.id,
        label: court.label,
        stream: configMap[court.id],
        scoreboard: court.scoreboard,
        squore_post_url: buildSquorePostUrl(request, court.id, token),
        overlay_url: `${origin}/live/overlay/${court.id}`,
        ingest_status: ingestStatuses[court.id] || null
      };
    })
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  try {
    const courts = await buildAdminCourtsResponse(request);

    return NextResponse.json(
      { courts },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar la configuracion del centro en vivo." },
      {
        status: 400,
        headers: responseHeaders()
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as LiveStreamBody;

  if (!isLiveCourtId(body.court_id)) {
    return NextResponse.json(
      { error: "La cancha del vivo no es valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  if (!body.title?.trim() || !body.youtube_url?.trim()) {
    return NextResponse.json(
      { error: "Titulo y link de YouTube son obligatorios." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const videoId = extractYouTubeVideoId(body.youtube_url);

  if (!videoId) {
    return NextResponse.json(
      { error: "El link de YouTube no es valido." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const normalizedBannerUrl =
    body.banner_url === undefined
      ? null
      : normalizeOptionalHttpUrl(body.banner_url);

  if (body.banner_url?.trim() && !normalizedBannerUrl) {
    return NextResponse.json(
      { error: "La URL del banner no es valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const normalizedTournamentSoftwareUrl =
    body.tournament_software_post_url === undefined
      ? null
      : normalizeOptionalHttpUrl(body.tournament_software_post_url);
  const normalizedScoreboardDelaySeconds = normalizeScoreboardDelaySeconds(
    body.scoreboard_delay_seconds
  );

  if (
    body.tournament_software_post_url?.trim() &&
    !normalizedTournamentSoftwareUrl
  ) {
    return NextResponse.json(
      { error: "La URL de Tournament Software no es valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const previousStream = await getStoredLiveCourtStream(body.court_id);

    if (
      previousStream?.youtube_video_id &&
      previousStream.youtube_video_id !== videoId
    ) {
      await clearStoredLiveCourtComments(body.court_id);
    }

    const stream = await setStoredLiveCourtStream(body.court_id, {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      banner_url: normalizedBannerUrl,
      youtube_url: body.youtube_url.trim(),
      youtube_video_id: videoId,
      squore_device_id: body.squore_device_id?.trim() || null,
      squore_mqtt_broker_url: body.squore_mqtt_broker_url?.trim() || null,
      squore_mqtt_match_topic: body.squore_mqtt_match_topic?.trim() || null,
      squore_mqtt_change_topic: body.squore_mqtt_change_topic?.trim() || null,
      scoreboard_delay_seconds: normalizedScoreboardDelaySeconds,
      is_live: Boolean(body.is_live),
      starts_at: body.starts_at?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
      tournament_software_post_url: normalizedTournamentSoftwareUrl
    });

    const courts = await buildAdminCourtsResponse(request);

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "live_stream.updated",
      targetType: "live_stream",
      targetId: body.court_id,
      details: {
        court_label: getLiveCourtLabel(body.court_id),
        title: stream.title,
        banner_url: stream.banner_url,
        youtube_url: stream.youtube_url,
        squore_device_id: stream.squore_device_id,
        squore_mqtt_broker_url: stream.squore_mqtt_broker_url,
        squore_mqtt_match_topic: stream.squore_mqtt_match_topic,
        squore_mqtt_change_topic: stream.squore_mqtt_change_topic,
        scoreboard_delay_seconds: stream.scoreboard_delay_seconds,
        tournament_software_post_url: stream.tournament_software_post_url,
        is_live: stream.is_live,
        starts_at: stream.starts_at
      }
    }).catch(() => null);

    return NextResponse.json(
      {
        ok: true,
        court: courts.find((court) => court.id === body.court_id) || null,
        courts
      },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar la configuracion de la cancha." },
      {
        status: 400,
        headers: responseHeaders()
      }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const courtId = getRequestedCourtId(request);

  if (!courtId) {
    return NextResponse.json(
      { error: "Debes indicar la cancha a limpiar." },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    await Promise.all([
      clearStoredLiveCourtStream(courtId),
      clearStoredLiveCourtScoreboard(courtId),
      clearLiveIngestStatus(courtId),
      clearStoredLiveCourtComments(courtId)
    ]);

    const courts = await buildAdminCourtsResponse(request);

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "live_stream.deleted",
      targetType: "live_stream",
      targetId: courtId,
      details: {
        court_label: getLiveCourtLabel(courtId)
      }
    }).catch(() => null);

    return NextResponse.json(
      { ok: true, courts },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo limpiar la cancha del centro en vivo." },
      {
        status: 400,
        headers: responseHeaders()
      }
    );
  }
}
