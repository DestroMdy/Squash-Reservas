import { NextRequest, NextResponse } from "next/server";
import { getLiveCourtLabel, isLiveCourtId } from "@/lib/live-stream";
import {
  attachLiveScoreboardAvatars,
  normalizeSquoreScoreboard
} from "@/lib/live-score";
import { fetchProfilesForLiveAvatars } from "@/lib/live-avatar-profiles";
import { updateLiveIngestStatus } from "@/lib/live-ingest-status-store";
import {
  getStoredLiveCourtSquoreToken,
  getStoredLiveCourtStream,
  getStoredLivePlayerMappings,
  isLiveStreamStoreConfigured,
  setStoredLiveCourtScoreboard
} from "@/lib/live-stream-store";

type SquoreRequestParams = {
  courtId?: string | null;
  token?: string | null;
};

export function getLiveSquoreResponseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache"
  };
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [
        key,
        typeof value === "string" ? value : value.name
      ])
    );
  }

  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

async function forwardToTournamentSoftware(
  destinationUrl: string,
  request: NextRequest,
  rawBody: ArrayBuffer
) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const response = await fetch(destinationUrl, {
    method: "POST",
    headers,
    body: rawBody,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Tournament Software respondio ${response.status}`);
  }
}

export async function handleSquorePost(
  request: NextRequest,
  params: SquoreRequestParams = {}
) {
  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: getLiveSquoreResponseHeaders() }
    );
  }

  const url = new URL(request.url);
  const courtId = params.courtId ?? url.searchParams.get("courtId");

  if (!isLiveCourtId(courtId)) {
    return NextResponse.json(
      { error: "La cancha del vivo no es valida." },
      { status: 400, headers: getLiveSquoreResponseHeaders() }
    );
  }

  const providedToken =
    params.token ??
    url.searchParams.get("token") ??
    request.headers.get("x-squore-token") ??
    "";

  const expectedToken = await getStoredLiveCourtSquoreToken(courtId);

  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json(
      { error: "Token de Squore invalido." },
      { status: 401, headers: getLiveSquoreResponseHeaders() }
    );
  }

  const stream = await getStoredLiveCourtStream(courtId);

  if (!stream) {
    return NextResponse.json(
      {
        error: `No hay transmision configurada para ${getLiveCourtLabel(courtId)}.`
      },
      { status: 409, headers: getLiveSquoreResponseHeaders() }
    );
  }

  const rawBody = await request.clone().arrayBuffer();

  try {
    const payload = await readPayload(request);
    const scoreboard = normalizeSquoreScoreboard(payload);

    if (!scoreboard) {
      await updateLiveIngestStatus(courtId, {
        latest_payload_summary: "Payload recibido sin nombres de jugadores"
      }).catch(() => null);

      return NextResponse.json(
        { error: "No se pudo interpretar el payload de Squore." },
        { status: 400, headers: getLiveSquoreResponseHeaders() }
      );
    }

    const [profiles, mappings] = await Promise.all([
      fetchProfilesForLiveAvatars().catch(() => []),
      getStoredLivePlayerMappings().catch(() => [])
    ]);
    const enrichedScoreboard = attachLiveScoreboardAvatars(
      scoreboard,
      profiles,
      mappings
    );

    await setStoredLiveCourtScoreboard(courtId, enrichedScoreboard);
    await updateLiveIngestStatus(courtId, {
      last_score_received_at: new Date().toISOString(),
      latest_payload_summary: `${enrichedScoreboard.player_one_name} vs ${enrichedScoreboard.player_two_name}`,
      last_forward_error: null
    }).catch(() => null);

    let forwardedToTournamentSoftware = false;

    if (stream.tournament_software_post_url) {
      try {
        await forwardToTournamentSoftware(
          stream.tournament_software_post_url,
          request,
          rawBody
        );
        forwardedToTournamentSoftware = true;
        await updateLiveIngestStatus(courtId, {
          last_forwarded_at: new Date().toISOString(),
          last_forward_error: null
        }).catch(() => null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo reenviar a Tournament Software";
        await updateLiveIngestStatus(courtId, {
          last_forward_error: message
        }).catch(() => null);
        console.error(
          `No se pudo reenviar el score de ${courtId} a Tournament Software`,
          error
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        court_id: courtId,
        scoreboard: enrichedScoreboard,
        forwarded_to_tournament_software: forwardedToTournamentSoftware
      },
      { headers: getLiveSquoreResponseHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el marcador de Squore." },
      { status: 400, headers: getLiveSquoreResponseHeaders() }
    );
  }
}
