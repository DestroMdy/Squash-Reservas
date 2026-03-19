import { NextRequest, NextResponse } from "next/server";
import { fetchProfileRole, getUser } from "@/lib/supabase";
import { logAdminAudit } from "@/lib/admin-audit";

type BookingPayload = {
  user_id?: string;
  status?: "confirmed" | "cancelled" | "completed";
  notes?: string | null;
};

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

  return { supabaseUrl, serviceRoleKey, actorId: user.id };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as BookingPayload;

  if (!body.user_id || !body.status) {
    return NextResponse.json(
      { error: "Faltan datos para actualizar la reserva." },
      { status: 400 }
    );
  }

  const currentResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/bookings?select=id,user_id,status,notes&id=eq.${params.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey)
    }
  );

  const currentText = await currentResponse.text();
  const currentRows = currentText.trim() ? JSON.parse(currentText) : [];
  const currentBooking = currentRows[0];

  if (!currentResponse.ok || !currentBooking) {
    return NextResponse.json(
      { error: "No se encontró la reserva." },
      { status: 404 }
    );
  }

  const updateResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/bookings?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        user_id: body.user_id,
        status: body.status,
        notes: body.notes ?? null
      })
    }
  );

  const updateText = await updateResponse.text();
  const updatedRows = updateText.trim() ? JSON.parse(updateText) : [];
  const updatedBooking = updatedRows[0];

  if (!updateResponse.ok || !updatedBooking) {
    return NextResponse.json(
      { error: "No se pudo actualizar la reserva." },
      { status: 400 }
    );
  }

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.actorId,
    action: "booking.updated",
    targetType: "booking",
    targetId: params.id,
    details: {
      before: {
        user_id: currentBooking.user_id,
        status: currentBooking.status,
        notes: currentBooking.notes
      },
      after: {
        user_id: updatedBooking.user_id,
        status: updatedBooking.status,
        notes: updatedBooking.notes
      }
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true, booking: updatedBooking });
}
