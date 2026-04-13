import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

type TargetProfile = {
  id: string;
  full_name?: string | null;
  role?: string | null;
};

type UpdatePasswordPayload = {
  password?: string;
};

function normalizePasswordError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("password should be at least") ||
    normalized.includes("password is too short")
  ) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  return message || "No se pudo actualizar la contraseña.";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as UpdatePasswordPayload;
  const password = body.password?.trim() || "";

  if (!password) {
    return NextResponse.json(
      { error: "Debes ingresar una nueva contraseña." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres." },
      { status: 400 }
    );
  }

  const targetResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,role&id=eq.${params.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  const targetProfiles = (await targetResponse.json()) as TargetProfile[];
  const target = targetProfiles[0];

  if (!targetResponse.ok || !target) {
    return NextResponse.json(
      { error: "No se encontró el perfil." },
      { status: 404 }
    );
  }

  if (target.role === "admin") {
    return NextResponse.json(
      { error: "Por seguridad, la contraseña de otro administrador no se cambia desde este panel." },
      { status: 403 }
    );
  }

  const updateResponse = await fetch(
    `${auth.supabaseUrl}/auth/v1/admin/users/${params.id}`,
    {
      method: "PUT",
      headers: adminHeaders(auth.serviceRoleKey),
      body: JSON.stringify({ password }),
      cache: "no-store"
    }
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();

    return NextResponse.json(
      { error: normalizePasswordError(errorText) },
      { status: updateResponse.status }
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "profile.password.updated",
    targetType: "profile",
    targetId: params.id,
    details: {
      target_full_name: target.full_name ?? null
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
