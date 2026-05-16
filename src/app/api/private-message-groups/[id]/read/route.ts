import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import {
  fetchProfileCompletionStatus,
  INCOMPLETE_PROFILE_MESSAGES_ERROR
} from "@/lib/profile-completion";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

  const profileStatus = await fetchProfileCompletionStatus(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    auth.user.id
  );

  if (!profileStatus.complete) {
    return NextResponse.json(
      { error: INCOMPLETE_PROFILE_MESSAGES_ERROR },
      { status: 403 }
    );
  }

  const updateResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_group_members?group_id=eq.${id}&user_id=eq.${auth.user.id}`,
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
