import { NextResponse } from "next/server";
import { attachExternalTournamentFlyers } from "@/lib/external-tournament-flyers-store";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache"
  };
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Falta configurar Supabase." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/external_tournaments?select=id,title,platform,event_date,location,url,notes,is_active,created_at&is_active=eq.true&order=event_date.asc.nullslast,created_at.desc`,
    {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  const text = await response.text();
  const rows = text.trim() ? JSON.parse(text) : [];

  if (!response.ok) {
    return NextResponse.json(
      { error: "No se pudieron cargar los torneos." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const tournaments = await attachExternalTournamentFlyers(rows);

  return NextResponse.json(tournaments, {
    headers: responseHeaders()
  });
}
