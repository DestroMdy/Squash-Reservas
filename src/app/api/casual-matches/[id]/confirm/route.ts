import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import { setCasualMatchConfirmationState } from "@/lib/casual-match-state-store";

type MatchRow = {
  id: string;
  created_by: string;
  player_one_id: string;
  player_two_id: string;
};

async function fetchMatchById(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/casual_matches?select=id,created_by,player_one_id,player_two_id&id=eq.${id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as MatchRow[];
  return rows[0] ?? null;
}

async function fetchRole(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as Array<{ role?: string | null }>;
  return rows[0]?.role ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentMatch = await fetchMatchById(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    params.id
  );

  if (!currentMatch) {
    return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });
  }

  const role = await fetchRole(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    auth.user.id
  );

  if (currentMatch.player_two_id !== auth.user.id && role !== "admin") {
    return NextResponse.json(
      { error: "Solo el rival puede confirmar o revisar este resultado." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as {
    action?: "confirm" | "review";
    note?: string | null;
  };

  if (body.action !== "confirm" && body.action !== "review") {
    return NextResponse.json(
      { error: "Accion no soportada." },
      { status: 400 }
    );
  }

  const nextState = await setCasualMatchConfirmationState(params.id, {
    status: body.action === "confirm" ? "confirmed" : "revision_requested",
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
    note: body.note?.trim() || null
  });

  return NextResponse.json({
    ok: true,
    confirmation: nextState
  });
}
