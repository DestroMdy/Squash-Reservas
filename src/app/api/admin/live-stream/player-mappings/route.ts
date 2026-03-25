import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";
import {
  deleteStoredLivePlayerMapping,
  getStoredLivePlayerMappings,
  isLiveStreamStoreConfigured,
  upsertStoredLivePlayerMapping
} from "@/lib/live-stream-store";

type PlayerMappingBody = {
  id?: string | null;
  squore_name?: string;
  profile_id?: string;
};

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

async function fetchProfileSummary(
  supabaseUrl: string,
  serviceRoleKey: string,
  profileId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,avatar_url&id=eq.${profileId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const profiles = (await response.json()) as Array<{
    id: string;
    full_name: string | null;
    avatar_url?: string | null;
  }>;

  return profiles[0] || null;
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
    const mappings = await getStoredLivePlayerMappings();

    return NextResponse.json(
      { mappings },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar las vinculaciones manuales." },
      { status: 400, headers: responseHeaders() }
    );
  }
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json()) as PlayerMappingBody;

  if (!body.squore_name?.trim() || !body.profile_id?.trim()) {
    return NextResponse.json(
      { error: "Nombre de Squore y jugador son obligatorios." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const profile = await fetchProfileSummary(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    body.profile_id.trim()
  );

  if (!profile) {
    return NextResponse.json(
      { error: "No se encontro el perfil seleccionado." },
      { status: 404, headers: responseHeaders() }
    );
  }

  try {
    const mapping = await upsertStoredLivePlayerMapping({
      id: body.id?.trim() || null,
      squore_name: body.squore_name.trim(),
      profile_id: profile.id,
      profile_name: profile.full_name,
      avatar_url: profile.avatar_url || null,
      updated_by: auth.user.id
    });

    const mappings = await getStoredLivePlayerMappings();

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "live_stream.player_mapping_upserted",
      targetType: "live_player_mapping",
      targetId: mapping.id,
      details: {
        squore_name: mapping.squore_name,
        profile_id: mapping.profile_id,
        profile_name: mapping.profile_name
      }
    }).catch(() => null);

    return NextResponse.json(
      { ok: true, mapping, mappings },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar la vinculacion manual." },
      { status: 400, headers: responseHeaders() }
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

  const body = (await request.json()) as { id?: string };

  if (!body.id?.trim()) {
    return NextResponse.json(
      { error: "Debes indicar la vinculacion a borrar." },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const mappings = await deleteStoredLivePlayerMapping(body.id.trim());

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "live_stream.player_mapping_deleted",
      targetType: "live_player_mapping",
      targetId: body.id.trim(),
      details: null
    }).catch(() => null);

    return NextResponse.json(
      { ok: true, mappings },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo borrar la vinculacion manual." },
      { status: 400, headers: responseHeaders() }
    );
  }
}
