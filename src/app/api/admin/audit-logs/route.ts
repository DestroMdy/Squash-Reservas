import { NextRequest, NextResponse } from "next/server";
import { fetchProfileRole, getUser } from "@/lib/supabase";
import { isMissingAuditTableError } from "@/lib/admin-audit";

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function requireAdmin(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Falta configuración de backend.", status: 503 as const };
  }

  if (!token) {
    return { error: "No autenticado", status: 401 as const };
  }

  const user = await getUser(token);
  if (!user) {
    return { error: "Sesión inválida", status: 401 as const };
  }

  const role = await fetchProfileRole(user.id, token);
  if (role !== "admin") {
    return {
      error: "No tienes permisos de administrador.",
      status: 403 as const
    };
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const response = await fetch(
    `${auth.supabaseUrl}/rest/v1/admin_audit_logs?select=id,actor_id,action,target_type,target_id,details,created_at,profiles!admin_audit_logs_actor_id_fkey(id,full_name,category,avatar_url)&order=created_at.desc&limit=50`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey)
    }
  );

  const text = await response.text();

  if (!response.ok) {
    if (isMissingAuditTableError(text)) {
      return NextResponse.json({ logs: [], enabled: false });
    }

    return NextResponse.json(
      { error: "No se pudo cargar la auditoría admin." },
      { status: 400 }
    );
  }

  const payload = text.trim() ? JSON.parse(text) : [];
  return NextResponse.json({ logs: payload, enabled: true });
}
