import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { extractYouTubeVideoId } from "@/lib/live-stream";
import {
  clearStoredLiveStream,
  getStoredLiveStream,
  isLiveStreamStoreConfigured,
  setStoredLiveStream
} from "@/lib/live-stream-store";
import { requireAdminRequest } from "@/lib/server-auth";

type LiveStreamBody = {
  title?: string;
  description?: string | null;
  youtube_url?: string;
  starts_at?: string | null;
  is_live?: boolean;
};

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
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
    const stream = await getStoredLiveStream();

    return NextResponse.json(
      { stream },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar la transmision en vivo." },
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

  try {
    const stream = await setStoredLiveStream({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      youtube_url: body.youtube_url.trim(),
      youtube_video_id: videoId,
      is_live: Boolean(body.is_live),
      starts_at: body.starts_at?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id
    });

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "live_stream.updated",
      targetType: "live_stream",
      targetId: "current",
      details: {
        title: stream.title,
        youtube_url: stream.youtube_url,
        is_live: stream.is_live,
        starts_at: stream.starts_at
      }
    }).catch(() => null);

    return NextResponse.json(
      { ok: true, stream },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar la transmision en vivo." },
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

  try {
    await clearStoredLiveStream();

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "live_stream.deleted",
      targetType: "live_stream",
      targetId: "current",
      details: null
    }).catch(() => null);

    return NextResponse.json(
      { ok: true },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo limpiar la transmision en vivo." },
      {
        status: 400,
        headers: responseHeaders()
      }
    );
  }
}
