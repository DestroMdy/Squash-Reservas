import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

type TargetProfile = {
  id: string;
  role?: string;
  avatar_url?: string | null;
};

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
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const targetResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=id,role,avatar_url&id=eq.${params.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
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
    await fetch(`${auth.supabaseUrl}/storage/v1/object/avatars/${avatarPath}`, {
      method: "DELETE",
      headers: {
        apikey: auth.serviceRoleKey,
        Authorization: `Bearer ${auth.serviceRoleKey}`
      },
      cache: "no-store"
    });
  }

  const deleteResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${params.id}`,
    {
      method: "DELETE",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      cache: "no-store"
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
    `${auth.supabaseUrl}/auth/v1/admin/users/${params.id}`,
    {
      method: "DELETE",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!deleteAuthResponse.ok && deleteAuthResponse.status !== 404) {
    console.warn(
      `No se pudo eliminar el usuario auth ${params.id}: ${deleteAuthResponse.status}`
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
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
