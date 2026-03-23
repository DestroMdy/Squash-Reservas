import { NextRequest, NextResponse } from "next/server";
import { normalizeSquoreScoreboard } from "@/lib/live-score";
import {
  getStoredLiveStream,
  getStoredLiveSquoreToken,
  isLiveStreamStoreConfigured,
  setStoredLiveScoreboard
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

export async function POST(request: NextRequest) {
  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const url = new URL(request.url);
  const providedToken =
    url.searchParams.get("token") ||
    request.headers.get("x-squore-token") ||
    "";

  const expectedToken = await getStoredLiveSquoreToken();

  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json(
      { error: "Token de Squore inválido." },
      { status: 401, headers: responseHeaders() }
    );
  }

  const stream = await getStoredLiveStream();

  if (!stream) {
    return NextResponse.json(
      { error: "No hay transmisión configurada para vincular el marcador." },
      { status: 409, headers: responseHeaders() }
    );
  }

  try {
    const payload = await readPayload(request);
    const scoreboard = normalizeSquoreScoreboard(payload);

    if (!scoreboard) {
      return NextResponse.json(
        { error: "No se pudo interpretar el payload de Squore." },
        { status: 400, headers: responseHeaders() }
      );
    }

    await setStoredLiveScoreboard(scoreboard);

    return NextResponse.json(
      { ok: true, scoreboard },
      { headers: responseHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el marcador de Squore." },
      { status: 400, headers: responseHeaders() }
    );
  }
}
