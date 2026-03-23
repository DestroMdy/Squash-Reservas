import { NextRequest, NextResponse } from "next/server";
import {
  addUserToWaitlist,
  getWaitlistSnapshot,
  isBookingWaitlistStoreConfigured,
  removeUserFromWaitlist
} from "@/lib/booking-waitlist-store";
import { requireAuthenticatedRequest } from "@/lib/server-auth";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

function parseSlotIds(value: string | null) {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((slotId) => slotId.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isBookingWaitlistStoreConfigured()) {
    return NextResponse.json(
      { slots: {}, unavailable: true },
      { headers: responseHeaders() }
    );
  }

  const slotIds = parseSlotIds(
    new URL(request.url).searchParams.get("slot_ids")
  );

  if (!slotIds.length) {
    return NextResponse.json(
      { error: "Debes indicar al menos un turno." },
      { status: 400, headers: responseHeaders() }
    );
  }

  const slots = await getWaitlistSnapshot(slotIds, auth.user.id);
  return NextResponse.json({ slots, unavailable: false }, { headers: responseHeaders() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isBookingWaitlistStoreConfigured()) {
    return NextResponse.json(
      { error: "La lista de espera no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as { slotId?: string };
  const slotId = body.slotId?.trim();

  if (!slotId) {
    return NextResponse.json(
      { error: "slotId es requerido." },
      { status: 400, headers: responseHeaders() }
    );
  }

  await addUserToWaitlist(slotId, auth.user.id);
  const slots = await getWaitlistSnapshot([slotId], auth.user.id);

  return NextResponse.json(
    { ok: true, slot: slots[slotId] || { count: 1, joined: true } },
    { headers: responseHeaders() }
  );
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isBookingWaitlistStoreConfigured()) {
    return NextResponse.json(
      { error: "La lista de espera no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as { slotId?: string };
  const slotId = body.slotId?.trim();

  if (!slotId) {
    return NextResponse.json(
      { error: "slotId es requerido." },
      { status: 400, headers: responseHeaders() }
    );
  }

  await removeUserFromWaitlist(slotId, auth.user.id);
  const slots = await getWaitlistSnapshot([slotId], auth.user.id);

  return NextResponse.json(
    { ok: true, slot: slots[slotId] || { count: 0, joined: false } },
    { headers: responseHeaders() }
  );
}
