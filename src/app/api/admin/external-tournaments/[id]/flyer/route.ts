import { NextRequest, NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  buildPublicStorageUrl,
  getStoragePathFromPublicUrl
} from "@/lib/avatar-url";
import {
  getStoredExternalTournamentFlyer,
  setStoredExternalTournamentFlyer,
  deleteStoredExternalTournamentFlyer
} from "@/lib/external-tournament-flyers-store";
import { adminHeaders, requireAdminRequest } from "@/lib/server-auth";

const TOURNAMENT_FLYER_BUCKET = "avatars";
const TOURNAMENT_FLYER_MAX_SIZE_BYTES = 8 * 1024 * 1024;
const TOURNAMENT_FLYER_ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

type TargetTournament = {
  id: string;
  title: string;
};

async function fetchTargetTournament(
  supabaseUrl: string,
  serviceRoleKey: string,
  tournamentId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/external_tournaments?select=id,title&id=eq.${tournamentId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as TargetTournament[];
  return {
    ok: response.ok,
    tournament: rows[0] || null
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = await fetchTargetTournament(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    params.id
  );

  if (!target.ok || !target.tournament) {
    return NextResponse.json(
      { error: "No se encontró el torneo." },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Debes subir una imagen válida." },
      { status: 400 }
    );
  }

  const extension = TOURNAMENT_FLYER_ALLOWED_MIME_TYPES.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: "El flyer debe ser JPG, PNG o WebP." },
      { status: 400 }
    );
  }

  if (file.size > TOURNAMENT_FLYER_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "El flyer no puede superar los 8 MB." },
      { status: 400 }
    );
  }

  const previousFlyerUrl = await getStoredExternalTournamentFlyer(params.id).catch(
    () => null
  );
  const previousFlyerPath = getStoragePathFromPublicUrl(
    TOURNAMENT_FLYER_BUCKET,
    previousFlyerUrl
  );
  const nextFlyerPath = `tournaments/${params.id}/flyer.${extension}`;

  if (previousFlyerPath && previousFlyerPath !== nextFlyerPath) {
    await fetch(
      `${auth.supabaseUrl}/storage/v1/object/${TOURNAMENT_FLYER_BUCKET}/${previousFlyerPath}`,
      {
        method: "DELETE",
        headers: {
          apikey: auth.serviceRoleKey,
          Authorization: `Bearer ${auth.serviceRoleKey}`
        },
        cache: "no-store"
      }
    ).catch(() => null);
  }

  const uploadResponse = await fetch(
    `${auth.supabaseUrl}/storage/v1/object/${TOURNAMENT_FLYER_BUCKET}/${nextFlyerPath}`,
    {
      method: "POST",
      headers: {
        apikey: auth.serviceRoleKey,
        Authorization: `Bearer ${auth.serviceRoleKey}`,
        "x-upsert": "true",
        "Content-Type": file.type
      },
      body: file,
      cache: "no-store"
    }
  );

  const uploadText = await uploadResponse.text();

  if (!uploadResponse.ok) {
    return NextResponse.json(
      { error: uploadText || "No se pudo subir el flyer." },
      { status: 400 }
    );
  }

  const flyerUrl = buildPublicStorageUrl(
    auth.supabaseUrl,
    TOURNAMENT_FLYER_BUCKET,
    nextFlyerPath
  );

  await setStoredExternalTournamentFlyer(params.id, flyerUrl);

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "external_tournament.flyer.updated",
    targetType: "external_tournament",
    targetId: params.id,
    details: {
      title: target.tournament.title,
      previous_flyer_url: previousFlyerUrl,
      next_flyer_url: flyerUrl
    }
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    flyer_url: flyerUrl
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = await fetchTargetTournament(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    params.id
  );

  if (!target.ok || !target.tournament) {
    return NextResponse.json(
      { error: "No se encontró el torneo." },
      { status: 404 }
    );
  }

  const previousFlyerUrl = await getStoredExternalTournamentFlyer(params.id).catch(
    () => null
  );

  if (!previousFlyerUrl) {
    return NextResponse.json({ ok: true, flyer_url: null });
  }

  const flyerPath = getStoragePathFromPublicUrl(
    TOURNAMENT_FLYER_BUCKET,
    previousFlyerUrl
  );

  if (flyerPath) {
    await fetch(
      `${auth.supabaseUrl}/storage/v1/object/${TOURNAMENT_FLYER_BUCKET}/${flyerPath}`,
      {
        method: "DELETE",
        headers: {
          apikey: auth.serviceRoleKey,
          Authorization: `Bearer ${auth.serviceRoleKey}`
        },
        cache: "no-store"
      }
    ).catch(() => null);
  }

  await deleteStoredExternalTournamentFlyer(params.id).catch(() => null);

  await logAdminAudit(auth.supabaseUrl, auth.serviceRoleKey, {
    actorId: auth.user.id,
    action: "external_tournament.flyer.deleted",
    targetType: "external_tournament",
    targetId: params.id,
    details: {
      title: target.tournament.title,
      previous_flyer_url: previousFlyerUrl
    }
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    flyer_url: null
  });
}
