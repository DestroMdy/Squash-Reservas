import { NextRequest, NextResponse } from "next/server";
import { isMissingAuditTableError } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Authorization, Cookie"
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      {
        status: auth.status,
        headers: NO_STORE_HEADERS
      }
    );
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/admin_audit_logs?select=id,actor_id,action,target_type,target_id,details,created_at,profiles!admin_audit_logs_actor_id_fkey(id,full_name,category,avatar_url)&order=created_at.desc&limit=50`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  const text = await response.text();

  if (!response.ok) {
    if (isMissingAuditTableError(text)) {
      return NextResponse.json(
        { logs: [], enabled: false },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: "No se pudo cargar la auditoría admin." },
      {
        status: 400,
        headers: NO_STORE_HEADERS
      }
    );
  }

  const payload = text.trim() ? JSON.parse(text) : [];
  return NextResponse.json(
    { logs: payload, enabled: true },
    { headers: NO_STORE_HEADERS }
  );
}
