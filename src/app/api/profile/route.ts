import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import {
  getWaitlistWhatsAppPreference,
  isWhatsAppNotificationPreferenceStoreConfigured,
  setWaitlistWhatsAppPreference
} from "@/lib/whatsapp-notification-preferences-store";
import { isTwilioWhatsAppConfigured } from "@/lib/whatsapp-notifications";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-utils";

type ProfilePayload = {
  full_name?: string | null;
  phone?: string | null;
  category?: string | null;
  avatar_url?: string | null;
  whatsapp_waitlist_opt_in?: boolean;
};

async function fetchCurrentProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,phone,category,role,avatar_url&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<Record<string, unknown>>;

  return {
    ok: response.ok,
    profile: rows[0] ?? null
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { ok, profile } = await fetchCurrentProfile(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    auth.user.id
  );

  if (!ok) {
    return NextResponse.json(
      { error: "No se pudo cargar el perfil." },
      { status: 400 }
    );
  }

  const whatsappPreference = isWhatsAppNotificationPreferenceStoreConfigured()
    ? await getWaitlistWhatsAppPreference(auth.user.id).catch(() => null)
    : null;

  return NextResponse.json({
    profile: profile
      ? {
          ...profile,
          whatsapp_waitlist_opt_in:
            whatsappPreference?.waitlist_opt_in === true,
          whatsapp_waitlist_available: isTwilioWhatsAppConfigured()
        }
      : null
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as ProfilePayload;
  const payload: ProfilePayload = {};
  const updatesWhatsAppPreference = "whatsapp_waitlist_opt_in" in body;
  const nextWhatsAppOptIn = body.whatsapp_waitlist_opt_in === true;

  if ("full_name" in body) payload.full_name = body.full_name ?? null;
  if ("phone" in body) payload.phone = body.phone ?? null;
  if ("category" in body) payload.category = body.category ?? null;
  if ("avatar_url" in body) payload.avatar_url = body.avatar_url ?? null;

  const current = await fetchCurrentProfile(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    auth.user.id
  );

  if (!current.ok) {
    return NextResponse.json(
      { error: "No se pudo cargar el perfil actual." },
      { status: 400 }
    );
  }

  if (
    updatesWhatsAppPreference &&
    !isWhatsAppNotificationPreferenceStoreConfigured()
  ) {
    return NextResponse.json(
      { error: "La configuracion de avisos por WhatsApp no esta disponible." },
      { status: 503 }
    );
  }

  const nextPhone =
    "phone" in payload
      ? payload.phone ?? null
      : (current.profile?.phone as string | null | undefined) ?? null;

  if (updatesWhatsAppPreference && nextWhatsAppOptIn && !normalizeWhatsAppPhone(nextPhone)) {
    return NextResponse.json(
      {
        error:
          "Para recibir avisos por WhatsApp, carga un celular valido en tu perfil. Ejemplo: 2804123456 o +54 9 ..."
      },
      { status: 400 }
    );
  }

  let nextProfile = current.profile;

  if (Object.keys(payload).length) {
    const response = await fetch(
      `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${auth.user.id}`,
      {
        method: "PATCH",
        headers: {
          ...adminHeaders(auth.serviceRoleKey),
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload),
        cache: "no-store"
      }
    );

    const rows = (await response.json()) as Array<Record<string, unknown>>;

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo actualizar el perfil." },
        { status: 400 }
      );
    }

    nextProfile = rows[0] ?? null;
  }

  if (updatesWhatsAppPreference) {
    await setWaitlistWhatsAppPreference(auth.user.id, nextWhatsAppOptIn);
  }

  return NextResponse.json({
    ok: true,
    profile: nextProfile
      ? {
          ...nextProfile,
          whatsapp_waitlist_opt_in: updatesWhatsAppPreference
            ? nextWhatsAppOptIn
            : Boolean(
                (
                  await getWaitlistWhatsAppPreference(auth.user.id).catch(
                    () => null
                  )
                )?.waitlist_opt_in
              ),
          whatsapp_waitlist_available: isTwilioWhatsAppConfigured()
        }
      : null
  });
}
