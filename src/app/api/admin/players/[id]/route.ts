import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";

type SupabaseUser = {
  id: string;
  email?: string;
};

type TargetProfile = {
  id: string;
  role?: string;
  avatar_url?: string | null;
};

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function getAvatarStoragePath(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return null;

  const marker = "/storage/v1/object/public/avatars/";
  const index = avatarUrl.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return avatarUrl.slice(index + marker.length);
}

export async function DELETE(
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
          "Falta configurar SUPABASE_SERVICE_ROLE_KEY para borrar perfiles."
      },
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

  const targetResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,role,avatar_url&id=eq.${params.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  const targetProfiles = (await targetResponse.json()) as TargetProfile[];
  const target = targetProfiles[0];

  if (!target) {
    return NextResponse.json(
      { error: "El perfil no existe o ya fue eliminado." },
      { status: 404 }
    );
  }

  if (target.role === "admin") {
    return NextResponse.json(
      { error: "No se puede borrar un perfil administrador." },
      { status: 403 }
    );
  }

  const avatarPath = getAvatarStoragePath(target.avatar_url);

  if (avatarPath) {
    await fetch(`${supabaseUrl}/storage/v1/object/avatars/${avatarPath}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });
  }

  const deleteResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${params.id}`,
    {
      method: "DELETE",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=representation"
      }
    }
  );

  const deleteText = await deleteResponse.text();
  const deletedProfiles = deleteText.trim()
    ? (JSON.parse(deleteText) as TargetProfile[])
    : [];

  if (!deleteResponse.ok) {
    return NextResponse.json(
      {
        error:
          "No se pudo eliminar el perfil. Si el usuario tiene reservas relacionadas, primero hay que reasignarlas o cancelarlas."
      },
      { status: deleteResponse.status }
    );
  }

  if (!deletedProfiles.length) {
    return NextResponse.json(
      {
        error: "La eliminación no se aplicó. Revisa permisos y relaciones."
      },
      { status: 500 }
    );
  }

  const deleteAuthResponse = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${params.id}`,
    {
      method: "DELETE",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  if (!deleteAuthResponse.ok && deleteAuthResponse.status !== 404) {
    console.warn(
      `No se pudo eliminar el usuario auth ${params.id}: ${deleteAuthResponse.status}`
    );
  }

  await logAdminAudit(supabaseUrl, serviceRoleKey, {
    actorId: user.id,
    action: "profile.deleted",
    targetType: "profile",
    targetId: params.id,
    details: {
      deleted_profile_id: deletedProfiles[0].id,
      deleted_avatar_url: deletedProfiles[0].avatar_url ?? null
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true, profile: deletedProfiles[0] });
}
