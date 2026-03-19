import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { fetchProfileRole, getUser } from "@/lib/supabase";

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function requireAdmin(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Falta configuración de backend.", status: 503 as const };
  }

  if (!token) {
    return { error: "No autenticado", status: 401 as const };
  }

  const user = await getUser(token);
  if (!user) {
    return { error: "Sesión inválida", status: 401 as const };
  }

  const role = await fetchProfileRole(user.id, token);
  if (role !== "admin") {
    return {
      error: "No tienes permisos de administrador.",
      status: 403 as const
    };
  }

  return { supabaseUrl, serviceRoleKey, actorId: user.id };
}

async function fetchTournamentById(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/external_tournaments?select=id,title,platform,event_date,location,url,notes,is_active&id=eq.${id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
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
  const auth = await requireAdmin(request);
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
      body: JSON.stringify(body)
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
    actorId: auth.actorId,
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
  const auth = await requireAdmin(request);
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
      }
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
    actorId: auth.actorId,
    action: "external_tournament.deleted",
    targetType: "external_tournament",
    targetId: params.id,
    details: currentTournament ?? payload[0]
  }).catch(() => null);

  return NextResponse.json({ ok: true, tournament: payload[0] });
}
