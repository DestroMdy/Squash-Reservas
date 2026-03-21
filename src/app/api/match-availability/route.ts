import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";

type AvailabilityRow = {
  id: string;
  user_id: string;
  available_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRecord = {
  id: string;
  full_name?: string | null;
  category?: string | null;
  avatar_url?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchProfilesMap(
  supabaseUrl: string,
  serviceRoleKey: string,
  ids: string[]
) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,category,avatar_url&id=in.(${uniqueIds.join(",")})`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return {};
  }

  const rows = (await response.json()) as ProfileRecord[];
  return rows.reduce<Record<string, ProfileRecord>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
}

async function fetchAuthEmails(
  supabaseUrl: string,
  serviceRoleKey: string,
  userIds: string[]
) {
  const emails: Record<string, string> = {};

  for (const userId of userIds) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    });

    if (!response.ok) continue;

    const payload = (await response.json()) as {
      user?: { email?: string | null };
      email?: string | null;
    };

    const email = payload.user?.email || payload.email;
    if (email) {
      emails[userId] = email;
    }
  }

  return emails;
}

async function sendAvailabilityEmail({
  apiKey,
  from,
  to,
  appUrl,
  playerName,
  category,
  notes
}: {
  apiKey: string;
  from: string;
  to: string;
  appUrl: string;
  playerName: string;
  category: string;
  notes: string | null;
}) {
  const safePlayerName = escapeHtml(playerName);
  const safeCategory = escapeHtml(category);
  const safeNotes = notes ? escapeHtml(notes) : "";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${playerName} está buscando partido`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:12px">Busco partido hoy</h2>
          <p><strong>${safePlayerName}</strong> se publicó para jugar en <strong>La Martineta</strong>.</p>
          <p>Categoría: <strong>${safeCategory}</strong></p>
          ${safeNotes ? `<p>Nota: ${safeNotes}</p>` : ""}
          <p>
            Puedes verlo y escribirle desde:
            <a href="${appUrl}/matches" style="color:#2563eb">${appUrl}/matches</a>
          </p>
        </div>
      `
    })
  }).catch(() => null);
}

function formatRequests(
  rows: AvailabilityRow[],
  profilesMap: Record<string, ProfileRecord>
) {
  return rows.map((request) => ({
    ...request,
    profiles: profilesMap[request.user_id] ?? null
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceRoleKey = auth.serviceRoleKey as string;

  const today = getTodayDate();

  const currentProfileResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,category,avatar_url&id=eq.${auth.user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const currentProfileRows = (await currentProfileResponse.json()) as ProfileRecord[];
  const currentProfile = currentProfileRows[0];

  const requestsResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/match_availability_requests?select=id,user_id,available_on,notes,created_at,updated_at&available_on=eq.${today}&order=created_at.desc`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!requestsResponse.ok) {
    const errorText = await requestsResponse.text();
    if (errorText.includes("match_availability_requests")) {
      return NextResponse.json({
        requests: [],
        currentRequest: null,
        unavailable: true
      });
    }

    return NextResponse.json(
      { error: "No se pudo cargar quién busca partido." },
      { status: 400 }
    );
  }

  const rows = (await requestsResponse.json()) as AvailabilityRow[];
  const ids = rows.map((row) => row.user_id);
  const profilesMap = await fetchProfilesMap(auth.supabaseUrl, serviceRoleKey, ids);

  const sameCategoryRequests = rows.filter((row) => {
    const profile = profilesMap[row.user_id];
    if (!profile || !currentProfile) return false;
    return profile.category === currentProfile.category && row.user_id !== auth.user.id;
  });

  const currentRequest = rows.find((row) => row.user_id === auth.user.id) ?? null;

  return NextResponse.json({
    requests: formatRequests(sameCategoryRequests, profilesMap),
    currentRequest: currentRequest
      ? {
          ...currentRequest,
          profiles: profilesMap[currentRequest.user_id] ?? currentProfile ?? null
        }
      : null
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceRoleKey = auth.serviceRoleKey as string;

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Squash Reservas <onboarding@resend.dev>";
  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `match-availability:${ip}:${auth.user.id}`,
    max: 6,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos en poco tiempo. Espera unos segundos." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const body = (await request.json()) as { notes?: string | null };
  const today = getTodayDate();

  const profileResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,category,avatar_url&id=eq.${auth.user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );
  const profileRows = (await profileResponse.json()) as ProfileRecord[];
  const currentProfile = profileRows[0];

  if (!currentProfile?.category) {
    return NextResponse.json(
      { error: "Completa tu categoría en Mi perfil antes de buscar partido." },
      { status: 400 }
    );
  }

  const existingResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/match_availability_requests?select=id,user_id,available_on,notes,created_at,updated_at&user_id=eq.${auth.user.id}&available_on=eq.${today}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const existingRows = (await existingResponse.json()) as AvailabilityRow[];
  const existingRequest = existingRows[0] ?? null;

  let requestRow: AvailabilityRow | null = null;

  if (existingRequest) {
    const updateResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/match_availability_requests?id=eq.${existingRequest.id}`,
      {
        method: "PATCH",
        headers: {
          ...adminHeaders(serviceRoleKey),
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          notes: body.notes?.trim() || null
        }),
        cache: "no-store"
      }
    );

    const rows = (await updateResponse.json()) as AvailabilityRow[];
    requestRow = rows[0] ?? existingRequest;
  } else {
    const insertResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/match_availability_requests`,
      {
        method: "POST",
        headers: {
          ...adminHeaders(serviceRoleKey),
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          user_id: auth.user.id,
          available_on: today,
          notes: body.notes?.trim() || null
        }),
        cache: "no-store"
      }
    );

    const rows = (await insertResponse.json()) as AvailabilityRow[];
    requestRow = rows[0] ?? null;
  }

  if (!requestRow) {
    return NextResponse.json(
      { error: "No se pudo publicar tu búsqueda de partido." },
      { status: 400 }
    );
  }

  if (resendApiKey && !existingRequest) {
    const categoryPeersResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,category&category=eq.${encodeURIComponent(
        currentProfile.category
      )}&id=neq.${auth.user.id}`,
      {
        method: "GET",
        headers: adminHeaders(serviceRoleKey),
        cache: "no-store"
      }
    );

    const peers = (await categoryPeersResponse.json()) as ProfileRecord[];
    const emails = await fetchAuthEmails(
      auth.supabaseUrl,
      serviceRoleKey,
      peers.map((peer) => peer.id)
    );

    await Promise.all(
      Object.entries(emails).map(([, email]) =>
        sendAvailabilityEmail({
          apiKey: resendApiKey,
          from: fromEmail,
          to: email,
          appUrl: request.nextUrl.origin,
          playerName: currentProfile.full_name?.trim() || "Un jugador",
          category: currentProfile.category || "Sin categoría",
          notes: body.notes?.trim() || null
        })
      )
    );
  }

  return NextResponse.json({
    ok: true,
    request: {
      ...requestRow,
      profiles: currentProfile
    }
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceRoleKey = auth.serviceRoleKey as string;

  const today = getTodayDate();

  const deleteResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/match_availability_requests?user_id=eq.${auth.user.id}&available_on=eq.${today}`,
    {
      method: "DELETE",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=minimal"
      },
      cache: "no-store"
    }
  );

  if (!deleteResponse.ok) {
    return NextResponse.json(
      { error: "No se pudo quitar tu aviso de disponibilidad." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
