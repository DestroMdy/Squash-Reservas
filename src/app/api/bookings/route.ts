import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import { BEGINNER_CATEGORY_LABEL } from "@/lib/category-labels";
import {
  adminHeaders,
  requireAdminRequest,
  requireAuthenticatedRequest
} from "@/lib/server-auth";
import {
  getReservationsPausedMessage
} from "@/lib/booking-availability";
import { getStoredBookingAvailabilitySettings } from "@/lib/booking-availability-store";
import { getBeginnerRulesStatus } from "@/lib/beginner-rules";
import { getStoredScheduleOverride } from "@/lib/schedule-overrides-store";
import { ensureBookingSlotHorizon } from "@/lib/time-slot-generation";
import { canBookSlot, isSlotWithinClubHours } from "@/lib/time-rules";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import {
  isBookingWaitlistStoreConfigured,
  removeUserFromWaitlist
} from "@/lib/booking-waitlist-store";
import { sendWebPushToUserIds } from "@/lib/web-push";

function normalizeBookingError(error: unknown) {
  if (error && typeof error === "object") {
    const errorRecord = error as {
      code?: string | null;
      message?: string | null;
      error?: string | null;
      details?: string | null;
    };
    const code = errorRecord.code || "";
    const message =
      errorRecord.message ||
      errorRecord.error ||
      errorRecord.details ||
      "Error al reservar";

    if (
      code === "23505" ||
      message.includes("bookings_time_slot_id_key") ||
      message.includes("23505")
    ) {
      return "El turno ya fue reservado por otro usuario.";
    }

    return message;
  }

  if (
    error instanceof Error &&
    (error.message.includes("bookings_time_slot_id_key") ||
      error.message.includes("23505"))
  ) {
    return "El turno ya fue reservado por otro usuario.";
  }

  return error instanceof Error ? error.message : "Error al reservar";
}

function serializeBookingError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  if (error && typeof error === "object") {
    return error as Record<string, unknown>;
  }

  return {
    message: String(error)
  };
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

type BookingSlotRecord = {
  id: string;
  court_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
  price?: number | null;
  created_at?: string | null;
  courts?:
    | {
        id?: string | null;
        name?: string | null;
        is_active?: boolean | null;
      }
    | null;
  bookings?:
    | Array<{
        id?: string | null;
        status?: string | null;
      }>
    | {
        id?: string | null;
        status?: string | null;
      }
    | null;
};

type PersistedBookingRecord = {
  id: string;
  user_id?: string | null;
  court_id?: string | null;
  time_slot_id?: string | null;
  status?: string | null;
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

async function getScheduleRestrictionMessage(slotDate: string) {
  const override = await getStoredScheduleOverride(slotDate).catch(() => null);

  if (override?.mode === "closed") {
    return override.note
      ? `La agenda de ese día está cerrada por administración. ${override.note}`
      : "La agenda de ese día está cerrada por administración.";
  }

  if (override?.mode === "custom_hours") {
    const hoursText =
      override.opens_at && override.closes_at
        ? `${formatShortTime(override.opens_at)} a ${formatShortTime(
            override.closes_at
          )}`
        : "el horario especial configurado";

    return override.note
      ? `Ese turno está fuera del horario especial de ${hoursText}. ${override.note}`
      : `Ese turno está fuera del horario especial de ${hoursText}.`;
  }

  return "Ese turno está fuera del horario permitido. Los sábados se reserva de 09:00 a 21:00, con último turno a las 20:00.";
}

function normalizeSlotBookings(slotBookings: AgendaDaySlotRecord["bookings"]) {
  if (!slotBookings) {
    return [];
  }

  return Array.isArray(slotBookings) ? slotBookings : [slotBookings];
}

function normalizeBookingSlotStatuses(slotBookings: BookingSlotRecord["bookings"]) {
  if (!slotBookings) {
    return [];
  }

  return Array.isArray(slotBookings) ? slotBookings : [slotBookings];
}

async function parseRestPayload<T>(response: Response, fallback: T) {
  if (response.status === 204) {
    return fallback;
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return fallback;
  }

  return JSON.parse(raw) as T;
}

async function readRestErrorMessage(response: Response) {
  const raw = await response.text();

  if (!raw.trim()) {
    return "Error al reservar";
  }

  try {
    return normalizeBookingError(JSON.parse(raw));
  } catch {
    return normalizeBookingError(raw);
  }
}

async function fetchSlotByIdAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
  slotId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/time_slots?select=id,court_id,slot_date,start_time,end_time,status,price,created_at&id=eq.${slotId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(await readRestErrorMessage(response));
  }

  const rows = await parseRestPayload<BookingSlotRecord[]>(response, []);
  return rows[0] || null;
}

async function hasConfirmedBookingAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
  timeSlotId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/bookings?select=id&time_slot_id=eq.${timeSlotId}&status=eq.confirmed&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(await readRestErrorMessage(response));
  }

  const rows = await parseRestPayload<Array<{ id?: string | null }>>(
    response,
    []
  );
  return rows.length > 0;
}

async function findAlternativeOpenSlotAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
  slot: {
    id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
  }
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/time_slots?select=id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active),bookings(id,status)&slot_date=eq.${slot.slot_date}&start_time=eq.${slot.start_time}&end_time=eq.${slot.end_time}&id=neq.${slot.id}&order=created_at.asc`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(await readRestErrorMessage(response));
  }

  const rows = await parseRestPayload<BookingSlotRecord[]>(response, []);

  return (
    rows.find((candidate) => {
      const bookings = normalizeBookingSlotStatuses(candidate.bookings);
      return !bookings.some((booking) => booking.status === "confirmed");
    }) || null
  );
}

async function fetchConfirmedBookingForUserAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
  timeSlotId: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/bookings?select=id,user_id,court_id,time_slot_id,status&time_slot_id=eq.${timeSlotId}&user_id=eq.${userId}&status=eq.confirmed&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(await readRestErrorMessage(response));
  }

  const rows = await parseRestPayload<PersistedBookingRecord[]>(response, []);
  return rows[0] || null;
}

async function persistConfirmedBookingAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
  booking: {
    timeSlotId: string;
    courtId: string;
    userId: string;
  }
) {
  const baseHeaders = adminHeaders(serviceRoleKey);
  const cancelledResponse = await fetch(
    `${supabaseUrl}/rest/v1/bookings?select=id&time_slot_id=eq.${booking.timeSlotId}&status=eq.cancelled&order=created_at.asc&limit=1`,
    {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store"
    }
  );

  if (!cancelledResponse.ok) {
    throw new Error(await readRestErrorMessage(cancelledResponse));
  }

  const cancelledRows = await parseRestPayload<Array<{ id?: string | null }>>(
    cancelledResponse,
    []
  );

  if (cancelledRows[0]?.id) {
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${cancelledRows[0].id}&select=id,user_id,court_id,time_slot_id,status`,
      {
        method: "PATCH",
        headers: {
          ...baseHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          user_id: booking.userId,
          court_id: booking.courtId,
          time_slot_id: booking.timeSlotId,
          status: "confirmed"
        }),
        cache: "no-store"
      }
    );

    if (!updateResponse.ok) {
      throw new Error(await readRestErrorMessage(updateResponse));
    }

    const updatedRows = await parseRestPayload<PersistedBookingRecord[]>(
      updateResponse,
      []
    );

    if (!updatedRows.length) {
      throw new Error("No se pudo confirmar la reserva. Intenta nuevamente.");
    }
  } else {
    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/bookings?select=id,user_id,court_id,time_slot_id,status`,
      {
        method: "POST",
        headers: {
          ...baseHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          user_id: booking.userId,
          court_id: booking.courtId,
          time_slot_id: booking.timeSlotId,
          status: "confirmed"
        }),
        cache: "no-store"
      }
    );

    if (!insertResponse.ok) {
      throw new Error(await readRestErrorMessage(insertResponse));
    }

    const createdRows = await parseRestPayload<PersistedBookingRecord[]>(
      insertResponse,
      []
    );

    if (!createdRows.length) {
      throw new Error("No se pudo confirmar la reserva. Intenta nuevamente.");
    }
  }

  const persistedBooking = await fetchConfirmedBookingForUserAdmin(
    supabaseUrl,
    serviceRoleKey,
    booking.timeSlotId,
    booking.userId
  );

  if (!persistedBooking?.id) {
    throw new Error("No se pudo confirmar la reserva. Intenta nuevamente.");
  }

  return persistedBooking;
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

async function fetchAdminUserIds(
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

  if (!response.ok) {
    return [] as string[];
  }

  const rows = (await response.json()) as Array<{ id?: string | null }>;
  return rows
    .map((row) => row.id || "")
    .filter((value): value is string => Boolean(value));
}

async function fetchUserRoleAdmin(
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

  const rows = await parseRestPayload<Array<{ role?: string | null }>>(response, []);
  return rows[0]?.role || null;
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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: "Falta configuración de backend." },
        { status: 503 }
      );
    }

    if (serviceRoleKey) {
      await ensureBookingSlotHorizon(supabaseUrl, serviceRoleKey, date).catch(
        () => null
      );
    }

    const maybeAuth = await requireAuthenticatedRequest(request);
    const accessToken = "error" in maybeAuth ? undefined : maybeAuth.accessToken;
    const scheduleOverride = await getStoredScheduleOverride(date).catch(
      () => null
    );
    const bookingAvailability = await getStoredBookingAvailabilitySettings().catch(
      () => null
    );

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

    const visibleSlots = rows.filter((slot) => {
      const slotDate = typeof slot.slot_date === "string" ? slot.slot_date : date;
      const startTime =
        typeof slot.start_time === "string" ? slot.start_time : "00:00:00";
      const endTime =
        typeof slot.end_time === "string" ? slot.end_time : "00:00:00";

      return isSlotWithinClubHours(
        slotDate,
        startTime,
        endTime,
        scheduleOverride
      );
    });

    return NextResponse.json({
      slots: visibleSlots,
      schedule_override: scheduleOverride,
      booking_availability: bookingAvailability
    });
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
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Squash Reservas <onboarding@resend.dev>";
  const serviceRoleKey = auth.serviceRoleKey;

  const body = (await request.json()) as { slotId?: string };
  const bookingAvailability = await getStoredBookingAvailabilitySettings().catch(
    () => null
  );
  const userRole = await fetchUserRoleAdmin(
    auth.supabaseUrl,
    serviceRoleKey,
    auth.user.id
  );
  const bypassOpeningWindow = userRole === "admin";

  if (!body.slotId) {
    return NextResponse.json({ error: "slotId es requerido" }, { status: 400 });
  }

  if (bookingAvailability?.reservations_enabled === false) {
    return NextResponse.json(
      { error: getReservationsPausedMessage(bookingAvailability.note) },
      { status: 403 }
    );
  }

  const beginnerRulesStatus = await getBeginnerRulesStatus(
    auth.supabaseUrl,
    serviceRoleKey,
    auth.user.id
  );

  if (beginnerRulesStatus.required) {
    return NextResponse.json(
      {
        error:
          `Si tu categoría es ${BEGINNER_CATEGORY_LABEL}, primero debes leer y confirmar las reglas prácticas del squash.`
      },
      { status: 403 }
    );
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

  const slot = await fetchSlotByIdAdmin(
    auth.supabaseUrl,
    serviceRoleKey,
    body.slotId
  );
  if (!slot) {
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  }

  const scheduleOverride = await getStoredScheduleOverride(slot.slot_date).catch(
    () => null
  );

  if (!canBookSlot(slot.slot_date, { bypassOpeningWindow })) {
    return NextResponse.json(
      { error: "Disponible desde las 22:00 del día anterior" },
      { status: 400 }
    );
  }

  if (
    !isSlotWithinClubHours(
      slot.slot_date,
      slot.start_time,
      slot.end_time,
      scheduleOverride
    )
  ) {
    return NextResponse.json(
      { error: await getScheduleRestrictionMessage(slot.slot_date) },
      { status: 400 }
    );
  }

  let selectedSlot = slot;
  let fallbackCourtName: string | null = null;
  let alreadyBooked = await hasConfirmedBookingAdmin(
    auth.supabaseUrl,
    serviceRoleKey,
    selectedSlot.id
  );

  if (alreadyBooked) {
    const alternativeSlot = await findAlternativeOpenSlotAdmin(
      auth.supabaseUrl,
      serviceRoleKey,
      selectedSlot,
    );

    if (alternativeSlot) {
      selectedSlot = alternativeSlot;
      fallbackCourtName = alternativeSlot.courts?.name ?? null;
      alreadyBooked = await hasConfirmedBookingAdmin(
        auth.supabaseUrl,
        serviceRoleKey,
        selectedSlot.id
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
    await persistConfirmedBookingAdmin(auth.supabaseUrl, serviceRoleKey, {
      timeSlotId: selectedSlot.id,
      courtId: selectedSlot.court_id,
      userId: auth.user.id
    });

    if (isBookingWaitlistStoreConfigured()) {
      const slotsToCleanup = Array.from(
        new Set([body.slotId, selectedSlot.id].filter(Boolean))
      );

      await Promise.all(
        slotsToCleanup.map((slotId) => removeUserFromWaitlist(slotId, auth.user.id))
      ).catch(() => null);
    }

    const [adminUserIds, agenda] = await Promise.all([
      fetchAdminUserIds(auth.supabaseUrl, serviceRoleKey),
      fetchAgendaSummaryForDay(
        auth.supabaseUrl,
        serviceRoleKey,
        selectedSlot.slot_date
      )
    ]);

    const reservation =
      agenda.find(
        (entry) =>
          entry.timeSlotId === selectedSlot.id && entry.userId === auth.user.id
      ) || {
        timeSlotId: selectedSlot.id,
        userId: auth.user.id,
        courtName: fallbackCourtName || "Cancha",
        startTime: selectedSlot.start_time,
        endTime: selectedSlot.end_time,
        playerName: auth.user.email || "Jugador",
        category: null
      };

    await Promise.all([
      sendWebPushToUserIds([auth.user.id], {
        title: "Reserva confirmada",
        body: `${reservation.courtName} · ${formatShortTime(
          reservation.startTime
        )} - ${formatShortTime(reservation.endTime)} · ${formatDayLabel(
          selectedSlot.slot_date
        )}`,
        url: "/my-bookings",
        tag: `booking-user-${selectedSlot.id}`
      }).catch(() => null),
      sendWebPushToUserIds(adminUserIds, {
        title: "Nueva reserva",
        body: `${reservation.playerName} · ${reservation.courtName} · ${formatShortTime(
          reservation.startTime
        )}`,
        url: "/admin",
        tag: `booking-admin-${selectedSlot.id}`
      }).catch(() => null)
    ]);

    if (resendApiKey) {
      try {
        const adminEmails = await fetchAdminEmails(
          auth.supabaseUrl,
          serviceRoleKey
        );

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

    await logAdminAudit(auth.supabaseUrl, serviceRoleKey, {
      actorId: auth.user.id,
      action: "booking.create_failed",
      targetType: "booking",
      targetId: body.slotId,
      details: {
        requested_slot_id: body.slotId,
        selected_slot_id: selectedSlot.id,
        selected_court_id: selectedSlot.court_id,
        selected_court_name: selectedSlot.courts?.name ?? null,
        fallback_court_name: fallbackCourtName,
        slot_date: selectedSlot.slot_date,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        user_id: auth.user.id,
        user_email: auth.user.email || null,
        error: serializeBookingError(error),
        normalized_error: message
      }
    }).catch(() => null);

    return NextResponse.json(
      { error: message },
      { status: message.includes("reservado") ? 409 : 400 }
    );
  }
}
