import { NextRequest, NextResponse } from "next/server";
import { getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import { getAllPushSubscribedUserIds } from "@/lib/push-subscriptions-store";
import { isWebPushConfigured, sendWebPushToUserIds } from "@/lib/web-push";

const REMINDER_STATE_KEY = "push:daily-booking-reminder:v1";
const APP_TIME_ZONE = "America/Argentina/Buenos_Aires";

type ReminderState = {
  last_sent_on?: string;
};

function getDatePartsInTimeZone(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return {
    year,
    month,
    day,
    iso: `${year}-${month}-${day}`
  };
}

function formatReservationDayLabel(date: Date) {
  const formatted = new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit"
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() || "";
  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!isWebPushConfigured() || !isKvConfigured()) {
    return NextResponse.json(
      { error: "Las notificaciones push no estan disponibles." },
      { status: 503 }
    );
  }

  const now = new Date();
  const today = getDatePartsInTimeZone(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowLabel = formatReservationDayLabel(tomorrow);

  const state =
    (await getJsonKv<ReminderState>(REMINDER_STATE_KEY).catch(() => null)) || {};

  if (state.last_sent_on === today.iso) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "already_sent",
      sent_on: today.iso
    });
  }

  const userIds = await getAllPushSubscribedUserIds();

  if (!userIds.length) {
    await setJsonKv(REMINDER_STATE_KEY, { last_sent_on: today.iso });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_subscribers",
      sent_on: today.iso
    });
  }

  const result = await sendWebPushToUserIds(userIds, {
    title: "Reservas habilitadas",
    body: `Ya puedes reservar los turnos de ${tomorrowLabel}.`,
    url: "/schedule",
    tag: `booking-open-${today.iso}`
  });

  if (result.sent === 0 && result.failed > 0) {
    return NextResponse.json(
      {
        error: "No se pudo entregar el recordatorio push.",
        sent_on: today.iso,
        user_count: userIds.length,
        sent: result.sent,
        failed: result.failed
      },
      { status: 502 }
    );
  }

  await setJsonKv(REMINDER_STATE_KEY, {
    last_sent_on: today.iso
  });

  return NextResponse.json({
    ok: true,
    sent_on: today.iso,
    user_count: userIds.length,
    sent: result.sent,
    failed: result.failed
  });
}
