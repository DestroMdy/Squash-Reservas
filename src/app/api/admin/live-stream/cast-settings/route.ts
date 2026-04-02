import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getStoredLiveCastSettings,
  isLiveStreamStoreConfigured,
  setStoredLiveCastSettings
} from "@/lib/live-stream-store";
import { requireAdminRequest } from "@/lib/server-auth";

type CastSettingsBody = {
  google_cast_app_id?: string | null;
};

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, Cookie"
  };
}

function normalizeGoogleCastAppId(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-F0-9]{8}$/.test(normalized) ? normalized : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const settings = await getStoredLiveCastSettings();

  return NextResponse.json(
    {
      google_cast_app_id: settings.google_cast_app_id,
      receiver_url: `${new URL(request.url).origin}/cast/live-receiver.html`
    },
    {
      headers: responseHeaders()
    }
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { error: "La configuracion de KV no esta disponible." },
      { status: 503, headers: responseHeaders() }
    );
  }

  const body = (await request.json()) as CastSettingsBody;
  const normalizedAppId = normalizeGoogleCastAppId(body.google_cast_app_id);

  if (body.google_cast_app_id?.trim() && !normalizedAppId) {
    return NextResponse.json(
      {
        error:
          "El App ID de Google Cast debe tener 8 caracteres hexadecimales."
      },
      { status: 400, headers: responseHeaders() }
    );
  }

  const settings = await setStoredLiveCastSettings({
    google_cast_app_id: normalizedAppId
  });

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "live_stream.cast_settings.updated",
    targetType: "live_stream",
    targetId: "cast-settings",
    details: {
      google_cast_app_id: settings.google_cast_app_id
    }
  }).catch(() => null);

  return NextResponse.json(
    {
      ok: true,
      google_cast_app_id: settings.google_cast_app_id,
      receiver_url: `${new URL(request.url).origin}/cast/live-receiver.html`
    },
    {
      headers: responseHeaders()
    }
  );
}
