import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
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

type MatchPayload = {
  opponent_id?: string;
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

async function fetchProfilesMap(
  supabaseUrl: string,
  serviceRoleKey: string,
  ids: string[]
) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,category,avatar_url&id=in.(${uniqueIds.join(",")})`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  if (!response.ok) {
    return {};
  }

  const rows = (await response.json()) as Array<{
    id: string;
    full_name?: string | null;
    category?: string | null;
    avatar_url?: string | null;
  }>;

  return rows.reduce<Record<string, (typeof rows)[number]>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
}

async function fetchMatchesForUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/casual_matches?select=id,created_by,player_one_id,player_two_id,played_on,location,score_player_one,score_player_two,notes,created_at,updated_at&or=(player_one_id.eq.${userId},player_two_id.eq.${userId})&order=played_on.desc,created_at.desc`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    if (text.includes("casual_matches")) {
      return { unavailable: true as const, rows: [] as MatchRow[] };
    }
    throw new Error("No se pudieron cargar los partidos.");
  }

  const rows = (await response.json()) as MatchRow[];
  return { unavailable: false as const, rows };
}

function formatMatches(
  rows: MatchRow[],
  profilesMap: Record<
    string,
    {
      id: string;
      full_name?: string | null;
      category?: string | null;
      avatar_url?: string | null;
    }
  >
) {
  return rows.map((match) => ({
    ...match,
    player_one: profilesMap[match.player_one_id] ?? null,
    player_two: profilesMap[match.player_two_id] ?? null
  }));
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

export async function GET(request: NextRequest) {
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

  try {
    const result = await fetchMatchesForUser(supabaseUrl, serviceRoleKey, user.id);
    if (result.unavailable) {
      return NextResponse.json({ matches: [], unavailable: true });
    }

    const ids = result.rows.flatMap((match) => [match.player_one_id, match.player_two_id]);
    const profilesMap = await fetchProfilesMap(supabaseUrl, serviceRoleKey, ids);

    return NextResponse.json({
      matches: formatMatches(result.rows, profilesMap)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudieron cargar los partidos."
      },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json()) as MatchPayload;

  if (!body.opponent_id || !body.played_on) {
    return NextResponse.json(
      { error: "Rival y fecha son obligatorios." },
      { status: 400 }
    );
  }

  if (body.opponent_id === user.id) {
    return NextResponse.json(
      { error: "No puedes cargarte un partido contra ti mismo." },
      { status: 400 }
    );
  }

  const scoreError = validateScores(body.score_self, body.score_opponent);
  if (scoreError) {
    return NextResponse.json({ error: scoreError }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `casual-match-create:${ip}:${user.id}`,
    max: 10,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Demasiados partidos cargados en poco tiempo. Espera unos segundos." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/casual_matches`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      created_by: user.id,
      player_one_id: user.id,
      player_two_id: body.opponent_id,
      played_on: body.played_on,
      location: body.location?.trim() || null,
      score_player_one: body.score_self,
      score_player_two: body.score_opponent,
      notes: body.notes?.trim() || null
    })
  });

  const text = await insertResponse.text();
  const rows = text.trim() ? (JSON.parse(text) as MatchRow[]) : [];

  if (!insertResponse.ok || !rows.length) {
    return NextResponse.json(
      { error: "No se pudo guardar el partido." },
      { status: 400 }
    );
  }

  const profilesMap = await fetchProfilesMap(supabaseUrl, serviceRoleKey, [
    rows[0].player_one_id,
    rows[0].player_two_id
  ]);

  return NextResponse.json({
    ok: true,
    match: formatMatches(rows, profilesMap)[0]
  });
}
