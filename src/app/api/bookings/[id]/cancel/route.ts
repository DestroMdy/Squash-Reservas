import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import { canCancelBooking } from "@/lib/time-rules";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";

async function fetchRole(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as Array<{ role?: string | null }>;
  return rows[0]?.role ?? null;
}

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

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `booking-cancel:${ip}:${auth.user.id}`,
    max: 12,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos de cancelación. Espera unos segundos antes de volver a intentar."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const callerRole = await fetchRole(
    auth.supabaseUrl,
    auth.serviceRoleKey as string,
    auth.user.id
  );
  const isAdmin = callerRole === "admin";

  const bookingResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/bookings?select=id,user_id,status,time_slots(slot_date,start_time,end_time)&id=eq.${params.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey as string),
      cache: "no-store"
    }
  );

  const bookingRows = (await bookingResponse.json()) as Array<{
    id: string;
    user_id: string;
    status: string;
    time_slots?: {
      slot_date?: string;
      start_time?: string;
      end_time?: string;
    } | null;
  }>;

  const booking = bookingRows[0];

  if (!bookingResponse.ok || !booking) {
    return NextResponse.json(
      { error: "Reserva no encontrada." },
      { status: 404 }
    );
  }

  if (booking.user_id !== auth.user.id && !isAdmin) {
    return NextResponse.json(
      { error: "No puedes cancelar una reserva de otro usuario." },
      { status: 403 }
    );
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Solo se pueden cancelar reservas confirmadas." },
      { status: 400 }
    );
  }

  const slotDate = booking.time_slots?.slot_date;
  const startTime = booking.time_slots?.start_time;

  if (!slotDate || !startTime) {
    return NextResponse.json(
      { error: "No se pudo validar el horario de la reserva." },
      { status: 400 }
    );
  }

  if (!isAdmin && !canCancelBooking(slotDate, startTime)) {
    return NextResponse.json(
      {
        error:
          "Solo puedes cancelar una reserva con más de 1 hora de anticipación."
      },
      { status: 400 }
    );
  }

  const cancelResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/bookings?id=eq.${params.id}&status=eq.confirmed`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey as string),
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ status: "cancelled" }),
      cache: "no-store"
    }
  );

  if (!cancelResponse.ok) {
    return NextResponse.json(
      { error: "No se pudo cancelar la reserva." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
