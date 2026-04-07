import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/lib/server-auth";
import {
  removePushSubscription,
  upsertPushSubscription
} from "@/lib/push-subscriptions-store";
import { isWebPushConfigured } from "@/lib/web-push";

type SubscribeBody = {
  subscription?: PushSubscriptionJSON;
  endpoint?: string;
};

function isValidPushSubscription(
  value: unknown
): value is PushSubscriptionJSON {
  if (!value || typeof value !== "object") {
    return false;
  }

  const subscription = value as PushSubscriptionJSON;
  return Boolean(
    subscription.endpoint?.trim() &&
      subscription.keys?.auth?.trim() &&
      subscription.keys?.p256dh?.trim()
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Las notificaciones push todavia no estan activas." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as SubscribeBody;

  if (!isValidPushSubscription(body.subscription)) {
    return NextResponse.json(
      { error: "La suscripcion push no es valida." },
      { status: 400 }
    );
  }

  await upsertPushSubscription({
    userId: auth.user.id,
    subscription: body.subscription,
    userAgent: request.headers.get("user-agent")
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as SubscribeBody;
  const endpoint = body.endpoint?.trim();

  if (!endpoint) {
    return NextResponse.json(
      { error: "Hace falta el endpoint de la suscripcion." },
      { status: 400 }
    );
  }

  await removePushSubscription(endpoint);

  return NextResponse.json({ ok: true });
}
