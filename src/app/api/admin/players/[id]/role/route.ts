import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

type RoleUpdateBody = {
  role?: "admin";
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

  const body = (await request.json()) as RoleUpdateBody;

  if (body.role !== "admin") {
    return NextResponse.json({ error: "Rol no soportado." }, { status: 400 });
  }

  const updateResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({ role: "admin" }),
      cache: "no-store"
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

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "profile.promoted",
    targetType: "profile",
    targetId: id,
    details: {
      role: "admin"
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true, profile: updatedProfiles[0] });
}
