import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

type TargetProfile = {
  id: string;
  full_name?: string | null;
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

async function fetchTargetProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  profileId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,avatar_url&id=eq.${profileId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as TargetProfile[];
  return {
    ok: response.ok,
    profile: rows[0] || null
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = await fetchTargetProfile(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    params.id
  );

  if (!target.ok || !target.profile) {
    return NextResponse.json(
      { error: "No se encontró el perfil." },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Debes subir un archivo válido." },
      { status: 400 }
    );
  }

  const extension = AVATAR_ALLOWED_MIME_TYPES.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: "La foto debe ser JPG, PNG o WebP." },
      { status: 400 }
    );
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "La foto no puede superar los 5 MB." },
      { status: 400 }
    );
  }

  const filePath = `${params.id}/avatar.${extension}`;
  const uploadResponse = await fetch(
    `${auth.supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}/${filePath}`,
    {
      method: "POST",
      headers: {
        apikey: auth.serviceRoleKey,
        Authorization: `Bearer ${auth.serviceRoleKey}`,
        "x-upsert": "true",
        "Content-Type": file.type
      },
      body: file,
      cache: "no-store"
    }
  );

  const uploadText = await uploadResponse.text();

  if (!uploadResponse.ok) {
    return NextResponse.json(
      { error: uploadText || "No se pudo subir la foto." },
      { status: 400 }
    );
  }

  const avatarUrl = `${auth.supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${filePath}`;
  const profileResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({ avatar_url: avatarUrl }),
      cache: "no-store"
    }
  );

  const rows = (await profileResponse.json()) as TargetProfile[];
  const updatedProfile = rows[0] || null;

  if (!profileResponse.ok || !updatedProfile) {
    return NextResponse.json(
      { error: "La foto se subió, pero no se pudo actualizar el perfil." },
      { status: 400 }
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "profile.avatar.updated",
    targetType: "profile",
    targetId: params.id,
    details: {
      previous_avatar_url: target.profile.avatar_url ?? null,
      next_avatar_url: avatarUrl
    }
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    avatar_url: avatarUrl,
    profile: updatedProfile
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = await fetchTargetProfile(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    params.id
  );

  if (!target.ok || !target.profile) {
    return NextResponse.json(
      { error: "No se encontró el perfil." },
      { status: 404 }
    );
  }

  const avatarPath = getAvatarStoragePath(target.profile.avatar_url);

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

  const profileResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({ avatar_url: null }),
      cache: "no-store"
    }
  );

  const rows = (await profileResponse.json()) as TargetProfile[];
  const updatedProfile = rows[0] || null;

  if (!profileResponse.ok || !updatedProfile) {
    return NextResponse.json(
      { error: "No se pudo quitar la foto del perfil." },
      { status: 400 }
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "profile.avatar.deleted",
    targetType: "profile",
    targetId: params.id,
    details: {
      previous_avatar_url: target.profile.avatar_url ?? null
    }
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    profile: updatedProfile
  });
}
