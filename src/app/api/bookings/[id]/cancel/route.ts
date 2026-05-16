import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  clearWaitlistForSlot,
  getWaitlistForSlot,
  isBookingWaitlistStoreConfigured
} from "@/lib/booking-waitlist-store";
import { getWaitlistWhatsAppPreferences } from "@/lib/whatsapp-notification-preferences-store";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import { canCancelBooking } from "@/lib/time-rules";
import { sendWebPushToUserIds } from "@/lib/web-push";
import { isTwilioWhatsAppConfigured, sendWaitlistReleasedWhatsAppNotification } from "@/lib/whatsapp-notifications";

type WaitlistRecipient = {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  whatsappOptIn: boolean;
};

type NotificationFailure = {
  userId: string;
  channel: "push" | "whatsapp" | "email" | "none";
  reason: string;
};

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

async function fetchProfileContactById(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,phone&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as Array<{
    id?: string;
    full_name?: string | null;
    phone?: string | null;
  }>;

  return rows[0] ?? null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSlotDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const formatted = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

async function fetchWaitlistRecipients({
  supabaseUrl,
  serviceRoleKey,
  waitlistUserIds
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  waitlistUserIds: string[];
}) {
  const whatsappPreferences = await getWaitlistWhatsAppPreferences(
    waitlistUserIds
  ).catch(() => ({} as Record<string, { waitlist_opt_in: boolean } | null>));

  return Promise.all(
    waitlistUserIds.map(async (userId) => {
      const [email, profile] = await Promise.all([
        fetchAuthUserById(supabaseUrl, serviceRoleKey, userId),
        fetchProfileContactById(supabaseUrl, serviceRoleKey, userId)
      ]);

      return {
        userId,
        email,
        fullName: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        whatsappOptIn:
          whatsappPreferences[userId]?.waitlist_opt_in === true
      } satisfies WaitlistRecipient;
    })
  );
}

async function sendWaitlistEmails({
  resendApiKey,
  fromEmail,
  origin,
  slotDate,
  startTime,
  endTime,
  recipients
}: {
  resendApiKey: string;
  fromEmail: string;
  origin: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  recipients: WaitlistRecipient[];
}) {
  const uniqueEmails = Array.from(
    new Set(
      recipients
        .map((recipient) => recipient.email?.trim() || "")
        .filter(Boolean)
    )
  );

  if (!uniqueEmails.length) {
    return { ok: true as const };
  }

  const primaryRecipient = uniqueEmails[0];
  const bccRecipients = uniqueEmails.slice(1);
  const slotLabel = `${formatSlotDate(slotDate)} de ${startTime.slice(0, 5)} a ${endTime.slice(0, 5)}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [primaryRecipient],
      ...(bccRecipients.length ? { bcc: bccRecipients } : {}),
      subject: `Se libero un turno | ${slotLabel}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:12px">Se libero un turno</h2>
          <p style="margin:0 0 12px">
            Uno de los horarios que seguian en lista de espera acaba de quedar disponible:
            <strong> ${escapeHtml(slotLabel)}</strong>.
          </p>
          <p style="margin:0 0 16px">
            Puedes entrar ahora mismo a la agenda para intentar reservarlo.
          </p>
          <a
            href="${origin}/schedule?date=${slotDate}"
            style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700"
          >
            Ir a reservar
          </a>
        </div>
      `
    })
  });

  if (response.ok) {
    return { ok: true as const };
  }

  const errorText = await response.text();
  return {
    ok: false as const,
    error: errorText || "No se pudo enviar el aviso por email."
  };
}

async function notifyWaitlistUsers({
  resendApiKey,
  fromEmail,
  origin,
  supabaseUrl,
  serviceRoleKey,
  slotDate,
  startTime,
  endTime,
  waitlistUserIds
}: {
  resendApiKey?: string;
  fromEmail: string;
  origin: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  waitlistUserIds: string[];
}) {
  const recipients = await fetchWaitlistRecipients({
    supabaseUrl,
    serviceRoleKey,
    waitlistUserIds
  });
  const slotLabel = `${formatSlotDate(slotDate)} de ${startTime.slice(0, 5)} a ${endTime.slice(0, 5)}`;
  const scheduleUrl = `${origin}/schedule?date=${slotDate}`;
  const emailFallbackRecipients: WaitlistRecipient[] = [];
  const failures: NotificationFailure[] = [];
  const whatsappSentTo: string[] = [];
  const twilioEnabled = isTwilioWhatsAppConfigured();
  const pushUserIds = recipients.map((recipient) => recipient.userId);

  if (pushUserIds.length) {
    const pushResult = await sendWebPushToUserIds(pushUserIds, {
      title: "Se liberó un turno",
      body: `${slotLabel}. Entrá a la agenda para intentar reservarlo.`,
      url: `/schedule?date=${slotDate}`,
      tag: `waitlist-${slotDate}-${startTime}-${endTime}`
    }).catch((error) => {
      failures.push({
        userId: "broadcast",
        channel: "push",
        reason:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la notificación push."
      });

      return null;
    });

    if (pushResult && pushResult.failed && pushResult.sent === 0) {
      failures.push({
        userId: "broadcast",
        channel: "push",
        reason:
          "No se pudo entregar la notificación push a los dispositivos suscritos."
      });
    }
  }

  for (const recipient of recipients) {
    const canUseWhatsApp =
      recipient.whatsappOptIn &&
      twilioEnabled &&
      Boolean(recipient.phone?.trim());

    if (canUseWhatsApp) {
      try {
        await sendWaitlistReleasedWhatsAppNotification({
          recipientPhone: recipient.phone as string,
          recipientName: recipient.fullName,
          slotLabel,
          scheduleUrl
        });
        whatsappSentTo.push(recipient.userId);
        continue;
      } catch (error) {
        failures.push({
          userId: recipient.userId,
          channel: "whatsapp",
          reason:
            error instanceof Error
              ? error.message
              : "No se pudo enviar el aviso por WhatsApp."
        });
      }
    }

    if (recipient.email?.trim()) {
      emailFallbackRecipients.push(recipient);
      continue;
    }

    failures.push({
      userId: recipient.userId,
      channel: "none",
      reason: recipient.whatsappOptIn
        ? "El usuario habilito WhatsApp pero no tiene un canal de respaldo disponible."
        : "El usuario no tiene email ni WhatsApp habilitado para recibir avisos."
    });
  }

  const emailedUserIds = emailFallbackRecipients.map((recipient) => recipient.userId);

  if (emailFallbackRecipients.length && resendApiKey) {
    const emailResult = await sendWaitlistEmails({
      resendApiKey,
      fromEmail,
      origin,
      slotDate,
      startTime,
      endTime,
      recipients: emailFallbackRecipients
    });

    if (!emailResult.ok) {
      failures.push(
        ...emailFallbackRecipients.map((recipient) => ({
          userId: recipient.userId,
          channel: "email" as const,
          reason: emailResult.error
        }))
      );
    }
  } else if (emailFallbackRecipients.length) {
    failures.push(
      ...emailFallbackRecipients.map((recipient) => ({
        userId: recipient.userId,
        channel: "email" as const,
        reason: "Falta configurar Resend para los avisos por email."
      }))
    );
  }

  return {
    recipients,
    whatsappSentTo,
    emailedUserIds,
    failures
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

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
    `${auth.supabaseUrl}/rest/v1/bookings?select=id,user_id,time_slot_id,status,time_slots(slot_date,start_time,end_time)&id=eq.${id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey as string),
      cache: "no-store"
    }
  );

  const bookingRows = (await bookingResponse.json()) as Array<{
    id: string;
    user_id: string;
    time_slot_id: string;
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
  const endTime = booking.time_slots?.end_time;

  if (!slotDate || !startTime || !endTime) {
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
    `${auth.supabaseUrl}/rest/v1/bookings?id=eq.${id}&status=eq.confirmed`,
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

  if (isBookingWaitlistStoreConfigured()) {
    const waitlistEntries = await getWaitlistForSlot(booking.time_slot_id);

    if (waitlistEntries.length) {
      const resendApiKey = process.env.RESEND_API_KEY;
      const fromEmail =
        process.env.RESEND_FROM_EMAIL ||
        "Squash Reservas <onboarding@resend.dev>";

      const notificationResult = await notifyWaitlistUsers({
        resendApiKey,
        fromEmail,
        origin: request.nextUrl.origin,
        supabaseUrl: auth.supabaseUrl,
        serviceRoleKey: auth.serviceRoleKey,
        slotDate,
        startTime,
        endTime,
        waitlistUserIds: waitlistEntries.map((entry) => entry.user_id)
      }).catch((error) => ({
        recipients: [] as WaitlistRecipient[],
        whatsappSentTo: [] as string[],
        emailedUserIds: [] as string[],
        failures: [
          {
            userId: "unknown",
            channel: "none" as const,
            reason:
              error instanceof Error
                ? error.message
                : "No se pudieron procesar los avisos de lista de espera."
          }
        ]
      }));

      if (notificationResult.failures.length) {
        await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
          actorId: auth.user.id,
          action: "booking.waitlist_notification_failed",
          targetType: "booking",
          targetId: booking.id,
          details: {
            time_slot_id: booking.time_slot_id,
            slot_date: slotDate,
            start_time: startTime,
            end_time: endTime,
            whatsapp_sent_to: notificationResult.whatsappSentTo,
            email_fallback_user_ids: notificationResult.emailedUserIds,
            failures: notificationResult.failures
          }
        }).catch(() => null);
      }

      await clearWaitlistForSlot(booking.time_slot_id).catch(() => null);
    }
  }

  return NextResponse.json({ ok: true });
}
