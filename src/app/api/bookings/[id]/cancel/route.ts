import { NextRequest, NextResponse } from "next/server";
import { canCancelBooking } from "@/lib/time-rules";
import { getUser } from "@/lib/supabase";

function headers(token: string, anonKey: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Falta configuración de Supabase." },
      { status: 503 }
    );
  }

  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const bookingResponse = await fetch(
    `${supabaseUrl}/rest/v1/bookings?select=id,user_id,status,time_slots(slot_date,start_time,end_time)&id=eq.${params.id}&limit=1`,
    {
      method: "GET",
      headers: headers(token, anonKey)
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

  if (booking.user_id !== user.id) {
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

  if (!canCancelBooking(slotDate, startTime)) {
    return NextResponse.json(
      {
        error:
          "Solo puedes cancelar una reserva con más de 1 hora de anticipación."
      },
      { status: 400 }
    );
  }

  const cancelResponse = await fetch(
    `${supabaseUrl}/rest/v1/bookings?id=eq.${params.id}&status=eq.confirmed`,
    {
      method: "PATCH",
      headers: {
        ...headers(token, anonKey),
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ status: "cancelled" })
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
