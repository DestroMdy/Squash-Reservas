import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";

type ProfilePayload = {
  full_name?: string | null;
  phone?: string | null;
  category?: string | null;
  avatar_url?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,phone,category,role,avatar_url&id=eq.${auth.user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<Record<string, unknown>>;

  if (!response.ok) {
    return NextResponse.json(
      { error: "No se pudo cargar el perfil." },
      { status: 400 }
    );
  }

  return NextResponse.json({ profile: rows[0] ?? null });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as ProfilePayload;
  const payload: ProfilePayload = {};

  if ("full_name" in body) payload.full_name = body.full_name ?? null;
  if ("phone" in body) payload.phone = body.phone ?? null;
  if ("category" in body) payload.category = body.category ?? null;
  if ("avatar_url" in body) payload.avatar_url = body.avatar_url ?? null;

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${auth.user.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<Record<string, unknown>>;

  if (!response.ok) {
    return NextResponse.json(
      { error: "No se pudo actualizar el perfil." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, profile: rows[0] ?? null });
}
