import { NextRequest, NextResponse } from "next/server";
import { canBookSlot, isSlotWithinClubHours } from "@/lib/time-rules";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import {
  createBooking,
  fetchSlot,
  findAlternativeOpenSlot,
  getUser,
  hasConfirmedBooking
} from "@/lib/supabase";

function normalizeBookingError(error: unknown) {
  if (
    error instanceof Error &&
    (error.message.includes("bookings_time_slot_id_key") ||
      error.message.includes("23505"))
  ) {
    return "El turno ya fue reservado por otro usuario.";
  }

  return error instanceof Error ? error.message : "Error al reservar";
}

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

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `booking-create:${ip}:${user.id}`,
    max: 12,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos de reserva. Espera unos segundos antes de volver a intentar."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
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

  if (!isSlotWithinClubHours(slot.slot_date, slot.start_time, slot.end_time)) {
    return NextResponse.json(
      {
        error:
          "Ese turno está fuera del horario permitido. Los sábados se reserva de 09:00 a 21:00, con último turno a las 20:00."
      },
      { status: 400 }
    );
  }

  let selectedSlot = slot;
  let fallbackCourtName: string | null = null;
  let alreadyBooked = await hasConfirmedBooking(selectedSlot.id, token);

  if (alreadyBooked) {
    const alternativeSlot = await findAlternativeOpenSlot(selectedSlot, token);

    if (alternativeSlot) {
      selectedSlot = alternativeSlot;
      fallbackCourtName = alternativeSlot.courts?.name ?? null;
      alreadyBooked = await hasConfirmedBooking(selectedSlot.id, token);
    }
  }

  if (alreadyBooked) {
    return NextResponse.json(
      { error: "Ese horario ya no tiene canchas disponibles." },
      { status: 409 }
    );
  }

  try {
    await createBooking(selectedSlot.id, selectedSlot.court_id, user.id, token);

    return NextResponse.json({
      ok: true,
      message: fallbackCourtName
        ? `La cancha elegida estaba ocupada. Te reservamos automáticamente en ${fallbackCourtName}.`
        : undefined
    });
  } catch (error) {
    const message = normalizeBookingError(error);

    return NextResponse.json(
      { error: message },
      { status: message.includes("reservado") ? 409 : 400 }
    );
  }
}
