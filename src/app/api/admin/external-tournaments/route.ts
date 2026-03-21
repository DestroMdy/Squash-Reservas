import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/external_tournaments?select=id,title,platform,event_date,location,url,notes,is_active,created_at&order=event_date.asc.nullslast,created_at.desc`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : [];

  if (!response.ok) {
    return NextResponse.json(
      { error: "No se pudieron cargar los torneos externos." },
      { status: 400 }
    );
  }

  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    title?: string;
    platform?: string;
    event_date?: string | null;
    location?: string | null;
    url?: string;
    notes?: string | null;
    is_active?: boolean;
  };

  if (!body.title?.trim() || !body.url?.trim() || !body.platform) {
    return NextResponse.json(
      { error: "Título, plataforma y link son obligatorios." },
      { status: 400 }
    );
  }

  const response = await fetch(`${auth.supabaseUrl}/rest/v1/external_tournaments`, {
    method: "POST",
    headers: {
      ...adminHeaders(auth.serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      title: body.title.trim(),
      platform: body.platform,
      event_date: body.event_date || null,
      location: body.location?.trim() || null,
      url: body.url.trim(),
      notes: body.notes?.trim() || null,
      is_active: body.is_active ?? true
    }),
    cache: "no-store"
  });

  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : [];

  if (!response.ok || !payload.length) {
    return NextResponse.json(
      { error: "No se pudo guardar el torneo externo." },
      { status: 400 }
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "external_tournament.created",
    targetType: "external_tournament",
    targetId: payload[0].id,
    details: {
      title: payload[0].title,
      platform: payload[0].platform,
      event_date: payload[0].event_date
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true, tournament: payload[0] });
}
