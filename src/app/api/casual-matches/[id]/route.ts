import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import {
  clearCasualMatchConfirmationState,
  initializeCasualMatchConfirmationState
} from "@/lib/casual-match-state-store";
import {
  fetchProfileCompletionStatus,
  INCOMPLETE_PROFILE_MATCHES_ERROR
} from "@/lib/profile-completion";

type MatchRow = {
  id: string;
  created_by: string;
  player_one_id: string;
  player_two_id: string;
  played_on: string;
  location: string | null;
  score_player_one: number;
  score_player_two: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MatchUpdatePayload = {
  played_on?: string;
  location?: string | null;
  score_self?: number;
  score_opponent?: number;
  notes?: string | null;
};

async function fetchMatchById(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/casual_matches?select=id,created_by,player_one_id,player_two_id,played_on,location,score_player_one,score_player_two,notes,created_at,updated_at&id=eq.${id}&limit=1`,
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

function canManageMatch(
  userId: string,
  role: string | null | undefined,
  match: MatchRow | null
) {
  if (!match) return false;
  if (role === "admin") return true;
  return match.created_by === userId;
}

function validateScores(scoreSelf: number | undefined, scoreOpponent: number | undefined) {
  if (
    typeof scoreSelf !== "number" ||
    Number.isNaN(scoreSelf) ||
    typeof scoreOpponent !== "number" ||
    Number.isNaN(scoreOpponent)
  ) {
    return "Debes cargar el resultado del partido.";
  }

  if (scoreSelf < 0 || scoreOpponent < 0) {
    return "El resultado no puede ser negativo.";
  }

  if (scoreSelf === scoreOpponent) {
    return "El partido no puede terminar empatado.";
  }

  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const role = await fetchRole(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    auth.user.id
  );

  if (role !== "admin") {
    const currentProfileStatus = await fetchProfileCompletionStatus(
      auth.supabaseUrl,
      auth.serviceRoleKey as string,
      auth.user.id
    );

    if (!currentProfileStatus.complete) {
      return NextResponse.json(
        { error: INCOMPLETE_PROFILE_MATCHES_ERROR },
        { status: 403 }
      );
    }
  }

  const currentMatch = await fetchMatchById(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    id
  );

  if (!currentMatch) {
    return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });
  }

  if (!canManageMatch(auth.user.id, role, currentMatch)) {
    return NextResponse.json(
      { error: "No puedes editar este partido." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as MatchUpdatePayload;

  if (!body.played_on) {
    return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });
  }

  const scoreError = validateScores(body.score_self, body.score_opponent);
  if (scoreError) {
    return NextResponse.json({ error: scoreError }, { status: 400 });
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/casual_matches?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey as string),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        played_on: body.played_on,
        location: body.location?.trim() || null,
        score_player_one: body.score_self,
        score_player_two: body.score_opponent,
        notes: body.notes?.trim() || null
      }),
      cache: "no-store"
    }
  );

  const text = await response.text();
  const rows = text.trim() ? (JSON.parse(text) as MatchRow[]) : [];

  if (!response.ok || !rows.length) {
    return NextResponse.json(
      { error: "No se pudo actualizar el partido." },
      { status: 400 }
    );
  }

  if (role !== "admin") {
    await initializeCasualMatchConfirmationState(id, auth.user.id);
  }

  return NextResponse.json({ ok: true, match: rows[0] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const role = await fetchRole(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    auth.user.id
  );
  const currentMatch = await fetchMatchById(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    id
  );

  if (!currentMatch) {
    return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });
  }

  if (!canManageMatch(auth.user.id, role, currentMatch)) {
    return NextResponse.json(
      { error: "No puedes borrar este partido." },
      { status: 403 }
    );
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/casual_matches?id=eq.${id}`,
    {
      method: "DELETE",
      headers: {
        ...adminHeaders(auth.serviceRoleKey as string),
        Prefer: "return=representation"
      },
      cache: "no-store"
    }
  );

  const text = await response.text();
  const rows = text.trim() ? (JSON.parse(text) as MatchRow[]) : [];

  if (!response.ok || !rows.length) {
    return NextResponse.json(
      { error: "No se pudo borrar el partido." },
      { status: 400 }
    );
  }

  await clearCasualMatchConfirmationState(id);

  return NextResponse.json({ ok: true });
}
