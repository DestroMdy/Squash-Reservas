import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const updateResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_group_members?group_id=eq.${params.id}&user_id=eq.${auth.user.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        last_read_at: new Date().toISOString()
      }),
      cache: "no-store"
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
