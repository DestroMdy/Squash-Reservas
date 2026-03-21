import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,phone,category,role,avatar_url&order=category.asc,full_name.asc`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<Record<string, unknown>>;

  if (!response.ok) {
    return NextResponse.json(
      { error: "No se pudo cargar la lista de jugadores." },
      { status: 400 }
    );
  }

  return NextResponse.json({ players: rows });
}
