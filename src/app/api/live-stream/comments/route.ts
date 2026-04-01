import { NextRequest, NextResponse } from "next/server";
import {
  addStoredLiveCourtComment,
  isLiveCommentsStoreConfigured
} from "@/lib/live-comments-store";
import {
  INCOMPLETE_PROFILE_LIVE_COMMENTS_ERROR,
  fetchProfileCompletionStatus
} from "@/lib/profile-completion";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import {
  adminHeaders,
  requireAuthenticatedRequest
} from "@/lib/server-auth";
import { isLiveCourtId } from "@/lib/live-stream";

type CreateLiveCommentBody = {
  court_id?: string;
  body?: string;
};

type CommenterProfile = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

async function fetchCommenterProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,avatar_url&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error("No se pudo cargar el perfil del comentarista.");
  }

  const rows = text.trim() ? (JSON.parse(text) as CommenterProfile[]) : [];
  return rows[0] || null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveCommentsStoreConfigured()) {
    return NextResponse.json(
      { error: "Los comentarios del vivo no estan disponibles ahora." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as CreateLiveCommentBody;

  if (!isLiveCourtId(body.court_id)) {
    return NextResponse.json(
      { error: "La cancha del comentario no es valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  if (!body.body?.trim()) {
    return NextResponse.json(
      { error: "Escribe un comentario antes de enviarlo." },
      { status: 400, headers: responseHeaders() }
    );
  }

  if (body.body.trim().length > 280) {
    return NextResponse.json(
      { error: "El comentario no puede superar los 280 caracteres." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const profileStatus = await fetchProfileCompletionStatus(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    auth.user.id
  );

  if (!profileStatus.complete) {
    return NextResponse.json(
      { error: INCOMPLETE_PROFILE_LIVE_COMMENTS_ERROR },
      { status: 403, headers: responseHeaders() }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `live-comment:${ip}:${auth.user.id}:${body.court_id}`,
    max: 12,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiados comentarios en poco tiempo. Espera unos segundos antes de volver a escribir."
      },
      {
        status: 429,
        headers: {
          ...responseHeaders(),
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  try {
    const commenterProfile = await fetchCommenterProfile(
      auth.supabaseUrl,
      auth.serviceRoleKey,
      auth.user.id
    );

    if (!commenterProfile?.full_name?.trim()) {
      return NextResponse.json(
        { error: INCOMPLETE_PROFILE_LIVE_COMMENTS_ERROR },
        { status: 403, headers: responseHeaders() }
      );
    }

    const comment = await addStoredLiveCourtComment(body.court_id, {
      user_id: auth.user.id,
      full_name: commenterProfile.full_name,
      avatar_url: commenterProfile.avatar_url || null,
      body: body.body.trim()
    });

    return NextResponse.json(
      {
        ok: true,
        comment
      },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el comentario del vivo." },
      { status: 400, headers: responseHeaders() }
    );
  }
}
