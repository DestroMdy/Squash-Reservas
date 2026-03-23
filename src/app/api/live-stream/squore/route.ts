import { NextRequest, NextResponse } from "next/server";
import { getLiveCourtLabel, isLiveCourtId } from "@/lib/live-stream";
import { normalizeSquoreScoreboard } from "@/lib/live-score";
import {
  getStoredLiveCourtSquoreToken,
  getStoredLiveCourtStream,
  isLiveStreamStoreConfigured,
  setStoredLiveCourtScoreboard
} from "@/lib/live-stream-store";

function responseHeaders() {
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

export async function POST(request: NextRequest) {
  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const url = new URL(request.url);
  const courtId = url.searchParams.get("courtId");

  if (!isLiveCourtId(courtId)) {
    return NextResponse.json(
      { error: "La cancha del vivo no es valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const providedToken =
    url.searchParams.get("token") ||
    request.headers.get("x-squore-token") ||
    "";

  const expectedToken = await getStoredLiveCourtSquoreToken(courtId);

  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json(
      { error: "Token de Squore invalido." },
      { status: 401, headers: responseHeaders() }
    );
  }

  const stream = await getStoredLiveCourtStream(courtId);

  if (!stream) {
    return NextResponse.json(
      {
        error: `No hay transmision configurada para ${getLiveCourtLabel(courtId)}.`
      },
      { status: 409, headers: responseHeaders() }
    );
  }

  const rawBody = await request.clone().arrayBuffer();

  try {
    const payload = await readPayload(request);
    const scoreboard = normalizeSquoreScoreboard(payload);

    if (!scoreboard) {
      return NextResponse.json(
        { error: "No se pudo interpretar el payload de Squore." },
        { status: 400, headers: responseHeaders() }
      );
    }

    await setStoredLiveCourtScoreboard(courtId, scoreboard);

    let forwardedToTournamentSoftware = false;

    if (stream.tournament_software_post_url) {
      try {
        await forwardToTournamentSoftware(
          stream.tournament_software_post_url,
          request,
          rawBody
        );
        forwardedToTournamentSoftware = true;
      } catch (error) {
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
        scoreboard,
        forwarded_to_tournament_software: forwardedToTournamentSoftware
      },
      { headers: responseHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el marcador de Squore." },
      { status: 400, headers: responseHeaders() }
    );
  }
}
