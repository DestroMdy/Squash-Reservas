import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  clearStoredScheduleOverride,
  getStoredScheduleOverride,
  getStoredScheduleOverrides,
  isScheduleOverrideStoreConfigured,
  setStoredScheduleOverride
} from "@/lib/schedule-overrides-store";
import { requireAdminRequest } from "@/lib/server-auth";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

function isDateKey(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: responseHeaders() }
    );
  }

  if (!isScheduleOverrideStoreConfigured()) {
    return NextResponse.json(
      { overrides: [], unavailable: true },
      { headers: responseHeaders() }
    );
  }

  const slotDate = new URL(request.url).searchParams.get("slot_date");

  if (isDateKey(slotDate)) {
    const override = await getStoredScheduleOverride(slotDate as string);
    return NextResponse.json(
      { override, unavailable: false },
      { headers: responseHeaders() }
    );
  }

  const overrides = await getStoredScheduleOverrides();
  return NextResponse.json(
    { overrides, unavailable: false },
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

  if (!isScheduleOverrideStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de agenda no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as {
    slot_date?: string;
    mode?: "closed" | "custom_hours";
    opens_at?: string | null;
    closes_at?: string | null;
    note?: string | null;
  };

  if (!isDateKey(body.slot_date)) {
    return NextResponse.json(
      { error: "Debes indicar una fecha valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  if (body.mode !== "closed" && body.mode !== "custom_hours") {
    return NextResponse.json(
      { error: "Debes elegir un tipo de excepcion valido." },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const override = await setStoredScheduleOverride({
      slot_date: body.slot_date as string,
      mode: body.mode as "closed" | "custom_hours",
      opens_at: body.opens_at ?? null,
      closes_at: body.closes_at ?? null,
      note: body.note ?? null,
      updated_by: auth.user.id
    });

    const overrides = await getStoredScheduleOverrides();

    await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
      actorId: auth.user.id,
      action: "schedule.override.updated",
      targetType: "schedule_override",
      targetId: override.slot_date,
      details: {
        mode: override.mode,
        opens_at: override.opens_at,
        closes_at: override.closes_at,
        note: override.note
      }
    }).catch(() => null);

    return NextResponse.json(
      { ok: true, override, overrides, unavailable: false },
      { headers: responseHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la excepcion de agenda."
      },
      { status: 400, headers: responseHeaders() }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: responseHeaders() }
    );
  }

  if (!isScheduleOverrideStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de agenda no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const slotDate =
    new URL(request.url).searchParams.get("slot_date") ||
    ((await request
      .json()
      .catch(() => ({}))) as { slot_date?: string }).slot_date;

  if (!isDateKey(slotDate)) {
    return NextResponse.json(
      { error: "Debes indicar una fecha valida." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const overrides = await clearStoredScheduleOverride(slotDate as string);

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "schedule.override.cleared",
    targetType: "schedule_override",
    targetId: slotDate as string,
    details: null
  }).catch(() => null);

  return NextResponse.json(
    { ok: true, overrides, unavailable: false },
    { headers: responseHeaders() }
  );
}
