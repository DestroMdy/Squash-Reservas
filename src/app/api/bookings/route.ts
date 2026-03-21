import { NextRequest, NextResponse } from "next/server";
import {
  adminHeaders,
  requireAdminRequest,
  requireAuthenticatedRequest
} from "@/lib/server-auth";
import { canBookSlot, isSlotWithinClubHours } from "@/lib/time-rules";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import {
  createBooking,
  fetchSlot,
  findAlternativeOpenSlot,
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

function publicHeaders(anonKey: string, accessToken?: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`,
    "Content-Type": "application/json"
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const scope = url.searchParams.get("scope");

  if (date) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: "Falta configuración de backend." },
        { status: 503 }
      );
    }

    const maybeAuth = await requireAuthenticatedRequest(request);
    const accessToken = "error" in maybeAuth ? undefined : maybeAuth.accessToken;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/time_slots?select=id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active),bookings(id,status,user_id,profiles(id,full_name,category,avatar_url))&slot_date=eq.${date}&order=start_time.asc`,
      {
        method: "GET",
        headers: publicHeaders(anonKey, accessToken),
        cache: "no-store"
      }
    );

    const rows = (await response.json()) as Array<Record<string, unknown>>;

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo cargar la agenda." },
        { status: 400 }
      );
    }

    return NextResponse.json({ slots: rows });
  }

  if (scope === "my") {
    const auth = await requireAuthenticatedRequest(request, {
      requireServiceRole: true
    });

    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const response = await fetch(
      `${auth.supabaseUrl}/rest/v1/bookings?select=id,user_id,court_id,time_slot_id,status,notes,created_at,time_slots(id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active)),courts(id,name,is_active)&user_id=eq.${auth.user.id}&order=created_at.desc`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
      }
    );

    const rows = (await response.json()) as Array<Record<string, unknown>>;

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudieron cargar tus reservas." },
        { status: 400 }
      );
    }

    return NextResponse.json({ bookings: rows });
  }

  if (scope === "all" || scope === "stats" || scope === "latest") {
    const auth = await requireAdminRequest(request);

    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (scope === "all") {
      const response = await fetch(
        `${auth.supabaseUrl}/rest/v1/bookings?select=id,user_id,court_id,time_slot_id,status,notes,created_at,profiles(id,full_name,category,avatar_url),time_slots(id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active)),courts(id,name,is_active)&order=created_at.desc`,
        {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        }
      );

      const rows = (await response.json()) as Array<Record<string, unknown>>;

      if (!response.ok) {
        return NextResponse.json(
          { error: "No se pudieron cargar las reservas." },
          { status: 400 }
        );
      }

      return NextResponse.json({ bookings: rows });
    }

    if (scope === "stats") {
      const [allResponse, confirmedResponse, cancelledResponse] = await Promise.all([
        fetch(`${auth.supabaseUrl}/rest/v1/bookings?select=id`, {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        }),
        fetch(`${auth.supabaseUrl}/rest/v1/bookings?select=id&status=eq.confirmed`, {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        }),
        fetch(`${auth.supabaseUrl}/rest/v1/bookings?select=id&status=eq.cancelled`, {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        })
      ]);

      const [all, confirmed, cancelled] = await Promise.all([
        allResponse.json() as Promise<Array<Record<string, unknown>>>,
        confirmedResponse.json() as Promise<Array<Record<string, unknown>>>,
        cancelledResponse.json() as Promise<Array<Record<string, unknown>>>
      ]);

      if (!allResponse.ok || !confirmedResponse.ok || !cancelledResponse.ok) {
        return NextResponse.json(
          { error: "No se pudieron cargar las métricas de reservas." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        total: all.length,
        confirmed: confirmed.length,
        cancelled: cancelled.length
      });
    }

    const response = await fetch(
      `${auth.supabaseUrl}/rest/v1/bookings?select=id,created_at,status,time_slots(slot_date,start_time,end_time),courts(name)&status=eq.confirmed&order=created_at.desc&limit=1`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
      }
    );

    const rows = (await response.json()) as Array<Record<string, unknown>>;

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo cargar la última reserva confirmada." },
        { status: 400 }
      );
    }

    return NextResponse.json({ booking: rows[0] ?? null });
  }

  return NextResponse.json(
    { error: "Consulta de reservas no soportada." },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { slotId?: string };

  if (!body.slotId) {
    return NextResponse.json({ error: "slotId es requerido" }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `booking-create:${ip}:${auth.user.id}`,
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

  const slot = await fetchSlot(body.slotId, auth.accessToken);
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
  let alreadyBooked = await hasConfirmedBooking(
    selectedSlot.id,
    auth.accessToken
  );

  if (alreadyBooked) {
    const alternativeSlot = await findAlternativeOpenSlot(
      selectedSlot,
      auth.accessToken
    );

    if (alternativeSlot) {
      selectedSlot = alternativeSlot;
      fallbackCourtName = alternativeSlot.courts?.name ?? null;
      alreadyBooked = await hasConfirmedBooking(
        selectedSlot.id,
        auth.accessToken
      );
    }
  }

  if (alreadyBooked) {
    return NextResponse.json(
      { error: "Ese horario ya no tiene canchas disponibles." },
      { status: 409 }
    );
  }

  try {
    await createBooking(
      selectedSlot.id,
      selectedSlot.court_id,
      auth.user.id,
      auth.accessToken
    );

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
