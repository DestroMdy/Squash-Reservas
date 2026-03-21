import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

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
  return rows[0] ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentTournament = await fetchTournamentById(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    params.id
  );

  const body = await request.json();

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/external_tournaments?id=eq.${params.id}`,
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
    targetId: params.id,
    details: {
      before: currentTournament,
      after: payload[0]
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true, tournament: payload[0] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentTournament = await fetchTournamentById(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    params.id
  );

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/external_tournaments?id=eq.${params.id}`,
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

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "external_tournament.deleted",
    targetType: "external_tournament",
    targetId: params.id,
    details: currentTournament ?? payload[0]
  }).catch(() => null);

  return NextResponse.json({ ok: true, tournament: payload[0] });
}
