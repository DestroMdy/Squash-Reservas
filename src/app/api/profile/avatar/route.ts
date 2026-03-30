import { NextRequest, NextResponse } from "next/server";
import { buildAvatarPublicUrl } from "@/lib/avatar-url";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  const filePath = `${auth.user.id}/avatar.${extension}`;
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

  const avatarUrl = buildAvatarPublicUrl(auth.supabaseUrl, filePath);
  const profileResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${auth.user.id}`,
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

  const rows = (await profileResponse.json()) as Array<Record<string, unknown>>;

  if (!profileResponse.ok) {
    return NextResponse.json(
      { error: "La foto se subió, pero no se pudo actualizar el perfil." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    avatar_url: avatarUrl,
    profile: rows[0] ?? null
  });
}
