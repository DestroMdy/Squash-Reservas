import { NextRequest, NextResponse } from "next/server";
import { getAllWaitlists, isBookingWaitlistStoreConfigured } from "@/lib/booking-waitlist-store";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";
import { buildWhatsAppLink } from "@/lib/whatsapp-utils";
import { AdminWaitlistSlot, BookingWaitlistEntry, Profile } from "@/types/db";

type TimeSlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  court_id: string;
};

type CourtRow = {
  id: string;
  name: string | null;
};

type BookingRow = {
  id: string;
  time_slot_id: string;
  user_id: string;
};

type ProfileRow = Pick<
  Profile,
  "id" | "full_name" | "phone" | "category" | "avatar_url"
>;

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

function buildInFilter(values: string[]) {
  const escapedValues = values.map((value) => `"${value.replace(/"/g, '\\"')}"`);
  return `in.(${escapedValues.join(",")})`;
}

async function fetchRestRows<T>(
  url: string,
  serviceRoleKey: string
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: adminHeaders(serviceRoleKey),
    cache: "no-store"
  });

  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "No se pudo cargar la lista de espera admin.";
    throw new Error(message);
  }

  return (payload || []) as T;
}

function formatSlotLabel(slotDate: string, startTime: string, endTime: string) {
  const dateLabel = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${slotDate}T12:00:00`));

  return `${dateLabel}, de ${startTime.slice(0, 5)} a ${endTime.slice(0, 5)}`;
}

function buildWaitlistMessage(params: {
  fullName: string | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  courtName: string | null;
  appOrigin: string;
}) {
  const greeting = params.fullName?.trim() ? `Hola ${params.fullName.trim()}, ` : "Hola, ";
  const slotLabel = formatSlotLabel(params.slotDate, params.startTime, params.endTime);
  const courtLabel = params.courtName?.trim() || "la cancha";

  return `${greeting}te escribo desde La Martineta por el turno de ${courtLabel} para ${slotLabel}. Si todavía te interesa, revisá la agenda en ${params.appOrigin}/schedule para ver si sigue disponible.`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: responseHeaders() }
    );
  }

  if (!isBookingWaitlistStoreConfigured()) {
    return NextResponse.json(
      { slots: [], unavailable: true },
      { headers: responseHeaders() }
    );
  }

  const waitlistMap = await getAllWaitlists();
  const slotIds = Object.keys(waitlistMap).filter(
    (slotId) => Array.isArray(waitlistMap[slotId]) && waitlistMap[slotId].length > 0
  );

  if (!slotIds.length) {
    return NextResponse.json(
      { slots: [], unavailable: false },
      { headers: responseHeaders() }
    );
  }

  try {
    const slotFilter = encodeURIComponent(buildInFilter(slotIds));

    const timeSlots = await fetchRestRows<TimeSlotRow[]>(
      `${auth.supabaseUrl}/rest/v1/time_slots?select=id,slot_date,start_time,end_time,court_id&id=${slotFilter}`,
      auth.serviceRoleKey
    );

    const courtIds = Array.from(
      new Set(timeSlots.map((slot) => slot.court_id).filter(Boolean))
    );

    const confirmedBookings = await fetchRestRows<BookingRow[]>(
      `${auth.supabaseUrl}/rest/v1/bookings?select=id,time_slot_id,user_id&status=eq.confirmed&time_slot_id=${slotFilter}`,
      auth.serviceRoleKey
    );

    const profileIds = Array.from(
      new Set([
        ...confirmedBookings.map((booking) => booking.user_id),
        ...Object.values(waitlistMap)
          .flat()
          .map((entry: BookingWaitlistEntry) => entry.user_id)
      ].filter(Boolean))
    );

    const [courts, profiles] = await Promise.all([
      courtIds.length
        ? fetchRestRows<CourtRow[]>(
            `${auth.supabaseUrl}/rest/v1/courts?select=id,name&id=${encodeURIComponent(buildInFilter(courtIds))}`,
            auth.serviceRoleKey
          )
        : Promise.resolve([] as CourtRow[]),
      profileIds.length
        ? fetchRestRows<ProfileRow[]>(
            `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,phone,category,avatar_url&id=${encodeURIComponent(buildInFilter(profileIds))}`,
            auth.serviceRoleKey
          )
        : Promise.resolve([] as ProfileRow[])
    ]);

    const slotMap = new Map(timeSlots.map((slot) => [slot.id, slot]));
    const courtMap = new Map(courts.map((court) => [court.id, court]));
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const confirmedBookingMap = new Map(
      confirmedBookings.map((booking) => [booking.time_slot_id, booking])
    );
    const appOrigin = new URL(request.url).origin;

    const slots = slotIds
      .map<AdminWaitlistSlot | null>((slotId) => {
        const slot = slotMap.get(slotId);
        if (!slot) {
          return null;
        }

        const courtName = courtMap.get(slot.court_id)?.name || null;
        const currentBooking = confirmedBookingMap.get(slotId) || null;
        const currentBookingProfile = currentBooking
          ? profileMap.get(currentBooking.user_id) || null
          : null;

        const entries = (waitlistMap[slotId] || [])
          .slice()
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
          .map((entry) => {
            const profile = profileMap.get(entry.user_id) || null;

            return {
              user_id: entry.user_id,
              full_name: profile?.full_name || null,
              phone: profile?.phone || null,
              category: profile?.category || null,
              avatar_url: profile?.avatar_url || null,
              created_at: entry.created_at,
              whatsapp_url: buildWhatsAppLink(
                profile?.phone,
                buildWaitlistMessage({
                  fullName: profile?.full_name || null,
                  slotDate: slot.slot_date,
                  startTime: slot.start_time,
                  endTime: slot.end_time,
                  courtName,
                  appOrigin
                })
              )
            };
          });

        return {
          time_slot_id: slot.id,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          court_id: slot.court_id,
          court_name: courtName,
          current_booking: currentBooking
            ? {
                booking_id: currentBooking.id,
                user_id: currentBooking.user_id,
                full_name: currentBookingProfile?.full_name || null,
                category: currentBookingProfile?.category || null,
                avatar_url: currentBookingProfile?.avatar_url || null
              }
            : null,
          entries
        };
      })
      .filter((slot): slot is AdminWaitlistSlot => Boolean(slot))
      .sort((a, b) => {
        const dateComparison = a.slot_date.localeCompare(b.slot_date);
        if (dateComparison !== 0) {
          return dateComparison;
        }

        const startComparison = a.start_time.localeCompare(b.start_time);
        if (startComparison !== 0) {
          return startComparison;
        }

        return (a.court_name || "").localeCompare(b.court_name || "");
      });

    return NextResponse.json(
      { slots, unavailable: false },
      { headers: responseHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la lista de espera admin."
      },
      { status: 500, headers: responseHeaders() }
    );
  }
}
