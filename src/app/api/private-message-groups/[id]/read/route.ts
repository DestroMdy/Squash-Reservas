import { NextRequest, NextResponse } from "next/server";

type SupabaseUser = {
  id: string;
  email?: string;
};

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configuración de backend." },
      { status: 503 }
    );
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
  }

  const user = (await userResponse.json()) as SupabaseUser;

  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/private_message_group_members?group_id=eq.${params.id}&user_id=eq.${user.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        last_read_at: new Date().toISOString()
      })
    }
  );

  if (!updateResponse.ok) {
    return NextResponse.json(
      { error: "No se pudo marcar el grupo como leído." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
