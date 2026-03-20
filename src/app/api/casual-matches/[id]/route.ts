import { NextRequest, NextResponse } from "next/server";
import { fetchProfileRole, getUser } from "@/lib/supabase";

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

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function fetchMatchById(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/casual_matches?select=id,created_by,player_one_id,player_two_id,played_on,location,score_player_one,score_player_two,notes,created_at,updated_at&id=eq.${id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as MatchRow[];
  return rows[0] ?? null;
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
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configuración de backend para partidos." },
      { status: 503 }
    );
  }

  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const role = await fetchProfileRole(user.id, token);
  const currentMatch = await fetchMatchById(supabaseUrl, serviceRoleKey, params.id);

  if (!currentMatch) {
    return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });
  }

  if (!canManageMatch(user.id, role, currentMatch)) {
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
    `${supabaseUrl}/rest/v1/casual_matches?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        played_on: body.played_on,
        location: body.location?.trim() || null,
        score_player_one: body.score_self,
        score_player_two: body.score_opponent,
        notes: body.notes?.trim() || null
      })
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

  return NextResponse.json({ ok: true, match: rows[0] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configuración de backend para partidos." },
      { status: 503 }
    );
  }

  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const role = await fetchProfileRole(user.id, token);
  const currentMatch = await fetchMatchById(supabaseUrl, serviceRoleKey, params.id);

  if (!currentMatch) {
    return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });
  }

  if (!canManageMatch(user.id, role, currentMatch)) {
    return NextResponse.json(
      { error: "No puedes borrar este partido." },
      { status: 403 }
    );
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/casual_matches?id=eq.${params.id}`,
    {
      method: "DELETE",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=representation"
      }
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

  return NextResponse.json({ ok: true });
}
