import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  attachExternalTournamentFlyers,
  deleteStoredExternalTournamentFlyer,
  getStoredExternalTournamentFlyer
} from "@/lib/external-tournament-flyers-store";
import { getStoragePathFromPublicUrl } from "@/lib/avatar-url";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

const TOURNAMENT_FLYER_BUCKET = "avatars";

async function fetchTournamentById(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/external_tournaments?select=id,title,platform,event_date,location,url,notes,is_active&id=eq.${id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const text = await response.text();
  const rows = text.trim() ? JSON.parse(text) : [];
  const tournaments = await attachExternalTournamentFlyers(rows);
  return tournaments[0] ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const currentTournament = await fetchTournamentById(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    id
  );

  const body = await request.json();

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/external_tournaments?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    }
  );

  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : [];

  if (!response.ok || !payload.length) {
    return NextResponse.json(
      { error: "No se pudo actualizar el torneo externo." },
      { status: 400 }
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "external_tournament.updated",
    targetType: "external_tournament",
    targetId: id,
    details: {
      before: currentTournament,
      after: payload[0]
    }
  }).catch(() => null);

  const [tournament] = await attachExternalTournamentFlyers(payload);

  return NextResponse.json({ ok: true, tournament });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const currentTournament = await fetchTournamentById(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    id
  );
  const currentFlyerUrl = await getStoredExternalTournamentFlyer(id).catch(
    () => null
  );

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/external_tournaments?id=eq.${id}`,
    {
      method: "DELETE",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      cache: "no-store"
    }
  );

  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : [];

  if (!response.ok || !payload.length) {
    return NextResponse.json(
      { error: "No se pudo borrar el torneo externo." },
      { status: 400 }
    );
  }

  const flyerPath = getStoragePathFromPublicUrl(
    TOURNAMENT_FLYER_BUCKET,
    currentFlyerUrl
  );

  if (flyerPath) {
    await fetch(`${auth.supabaseUrl}/storage/v1/object/${TOURNAMENT_FLYER_BUCKET}/${flyerPath}`, {
      method: "DELETE",
      headers: {
        apikey: auth.serviceRoleKey,
        Authorization: `Bearer ${auth.serviceRoleKey}`
      },
      cache: "no-store"
    }).catch(() => null);
  }

  await deleteStoredExternalTournamentFlyer(id).catch(() => null);

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "external_tournament.deleted",
    targetType: "external_tournament",
    targetId: id,
    details: currentTournament ?? payload[0]
  }).catch(() => null);

  return NextResponse.json({ ok: true, tournament: payload[0] });
}
