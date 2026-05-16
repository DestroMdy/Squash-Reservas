import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

type BookingPayload = {
  user_id?: string;
  status?: "confirmed" | "cancelled" | "completed";
  notes?: string | null;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

  const body = (await request.json()) as BookingPayload;

  if (!body.user_id || !body.status) {
    return NextResponse.json(
      { error: "Faltan datos para actualizar la reserva." },
      { status: 400 }
    );
  }

  const currentResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/bookings?select=id,user_id,status,notes&id=eq.${id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
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
    `${auth.supabaseUrl}/rest/v1/bookings?id=eq.${id}`,
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
      }),
      cache: "no-store"
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
    actorId: auth.user.id,
    action: "booking.updated",
    targetType: "booking",
    targetId: id,
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
