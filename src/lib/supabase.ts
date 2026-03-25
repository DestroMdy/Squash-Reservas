import {
  decodeUserCookie,
  encodeUserCookie,
  USER_COOKIE_NAME
} from "@/lib/session-cookies";
import {
  AdminLiveCourtState,
  LiveCourtId,
  LivePlayerMapping,
  LiveCourtState,
  LiveScoreboard,
  LiveStreamConfig
} from "@/types/db";

export interface SessionData {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id: string; email?: string };
}

type SupabaseErrorPayload = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
  error?: string;
};

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
let inMemorySession: SessionData | null = null;

function getCookieValue(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  return cookie ? cookie.slice(name.length + 1) : null;
}

function hasUserCookie() {
  return Boolean(getCookieValue(USER_COOKIE_NAME));
}

function setClientUserCookie(user?: SessionData["user"] | null) {
  if (typeof document === "undefined") {
    return;
  }

  if (!user?.id) {
    document.cookie = `${USER_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    return;
  }

  document.cookie = `${USER_COOKIE_NAME}=${encodeUserCookie(user)}; Path=/; SameSite=Lax`;
}

function headers(token?: string) {
  return {
    apikey: anonKey,
    Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  };
}

function normalizeSupabaseError(
  error: SupabaseErrorPayload | string | null | undefined
) {
  if (!error) {
    return "Error en Supabase";
  }

  if (typeof error === "string") {
    if (
      error.includes("P0001") &&
      error.includes("reserva confirmada por día por usuario")
    ) {
      return "Solo se permite una reserva confirmada por día por usuario.";
    }

    return error;
  }

  if (
    error.code === "23505" ||
    error.message?.includes("bookings_time_slot_id_key")
  ) {
    return "El turno ya fue reservado por otro usuario.";
  }

  if (
    error.code === "P0001" &&
    error.message?.includes("reserva confirmada por día por usuario")
  ) {
    return "Solo se permite una reserva confirmada por día por usuario.";
  }

  return error.error || error.message || "Error en Supabase";
}

export function getSession(): SessionData | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (inMemorySession) {
    return inMemorySession;
  }

  const user = decodeUserCookie(getCookieValue(USER_COOKIE_NAME));
  return user
    ? {
        access_token: "",
        user
      }
    : null;
}

export function setSession(session: SessionData | null) {
  if (typeof window === "undefined") return;

  if (!session) {
    inMemorySession = null;
    setClientUserCookie(null);
  } else {
    inMemorySession = {
      access_token: session.access_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      expires_at:
        session.expires_at ??
        (typeof session.expires_in === "number"
          ? Date.now() + session.expires_in * 1000 - 30_000
          : undefined),
      user: session.user
    };
    setClientUserCookie(session.user);
  }

  window.dispatchEvent(new Event("sr-auth-change"));
}

export function clearSession() {
  setSession(null);
}

function isSessionExpired(session: SessionData | null | undefined) {
  if (!session?.access_token) {
    return true;
  }

  if (!session.expires_at) {
    return false;
  }

  return session.expires_at <= Date.now();
}

async function tryRefreshAccessToken() {
  if (typeof window === "undefined" || !hasUserCookie()) {
    return null;
  }

  try {
    return await refreshSessionFromCookie();
  } catch {
    clearSession();
    return null;
  }
}

export async function getValidSession(preferredToken?: string) {
  const session = getSession();

  if (preferredToken) {
    return {
      ...(session || {}),
      access_token: preferredToken
    } as SessionData;
  }

  if (session?.access_token && !isSessionExpired(session)) {
    return session;
  }

  return tryRefreshAccessToken();
}

async function getValidAccessToken(preferredToken?: string) {
  const session = await getValidSession(preferredToken);
  return session?.access_token || "";
}

export async function signUp(
  email: string,
  password: string,
  captchaToken: string
) {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, captchaToken })
  });

  const data = (await response.json()) as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "No se pudo registrar");
  }
}

export async function requestPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/reset-password`
      : undefined;

  const response = await fetch("/api/auth/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      ...(redirectTo ? { redirectTo } : {})
    })
  });

  const data = (await response.json()) as {
    msg?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error || data.error_description || data.msg || "No se pudo enviar el mail."
    );
  }
}

export async function updatePassword(accessToken: string, password: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: headers(accessToken),
    body: JSON.stringify({ password })
  });

  const data = (await response.json()) as {
    msg?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error_description || data.msg || "No se pudo actualizar la contraseña."
    );
  }
}

export async function updateCurrentUserPassword(password: string) {
  if (!password.trim()) {
    throw new Error("Debes ingresar una nueva contraseña.");
  }

  if (password.trim().length < 6) {
    throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");
  }

  const session = await getValidSession();

  if (!session?.access_token) {
    throw new Error("Tu sesión expiró. Iniciá sesión nuevamente.");
  }

  await updatePassword(session.access_token, password.trim());
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = (await response.json()) as SessionData & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error || data.error_description || "No se pudo iniciar sesión"
    );
  }

  setSession({
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    user: data.user
  });
}

export async function refreshSessionFromCookie() {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  const data = (await response.json()) as SessionData & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "No se pudo restaurar la sesión.");
  }

  setSession({
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    user: data.user
  });

  return data;
}

export async function signOut() {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  clearSession();
}

export async function getUser(token: string) {
  const sessionUser = getSession()?.user;
  if (sessionUser?.id) {
    return sessionUser;
  }

  if (!token) {
    return null;
  }

  const refreshedSession = await tryRefreshAccessToken();
  return refreshedSession?.user || null;
}

async function authedRouteRequest(
  input: string,
  init: RequestInit & {
    token?: string;
    requireJsonContentType?: boolean;
    retryOnUnauthorized?: boolean;
  } = {}
) {
  const {
    token,
    retryOnUnauthorized = true,
    requireJsonContentType = false,
    headers: providedHeaders,
    ...restInit
  } = init;

  const buildHeaders = (accessToken?: string) => {
    const normalizedHeaders = new Headers(providedHeaders || {});

    if (requireJsonContentType && !normalizedHeaders.has("Content-Type")) {
      normalizedHeaders.set("Content-Type", "application/json");
    }

    if (accessToken) {
      normalizedHeaders.set("Authorization", `Bearer ${accessToken}`);
    } else {
      normalizedHeaders.delete("Authorization");
    }

    return normalizedHeaders;
  };

  let accessToken = await getValidAccessToken(token);
  let response = await fetch(input, {
    ...restInit,
    headers: buildHeaders(accessToken)
  });

  if (
    response.status === 401 &&
    retryOnUnauthorized &&
    typeof window !== "undefined"
  ) {
    const refreshedSession = await tryRefreshAccessToken();

    if (refreshedSession?.access_token) {
      accessToken = refreshedSession.access_token;
      response = await fetch(input, {
        ...restInit,
        headers: buildHeaders(accessToken)
      });
    }
  }

  if (response.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.href = "/login";
  }

  return response;
}

async function parseJsonPayload<T>(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  return JSON.parse(text) as T;
}

async function rest<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  let accessToken = await getValidAccessToken(options?.token);
  let response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...headers(accessToken),
      ...(options?.headers || {})
    }
  });

  if (response.status === 401 && typeof window !== "undefined") {
    const refreshedSession = await tryRefreshAccessToken();

    if (refreshedSession?.access_token) {
      accessToken = refreshedSession.access_token;
      response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers: {
          ...headers(accessToken),
          ...(options?.headers || {})
        }
      });
    }
  }

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      clearSession();
      window.location.href = "/login";
    }

    throw new Error("Tu sesión expiró. Iniciá sesión nuevamente.");
  }

  if (!response.ok) {
    const errorBody = await response.text();

    if (!errorBody.trim()) {
      throw new Error("Error en Supabase");
    }

    let parsedError: SupabaseErrorPayload | null = null;

    try {
      parsedError = JSON.parse(errorBody) as SupabaseErrorPayload;
    } catch {
      parsedError = null;
    }

    throw new Error(normalizeSupabaseError(parsedError ?? errorBody));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();

  if (!responseText.trim()) {
    return undefined as T;
  }

  return JSON.parse(responseText) as T;
}

export async function uploadProfileAvatar(
  userId: string,
  token: string,
  file: File
) {
  const extension = AVATAR_ALLOWED_MIME_TYPES.get(file.type);

  if (!extension) {
    throw new Error("La foto debe ser JPG, PNG o WebP.");
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error("La foto no puede superar los 5 MB.");
  }

  const filePath = `${userId}/avatar.${extension}`;
  const formData = new FormData();
  formData.append("file", file, filePath);

  const response = await authedRouteRequest("/api/profile/avatar", {
    method: "POST",
    token,
    body: formData
  });

  const payload = await parseJsonPayload<{
    error?: string;
    avatar_url?: string;
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo subir la foto.");
  }

  return (
    payload?.avatar_url ||
    `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${filePath}`
  );
}

export async function fetchSlotsByDate(date: string, token?: string) {
  const response = await authedRouteRequest(
    `/api/bookings?date=${encodeURIComponent(date)}`,
    {
      method: "GET",
      token
    }
  );

  const payload = await parseJsonPayload<{
    error?: string;
    slots?: any[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar la agenda.");
  }

  return payload?.slots || [];
}

export async function fetchWaitlistSnapshot(
  slotIds: string[],
  token: string
) {
  if (!slotIds.length) {
    return {};
  }

  const response = await authedRouteRequest(
    `/api/waitlist?slot_ids=${encodeURIComponent(slotIds.join(","))}`,
    {
      method: "GET",
      token
    }
  );

  const payload = await parseJsonPayload<{
    error?: string;
    slots?: Record<string, { count: number; joined: boolean }>;
    unavailable?: boolean;
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar la lista de espera.");
  }

  return payload?.slots || {};
}

export async function joinBookingWaitlist(slotId: string, token: string) {
  const response = await authedRouteRequest("/api/waitlist", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({ slotId })
  });

  const payload = await parseJsonPayload<{
    error?: string;
    slot?: { count: number; joined: boolean };
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo entrar a la lista de espera.");
  }

  return payload?.slot || { count: 1, joined: true };
}

export async function leaveBookingWaitlist(slotId: string, token: string) {
  const response = await authedRouteRequest("/api/waitlist", {
    method: "DELETE",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({ slotId })
  });

  const payload = await parseJsonPayload<{
    error?: string;
    slot?: { count: number; joined: boolean };
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo salir de la lista de espera.");
  }

  return payload?.slot || { count: 0, joined: false };
}

export async function fetchMyBookings(userId: string, token: string) {
  const response = await authedRouteRequest("/api/bookings?scope=my", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    bookings?: any[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron cargar tus reservas.");
  }

  return (payload?.bookings || []).filter((booking) => booking.user_id === userId);
}

export async function fetchAllBookings(token: string) {
  const response = await authedRouteRequest("/api/bookings?scope=all", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    bookings?: any[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron cargar las reservas.");
  }

  return payload?.bookings || [];
}

export async function cancelBooking(bookingId: string, token: string) {
  const response = await authedRouteRequest(`/api/bookings/${bookingId}/cancel`, {
    method: "POST",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cancelar la reserva.");
  }
}

export async function updateBookingAsAdmin(
  bookingId: string,
  token: string,
  payload: {
    user_id: string;
    status: "confirmed" | "cancelled" | "completed";
    notes?: string | null;
  }
) {
  const response = await authedRouteRequest(`/api/admin/bookings/${bookingId}`, {
    method: "PATCH",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo actualizar la reserva.");
  }
}

export async function deleteProfileAsAdmin(
  profile: { id: string; avatar_url?: string | null },
  token: string
) {
  const response = await authedRouteRequest(`/api/admin/players/${profile.id}`, {
    method: "DELETE",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo eliminar el perfil.");
  }
}

export async function promoteProfileToAdmin(profileId: string, token: string) {
  const response = await authedRouteRequest(`/api/admin/players/${profileId}/role`, {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({ role: "admin" })
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo actualizar el rol.");
  }
}

export async function fetchProfileRole(userId: string, token: string) {
  const response = await authedRouteRequest("/api/profile", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    profile?: { id?: string; role?: "admin" | "player" };
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar el rol del perfil.");
  }

  if (payload?.profile?.id && payload.profile.id !== userId) {
    return undefined;
  }

  return payload?.profile?.role;
}

export async function fetchBookingStats(token: string) {
  const response = await authedRouteRequest("/api/bookings?scope=stats", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    total?: number;
    confirmed?: number;
    cancelled?: number;
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron cargar las métricas.");
  }

  return {
    total: payload?.total || 0,
    confirmed: payload?.confirmed || 0,
    cancelled: payload?.cancelled || 0
  };
}

export async function fetchLatestConfirmedBooking(token: string) {
  const response = await authedRouteRequest("/api/bookings?scope=latest", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    booking?: any;
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar la última reserva.");
  }

  return payload?.booking;
}

export async function fetchCourts(token?: string) {
  return rest<any[]>(
    "courts?select=id,name,is_active&order=name.asc",
    token ? { token } : undefined
  );
}

export async function createCourt(name: string, token: string) {
  await rest("courts", {
    method: "POST",
    token,
    body: JSON.stringify({ name, is_active: true }),
    headers: { Prefer: "return=minimal" }
  });
}

export async function fetchSlot(slotId: string, token: string) {
  const data = await rest<any[]>(
    `time_slots?select=id,court_id,slot_date,start_time,end_time,status,price,created_at&id=eq.${slotId}&limit=1`,
    { token }
  );
  return data[0];
}

export async function findAlternativeOpenSlot(
  slot: {
    id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
  },
  token: string
) {
  const data = await rest<any[]>(
    `time_slots?select=id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active),bookings(id,status)&slot_date=eq.${slot.slot_date}&start_time=eq.${slot.start_time}&end_time=eq.${slot.end_time}&id=neq.${slot.id}&order=created_at.asc`,
    { token }
  );

  return data.find((candidate: any) => {
    const bookings = (
      Array.isArray(candidate.bookings)
        ? candidate.bookings
        : candidate.bookings
          ? [candidate.bookings]
          : []
    ) as { status?: string }[];

    return !bookings.some((booking) => booking.status === "confirmed");
  });
}

export async function hasConfirmedBooking(timeSlotId: string, token: string) {
  const data = await rest<any[]>(
    `bookings?select=id&time_slot_id=eq.${timeSlotId}&status=eq.confirmed&limit=1`,
    { token }
  );
  return data.length > 0;
}

export async function createBooking(
  timeSlotId: string,
  courtId: string,
  userId: string,
  token: string
) {
  const cancelledBookings = await rest<any[]>(
    `bookings?select=id&time_slot_id=eq.${timeSlotId}&status=eq.cancelled&limit=1`,
    { token }
  );

  if (cancelledBookings.length > 0) {
    await rest(`bookings?id=eq.${cancelledBookings[0].id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        user_id: userId,
        court_id: courtId,
        time_slot_id: timeSlotId,
        status: "confirmed"
      }),
      headers: { Prefer: "return=minimal" }
    });
    return;
  }

  await rest("bookings", {
    method: "POST",
    token,
    body: JSON.stringify({
      user_id: userId,
      court_id: courtId,
      time_slot_id: timeSlotId,
      status: "confirmed"
    }),
    headers: { Prefer: "return=minimal" }
  });
}

export async function fetchProfile(userId: string, token: string) {
  const response = await authedRouteRequest("/api/profile", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    profile?: any;
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar el perfil.");
  }

  if (payload?.profile?.id && payload.profile.id !== userId) {
    return null;
  }

  return payload?.profile || null;
}

export async function updateProfile(
  userId: string,
  token: string,
  payload: {
    full_name?: string | null;
    phone?: string | null;
    category?: string | null;
    avatar_url?: string | null;
  }
) {
  const response = await authedRouteRequest("/api/profile", {
    method: "PATCH",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const result = await parseJsonPayload<{
    error?: string;
    profile?: { id?: string };
  }>(response);

  if (!response.ok) {
    throw new Error(result?.error || "No se pudo actualizar el perfil.");
  }

  if (result?.profile?.id && result.profile.id !== userId) {
    throw new Error("El perfil actualizado no coincide con el usuario actual.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-profile-updated"));
  }
}

export async function fetchBeginnerRulesStatus(token: string) {
  const response = await authedRouteRequest("/api/beginner-rules", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    required?: boolean;
    always_show?: boolean;
    category?: string | null;
    role?: string | null;
    acknowledged_at?: string | null;
  }>(response);

  if (!response.ok) {
    throw new Error(
      payload?.error || "No se pudo cargar el estado del reglamento."
    );
  }

  return {
    required: payload?.required === true,
    always_show: payload?.always_show === true,
    category: payload?.category ?? null,
    role: payload?.role ?? null,
    acknowledged_at: payload?.acknowledged_at ?? null
  };
}

export async function acknowledgeBeginnerRules(token: string) {
  const response = await authedRouteRequest("/api/beginner-rules", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({})
  });

  const payload = await parseJsonPayload<{
    error?: string;
    required?: boolean;
    always_show?: boolean;
    category?: string | null;
    role?: string | null;
    acknowledged_at?: string | null;
  }>(response);

  if (!response.ok) {
    throw new Error(
      payload?.error || "No se pudo confirmar la lectura del reglamento."
    );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-profile-updated"));
  }

  return {
    required: payload?.required === true,
    always_show: payload?.always_show === true,
    category: payload?.category ?? null,
    role: payload?.role ?? null,
    acknowledged_at: payload?.acknowledged_at ?? null
  };
}

export async function isProfileComplete(userId: string, token: string) {
  const profile = await fetchProfile(userId, token);

  if (!profile) return false;

  return Boolean(
    profile.full_name?.trim() &&
      profile.phone?.trim() &&
      profile.category?.trim()
  );
}

export async function fetchPlayers(token: string) {
  const response = await authedRouteRequest("/api/players", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    players?: any[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar la lista de jugadores.");
  }

  return payload?.players || [];
}

export async function fetchPrivateMessages(userId: string, token: string) {
  const response = await authedRouteRequest("/api/private-messages", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    messages?: any[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron cargar los mensajes privados.");
  }

  return (payload?.messages || []).filter((message) => {
    return message.sender_id === userId || message.recipient_id === userId;
  });
}

export async function fetchUnreadPrivateMessagesCount(
  userId: string,
  token: string
) {
  const data = await fetchPrivateMessages(userId, token);
  let groupUnreadCount = 0;

  try {
    const groupData = await fetchPrivateMessageGroups(token);
    groupUnreadCount = (groupData.groups || []).reduce(
      (sum: number, group: { unread_count?: number }) =>
        sum + (group.unread_count || 0),
      0
    );
  } catch {
    groupUnreadCount = 0;
  }

  return (
    data.filter(
      (message) => message.recipient_id === userId && !message.read_at
    ).length + groupUnreadCount
  );
}

export async function fetchLatestUnreadIncomingMessage(
  userId: string,
  token: string
) {
  const data = await fetchPrivateMessages(userId, token);

  return data
    .filter((message) => message.recipient_id === userId && !message.read_at)
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    )[0];
}

export async function fetchLatestUnreadGroupMessage(token: string) {
  const groupData = await fetchPrivateMessageGroups(token);
  const unreadGroups = (groupData.groups || [])
    .filter(
      (group: {
        unread_count?: number;
        last_message_at?: string | null;
      }) => (group.unread_count || 0) > 0 && group.last_message_at
    )
    .sort(
      (
        a: { last_message_at?: string | null },
        b: { last_message_at?: string | null }
      ) =>
        new Date(b.last_message_at || 0).getTime() -
        new Date(a.last_message_at || 0).getTime()
    );

  return unreadGroups[0] || null;
}

export async function fetchPrivateMessageGroups(token: string) {
  const response = await authedRouteRequest("/api/private-message-groups", {
    method: "GET",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string; groups?: any[]; unavailable?: boolean })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar los grupos.");
  }

  return {
    groups: payload.groups || [],
    unavailable: payload.unavailable === true
  };
}

export async function createPrivateMessageGroup(
  name: string,
  memberIds: string[],
  token: string
) {
  const response = await authedRouteRequest("/api/private-message-groups", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({
      name,
      memberIds
    })
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string; group?: any })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo crear el grupo.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-messages-updated"));
  }

  return payload.group;
}

export async function updatePrivateMessageGroup(
  groupId: string,
  payload: {
    name: string;
    memberIds: string[];
  },
  token: string
) {
  const response = await authedRouteRequest(`/api/private-message-groups/${groupId}`, {
    method: "PATCH",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const result = text.trim()
    ? (JSON.parse(text) as { error?: string; group?: any })
    : {};

  if (!response.ok) {
    throw new Error(result.error || "No se pudo actualizar el grupo.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-messages-updated"));
  }

  return result.group;
}

export async function fetchPrivateGroupMessages(groupId: string, token: string) {
  const response = await authedRouteRequest(
    `/api/private-message-groups/${groupId}/messages`,
    {
      method: "GET",
      token
    }
  );

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as {
        error?: string;
        messages?: any[];
        members?: any[];
      })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar los mensajes del grupo.");
  }

  return {
    messages: payload.messages || [],
    members: payload.members || []
  };
}

export async function sendPrivateGroupMessage(
  groupId: string,
  body: string,
  token: string
) {
  const response = await authedRouteRequest(
    `/api/private-message-groups/${groupId}/messages`,
    {
      method: "POST",
      token,
      requireJsonContentType: true,
      body: JSON.stringify({
        body: body.trim()
      })
    }
  );

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo enviar el mensaje al grupo.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-messages-updated"));
  }
}

export async function markPrivateGroupAsRead(groupId: string, token: string) {
  const response = await authedRouteRequest(
    `/api/private-message-groups/${groupId}/read`,
    {
      method: "POST",
      token
    }
  );

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo marcar el grupo como leído.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-messages-updated"));
  }
}

export async function sendPrivateMessage(
  senderId: string,
  recipientId: string,
  body: string,
  token: string
) {
  const response = await authedRouteRequest("/api/private-messages", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({
      sender_id: senderId,
      recipient_id: recipientId,
      body: body.trim()
    })
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo enviar el mensaje.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-messages-updated"));
  }
}

export async function markConversationAsRead(
  senderId: string,
  recipientId: string,
  token: string
) {
  const response = await authedRouteRequest("/api/private-messages", {
    method: "PATCH",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({
      sender_id: senderId,
      recipient_id: recipientId
    })
  });

  const payload = await parseJsonPayload<{
    error?: string;
  }>(response);

  if (!response.ok) {
    throw new Error(
      payload?.error || "No se pudo marcar la conversación como leída."
    );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sr-messages-updated"));
  }
}

export async function fetchExternalTournaments() {
  return rest<any[]>(
    "external_tournaments?select=id,title,platform,event_date,location,url,notes,is_active,created_at&is_active=eq.true&order=event_date.asc.nullslast,created_at.desc"
  );
}

export async function fetchLiveStream() {
  const payload = await fetchLiveCenterStatus();
  return payload.stream;
}

export async function fetchLiveStreamStatus() {
  return fetchLiveCenterStatus();
}

export async function fetchLiveCenterStatus() {
  const response = await fetch("/api/live-stream", {
    method: "GET",
    cache: "no-store"
  });

  const payload = await parseJsonPayload<{
    error?: string;
    courts?: LiveCourtState[];
    stream?: LiveStreamConfig | null;
    scoreboard?: LiveScoreboard | null;
    unavailable?: boolean;
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo cargar la transmisión.");
  }

  return {
    courts: payload?.courts || [],
    stream: payload?.stream || null,
    scoreboard: payload?.scoreboard || null,
    unavailable: payload?.unavailable === true
  };
}

export async function fetchAdminLiveStream(token: string) {
  const response = await authedRouteRequest("/api/admin/live-stream", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    courts?: AdminLiveCourtState[];
  }>(response);

  if (!response.ok) {
    throw new Error(
      payload?.error || "No se pudo cargar la configuración del vivo."
    );
  }

  return {
    courts: payload?.courts || []
  };
}

export async function updateLiveStream(
  token: string,
  payload: {
    court_id: LiveCourtId;
    title: string;
    description?: string | null;
    banner_url?: string | null;
    youtube_url: string;
    starts_at?: string | null;
    scoreboard_delay_seconds?: number;
    is_live: boolean;
    tournament_software_post_url?: string | null;
  }
) {
  const response = await authedRouteRequest("/api/admin/live-stream", {
    method: "PATCH",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const result = await parseJsonPayload<{
    error?: string;
    court?: AdminLiveCourtState | null;
    courts?: AdminLiveCourtState[];
  }>(response);

  if (!response.ok) {
    throw new Error(
      result?.error || "No se pudo guardar la transmisión en vivo."
    );
  }

  return {
    court: result?.court || null,
    courts: result?.courts || []
  };
}

export async function clearLiveStreamLegacy(token: string) {
  const response = await authedRouteRequest("/api/admin/live-stream", {
    method: "DELETE",
    token
  });

  const result = await parseJsonPayload<{
    error?: string;
  }>(response);

  if (!response.ok) {
    throw new Error(result?.error || "No se pudo limpiar la transmisión.");
  }
}

export async function clearLiveStream(token: string, courtId: LiveCourtId) {
  const response = await authedRouteRequest(
    `/api/admin/live-stream?court_id=${encodeURIComponent(courtId)}`,
    {
      method: "DELETE",
      token
    }
  );

  const result = await parseJsonPayload<{
    error?: string;
    courts?: AdminLiveCourtState[];
  }>(response);

  if (!response.ok) {
    throw new Error(result?.error || "No se pudo limpiar la transmision.");
  }

  return {
    courts: result?.courts || []
  };
}

export async function fetchLivePlayerMappings(token: string) {
  const response = await authedRouteRequest("/api/admin/live-stream/player-mappings", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    mappings?: LivePlayerMapping[];
  }>(response);

  if (!response.ok) {
    throw new Error(
      payload?.error || "No se pudieron cargar las vinculaciones manuales."
    );
  }

  return payload?.mappings || [];
}

export async function upsertLivePlayerMapping(
  token: string,
  payload: {
    id?: string | null;
    squore_name?: string;
    squore_names?: string[];
    profile_id: string;
  }
) {
  const response = await authedRouteRequest("/api/admin/live-stream/player-mappings", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const result = await parseJsonPayload<{
    error?: string;
    mapping?: LivePlayerMapping | null;
    mappings?: LivePlayerMapping[];
    saved_count?: number;
  }>(response);

  if (!response.ok) {
    throw new Error(result?.error || "No se pudo guardar la vinculacion.");
  }

  return {
    mapping: result?.mapping || null,
    mappings: result?.mappings || [],
    saved_count: result?.saved_count || 0
  };
}

export async function deleteLivePlayerMapping(token: string, id: string) {
  const response = await authedRouteRequest("/api/admin/live-stream/player-mappings", {
    method: "DELETE",
    token,
    requireJsonContentType: true,
    body: JSON.stringify({ id })
  });

  const result = await parseJsonPayload<{
    error?: string;
    mappings?: LivePlayerMapping[];
  }>(response);

  if (!response.ok) {
    throw new Error(result?.error || "No se pudo borrar la vinculacion.");
  }

  return result?.mappings || [];
}

export async function fetchAdminExternalTournaments(token: string) {
  const response = await authedRouteRequest("/api/admin/external-tournaments", {
    method: "GET",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as any[] | { error?: string })
    : [];

  if (!response.ok) {
    const error = !Array.isArray(payload) ? payload.error : undefined;
    throw new Error(error || "No se pudieron cargar los torneos externos.");
  }

  return payload as any[];
}

export async function fetchAdminAuditLogs(token: string) {
  const response = await authedRouteRequest("/api/admin/audit-logs", {
    method: "GET",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as { error?: string; logs?: any[]; enabled?: boolean })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar la auditoría admin.");
  }

  return {
    logs: payload.logs || [],
    enabled: payload.enabled !== false
  };
}

export async function createExternalTournament(
  token: string,
  payload: {
    title: string;
    platform: string;
    event_date?: string | null;
    location?: string | null;
    url: string;
    notes?: string | null;
    is_active?: boolean;
  }
) {
  const response = await authedRouteRequest("/api/admin/external-tournaments", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string; tournament?: any })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo crear el torneo externo.");
  }

  return data.tournament;
}

export async function updateExternalTournament(
  tournamentId: string,
  token: string,
  payload: {
    title?: string;
    platform?: string;
    event_date?: string | null;
    location?: string | null;
    url?: string;
    notes?: string | null;
    is_active?: boolean;
  }
) {
  const response = await authedRouteRequest(
    `/api/admin/external-tournaments/${tournamentId}`,
    {
    method: "PATCH",
      token,
      requireJsonContentType: true,
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string; tournament?: any })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo actualizar el torneo externo.");
  }

  return data.tournament;
}

export async function deleteExternalTournament(
  tournamentId: string,
  token: string
) {
  const response = await authedRouteRequest(
    `/api/admin/external-tournaments/${tournamentId}`,
    {
      method: "DELETE",
      token
    }
  );

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo borrar el torneo externo.");
  }
}

export async function fetchCasualMatches(token: string) {
  const response = await authedRouteRequest("/api/casual-matches", {
    method: "GET",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as {
        error?: string;
        matches?: any[];
        unavailable?: boolean;
      })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar los partidos.");
  }

  return {
    matches: payload.matches || [],
    unavailable: payload.unavailable === true
  };
}

export async function fetchAllCasualMatches(token: string) {
  const response = await authedRouteRequest("/api/casual-matches?scope=all", {
    method: "GET",
    token
  });

  const payload = await parseJsonPayload<{
    error?: string;
    matches?: any[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron cargar los partidos.");
  }

  return payload?.matches || [];
}

export async function createCasualMatch(
  token: string,
  payload: {
    opponent_id: string;
    played_on: string;
    location?: string | null;
    score_self: number;
    score_opponent: number;
    notes?: string | null;
  }
) {
  const response = await authedRouteRequest("/api/casual-matches", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string; match?: any })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo guardar el partido.");
  }

  return data.match;
}

export async function updateCasualMatch(
  matchId: string,
  token: string,
  payload: {
    played_on: string;
    location?: string | null;
    score_self: number;
    score_opponent: number;
    notes?: string | null;
  }
) {
  const response = await authedRouteRequest(`/api/casual-matches/${matchId}`, {
    method: "PATCH",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string; match?: any })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo actualizar el partido.");
  }

  return data.match;
}

export async function deleteCasualMatch(matchId: string, token: string) {
  const response = await authedRouteRequest(`/api/casual-matches/${matchId}`, {
    method: "DELETE",
    token
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo borrar el partido.");
  }
}

export async function confirmCasualMatch(
  matchId: string,
  token: string,
  payload: {
    action: "confirm" | "review";
    note?: string | null;
  }
) {
  const response = await authedRouteRequest(
    `/api/casual-matches/${matchId}/confirm`,
    {
      method: "POST",
      token,
      requireJsonContentType: true,
      body: JSON.stringify(payload)
    }
  );

  const result = await parseJsonPayload<{
    error?: string;
    confirmation?: any;
  }>(response);

  if (!response.ok) {
    throw new Error(result?.error || "No se pudo actualizar la confirmacion.");
  }

  return result?.confirmation || null;
}

export async function fetchMatchAvailability(token: string) {
  const response = await authedRouteRequest("/api/match-availability", {
    method: "GET",
    token
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as {
        error?: string;
        requests?: any[];
        currentRequest?: any | null;
        unavailable?: boolean;
      })
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar quién busca partido.");
  }

  return {
    requests: payload.requests || [],
    currentRequest: payload.currentRequest || null,
    unavailable: payload.unavailable === true
  };
}

export async function activateMatchAvailability(
  token: string,
  payload?: { notes?: string | null }
) {
  const response = await authedRouteRequest("/api/match-availability", {
    method: "POST",
    token,
    requireJsonContentType: true,
    body: JSON.stringify(payload || {})
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string; request?: any })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo activar la búsqueda de partido.");
  }

  return data.request;
}

export async function deactivateMatchAvailability(token: string) {
  const response = await authedRouteRequest("/api/match-availability", {
    method: "DELETE",
    token
  });

  const text = await response.text();
  const data = text.trim()
    ? (JSON.parse(text) as { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(data.error || "No se pudo desactivar la búsqueda de partido.");
  }
}
