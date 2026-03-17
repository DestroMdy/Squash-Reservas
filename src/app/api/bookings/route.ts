import { NextRequest, NextResponse } from "next/server";
import { canBookSlot } from "@/lib/time-rules";
import { createBooking, fetchSlot, getUser, hasConfirmedBooking } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = (await request.json()) as { slotId?: string };

  if (!body.slotId) {
    return NextResponse.json({ error: "slotId es requerido" }, { status: 400 });
  }

  const user = await getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const slot = await fetchSlot(body.slotId, token);
  if (!slot) {
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  }

  if (!canBookSlot(slot.slot_date)) {
    return NextResponse.json(
      { error: "Disponible desde las 22:00 del día anterior" },
      { status: 400 }
    );
  }

  const alreadyBooked = await hasConfirmedBooking(slot.id, token);

  if (alreadyBooked) {
    return NextResponse.json(
      { error: "El turno ya está reservado" },
      { status: 409 }
    );
  }

  try {
    await createBooking(slot.id, slot.court_id, user.id, token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al reservar" },
      { status: 400 }
    );
  }
}