import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getStoredBookingAvailabilitySettings,
  isBookingAvailabilityStoreConfigured,
  setStoredBookingAvailabilitySettings
} from "@/lib/booking-availability-store";
import { requireAdminRequest } from "@/lib/server-auth";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: responseHeaders() }
    );
  }

  const settings = await getStoredBookingAvailabilitySettings();

  return NextResponse.json(
    {
      settings,
      unavailable: !isBookingAvailabilityStoreConfigured()
    },
    { headers: responseHeaders() }
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: responseHeaders() }
    );
  }

  if (!isBookingAvailabilityStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuración global de reservas no está disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as {
    reservations_enabled?: boolean;
    note?: string | null;
  };

  if (typeof body.reservations_enabled !== "boolean") {
    return NextResponse.json(
      { error: "Debes indicar si las reservas están habilitadas o no." },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const settings = await setStoredBookingAvailabilitySettings({
      reservations_enabled: body.reservations_enabled,
      note: body.note ?? null,
      updated_by: auth.user.id
    });

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "booking.availability.updated",
      targetType: "booking_settings",
      targetId: "global",
      details: {
        reservations_enabled: settings.reservations_enabled,
        note: settings.note
      }
    }).catch(() => null);

    return NextResponse.json(
      { ok: true, settings, unavailable: false },
      { headers: responseHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el estado global de reservas."
      },
      { status: 400, headers: responseHeaders() }
    );
  }
}
