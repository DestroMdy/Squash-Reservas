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
import {
  isBookingWaitlistStoreConfigured,
  removeUserFromWaitlist
} from "@/lib/booking-waitlist-store";

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

type AgendaDaySlotRecord = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  courts?: { name?: string | null } | null;
  bookings?:
    | Array<{
        status?: string | null;
        user_id?: string | null;
        profiles?: {
          full_name?: string | null;
          category?: string | null;
        } | null;
      }>
    | {
        status?: string | null;
        user_id?: string | null;
        profiles?: {
          full_name?: string | null;
          category?: string | null;
        } | null;
      }
    | null;
};

type AgendaSummaryEntry = {
  timeSlotId: string;
  userId: string;
  courtName: string;
  startTime: string;
  endTime: string;
  playerName: string;
  category: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDayLabel(date: string) {
  const formatted = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit"
  }).format(parseLocalDate(date));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatShortTime(value: string) {
  return value.slice(0, 5);
}

function normalizeSlotBookings(slotBookings: AgendaDaySlotRecord["bookings"]) {
  if (!slotBookings) {
    return [];
  }

  return Array.isArray(slotBookings) ? slotBookings : [slotBookings];
}

async function fetchAuthUserById(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "GET",
    headers: adminHeaders(serviceRoleKey),
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    user?: { email?: string | null };
    email?: string | null;
  };

  return payload.user?.email || payload.email || null;
}

async function fetchAdminEmails(
  supabaseUrl: string,
  serviceRoleKey: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id&role=eq.admin`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<{ id?: string | null }>;

  if (!response.ok) {
    return [];
  }

  const emails = await Promise.all(
    rows
      .map((row) => row.id)
      .filter((value): value is string => Boolean(value))
      .map((userId) => fetchAuthUserById(supabaseUrl, serviceRoleKey, userId))
  );

  return Array.from(
    new Set(emails.filter((email): email is string => Boolean(email)))
  );
}

async function fetchAgendaSummaryForDay(
  supabaseUrl: string,
  serviceRoleKey: string,
  slotDate: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/time_slots?select=id,slot_date,start_time,end_time,courts(name),bookings(status,user_id,profiles(full_name,category))&slot_date=eq.${slotDate}&order=start_time.asc`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const slots = (await response.json()) as AgendaDaySlotRecord[];

  if (!response.ok) {
    return [] as AgendaSummaryEntry[];
  }

  const entries = slots.flatMap((slot) =>
    normalizeSlotBookings(slot.bookings)
      .filter((booking) => booking.status === "confirmed" && booking.user_id)
      .map((booking) => ({
        timeSlotId: slot.id,
        userId: booking.user_id as string,
        courtName: slot.courts?.name?.trim() || "Cancha",
        startTime: slot.start_time,
        endTime: slot.end_time,
        playerName:
          booking.profiles?.full_name?.trim() || "Jugador sin nombre",
        category: booking.profiles?.category?.trim() || null
      }))
  );

  return entries.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.courtName.localeCompare(b.courtName) ||
      a.playerName.localeCompare(b.playerName)
  );
}

async function sendAdminBookingSummaryEmail({
  apiKey,
  from,
  recipients,
  appUrl,
  slotDate,
  fallbackCourtName,
  reservation,
  agenda
}: {
  apiKey: string;
  from: string;
  recipients: string[];
  appUrl: string;
  slotDate: string;
  fallbackCourtName: string | null;
  reservation: AgendaSummaryEntry;
  agenda: AgendaSummaryEntry[];
}) {
  if (!recipients.length) {
    return;
  }

  const dayLabel = formatDayLabel(slotDate);
  const primaryRecipient = recipients[0];
  const bccRecipients = recipients.slice(1);
  const agendaRows = agenda
    .map(
      (entry) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(
            `${formatShortTime(entry.startTime)} - ${formatShortTime(entry.endTime)}`
          )}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(entry.courtName)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(entry.playerName)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(
            entry.category || "-"
          )}</td>
        </tr>
      `
    )
    .join("");

  const reassignmentNote = fallbackCourtName
    ? `<p style="margin:0 0 16px;color:#9a3412"><strong>Reasignacion automatica:</strong> la reserva entro en ${escapeHtml(
        fallbackCourtName
      )} porque la cancha elegida ya estaba ocupada.</p>`
    : "";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [primaryRecipient],
      ...(bccRecipients.length ? { bcc: bccRecipients } : {}),
      subject: `Nueva reserva | ${dayLabel} | ${formatShortTime(
        reservation.startTime
      )} | ${reservation.courtName}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:12px">Nueva reserva registrada</h2>
          <p style="margin:0 0 16px">
            Se confirmo un nuevo turno para <strong>${escapeHtml(dayLabel)}</strong>.
          </p>
          <div style="margin:0 0 20px;padding:14px 16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
            <p style="margin:0 0 8px"><strong>Jugador:</strong> ${escapeHtml(
              reservation.playerName
            )}</p>
            <p style="margin:0 0 8px"><strong>Categoria:</strong> ${escapeHtml(
              reservation.category || "-"
            )}</p>
            <p style="margin:0 0 8px"><strong>Horario pedido:</strong> ${escapeHtml(
              `${formatShortTime(reservation.startTime)} - ${formatShortTime(
                reservation.endTime
              )}`
            )}</p>
            <p style="margin:0"><strong>Cancha asignada:</strong> ${escapeHtml(
              reservation.courtName
            )}</p>
          </div>
          ${reassignmentNote}
          <h3 style="margin:0 0 12px">Agenda confirmada del dia (${agenda.length})</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <thead>
              <tr style="background:#0f172a;color:#ffffff">
                <th style="padding:10px;text-align:left">Horario</th>
                <th style="padding:10px;text-align:left">Cancha</th>
                <th style="padding:10px;text-align:left">Jugador</th>
                <th style="padding:10px;text-align:left">Categoria</th>
              </tr>
            </thead>
            <tbody>
              ${agendaRows}
            </tbody>
          </table>
          <p style="margin-top:20px">
            Ver panel admin:
            <a href="${appUrl}/admin" style="color:#2563eb">${appUrl}/admin</a>
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "No se pudo enviar el resumen de reservas.");
  }
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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Squash Reservas <onboarding@resend.dev>";

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

    if (isBookingWaitlistStoreConfigured()) {
      const slotsToCleanup = Array.from(
        new Set([body.slotId, selectedSlot.id].filter(Boolean))
      );

      await Promise.all(
        slotsToCleanup.map((slotId) => removeUserFromWaitlist(slotId, auth.user.id))
      ).catch(() => null);
    }

    if (serviceRoleKey && resendApiKey) {
      try {
        const [adminEmails, agenda] = await Promise.all([
          fetchAdminEmails(auth.supabaseUrl, serviceRoleKey),
          fetchAgendaSummaryForDay(
            auth.supabaseUrl,
            serviceRoleKey,
            selectedSlot.slot_date
          )
        ]);

        const reservation =
          agenda.find(
            (entry) =>
              entry.timeSlotId === selectedSlot.id &&
              entry.userId === auth.user.id
          ) || {
            timeSlotId: selectedSlot.id,
            userId: auth.user.id,
            courtName: fallbackCourtName || "Cancha",
            startTime: selectedSlot.start_time,
            endTime: selectedSlot.end_time,
            playerName: auth.user.email || "Jugador",
            category: null
          };

        await sendAdminBookingSummaryEmail({
          apiKey: resendApiKey,
          from: fromEmail,
          recipients: adminEmails,
          appUrl: request.nextUrl.origin,
          slotDate: selectedSlot.slot_date,
          fallbackCourtName,
          reservation,
          agenda
        });
      } catch {
        // Keep reservation successful even if email delivery fails.
      }
    }

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
