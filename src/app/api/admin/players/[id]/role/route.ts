import { NextRequest, NextResponse } from "next/server";

type RoleUpdateBody = {
  role?: "admin";
};

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
      {
        error:
          "Falta configurar SUPABASE_SERVICE_ROLE_KEY para administrar roles."
      },
      { status: 503 }
    );
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const body = (await request.json()) as RoleUpdateBody;

  if (body.role !== "admin") {
    return NextResponse.json({ error: "Rol no soportado." }, { status: 400 });
  }

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

  const callerResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  const callerProfiles = (await callerResponse.json()) as Array<{
    role?: string;
  }>;

  if (callerProfiles[0]?.role !== "admin") {
    return NextResponse.json(
      { error: "No tienes permisos de administrador." },
      { status: 403 }
    );
  }

  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({ role: "admin" })
    }
  );

  const updateText = await updateResponse.text();
  const updatedProfiles = updateText.trim()
    ? (JSON.parse(updateText) as Array<{ id: string; role?: string }>)
    : [];

  if (!updateResponse.ok) {
    return NextResponse.json(
      {
        error: "No se pudo actualizar el rol del usuario."
      },
      { status: updateResponse.status }
    );
  }

  if (!updatedProfiles.length || updatedProfiles[0]?.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "La actualización de rol no se aplicó. Revisa permisos de backend."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, profile: updatedProfiles[0] });
}
