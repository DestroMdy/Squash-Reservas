export interface SessionData {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: { id: string; email?: string };
}

type SupabaseErrorPayload = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
  error?: string;
};

const STORAGE_KEY = "sr_session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function headers(token?: string) {
  return {
    apikey: anonKey,
    Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  };
}

function normalizeSupabaseError(error: SupabaseErrorPayload | string | null | undefined) {
  if (!error) {
    return "Error en Supabase";
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error.code === "23505" ||
    error.message?.includes("bookings_time_slot_id_key")
  ) {
    return "El turno ya fue reservado por otro usuario.";
  }

  return error.error || error.message || "Error en Supabase";
}

export function getSession(): SessionData | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function setSession(session: SessionData | null) {
  if (typeof window === "undefined") return;

  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  window.dispatchEvent(new Event("sr-auth-change"));
}

export function clearSession() {
  setSession(null);
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
    debug?: {
      success?: boolean;
      action?: string | null;
      score?: number | null;
      hostname?: string | null;
      challenge_ts?: string | null;
      error_codes?: string[];
    };
  };

  if (!response.ok) {
    const debugMessage = data.debug
      ? ` debug=${JSON.stringify(data.debug)}`
      : "";
    throw new Error((data.error || "No se pudo registrar") + debugMessage);
  }
}

export async function requestPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/reset-password`
      : undefined;

  const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email,
      ...(redirectTo ? { redirect_to: redirectTo } : {})
    })
  });

  const data = (await response.json()) as {
    msg?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(data.error_description || data.msg || "No se pudo enviar el mail.");
  }
}

export async function updatePassword(accessToken: string, password: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: headers(accessToken),
    body: JSON.stringify({ password })
  });

  const data = (await response.json()) as { msg?: string; error_description?: string };

  if (!response.ok) {
    throw new Error(
      data.error_description || data.msg || "No se pudo actualizar la contraseña."
    );
  }
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password })
  });

  const data = (await response.json()) as SessionData & {
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(data.error_description || "No se pudo iniciar sesión");
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: headers(data.access_token)
  });

  const userData = userResponse.ok
    ? ((await userResponse.json()) as { id: string; email?: string })
    : undefined;

  setSession({
    ...data,
    user: userData
  });
}

export async function signOut() {
  const session = getSession();

  if (session?.access_token) {
    await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: headers(session.access_token)
    });
  }

  clearSession();
}

export async function getUser(token: string) {
  if (!token) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: headers(token)
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as { id: string; email?: string };
}

async function rest<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...headers(options?.token),
      ...(options?.headers || {})
    }
  });

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

    try {
      const parsedError = JSON.parse(errorBody) as SupabaseErrorPayload;
      throw new Error(normalizeSupabaseError(parsedError));
    } catch {
      throw new Error(normalizeSupabaseError(errorBody));
    }
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

export async function fetchSlotsByDate(date: string, token?: string) {
  return rest<any[]>(
    `time_slots?select=id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active),bookings(id,status,user_id,profiles(id,full_name,category))&slot_date=eq.${date}&order=start_time.asc`,
    token ? { token } : undefined
  );
}

export async function fetchMyBookings(userId: string, token: string) {
  return rest<any[]>(
    `bookings?select=id,user_id,court_id,time_slot_id,status,notes,created_at,time_slots(id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active)),courts(id,name,is_active)&user_id=eq.${userId}&order=created_at.desc`,
    { token }
  );
}

export async function fetchAllBookings(token: string) {
  return rest<any[]>(
    "bookings?select=id,user_id,court_id,time_slot_id,status,notes,created_at,profiles(id,full_name,category),time_slots(id,court_id,slot_date,start_time,end_time,status,price,created_at,courts(id,name,is_active)),courts(id,name,is_active)&order=created_at.desc",
    { token }
  );
}

export async function cancelBooking(bookingId: string, token: string) {
  await rest(`bookings?id=eq.${bookingId}&status=eq.confirmed`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status: "cancelled" }),
    headers: { Prefer: "return=minimal" }
  });
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
  await rest(`bookings?id=eq.${bookingId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
    headers: { Prefer: "return=minimal" }
  });
}

export async function fetchProfileRole(userId: string, token: string) {
  const data = await rest<any[]>(
    `profiles?select=role&id=eq.${userId}&limit=1`,
    { token }
  );
  return data[0]?.role as "admin" | "player" | undefined;
}

export async function fetchBookingStats(token: string) {
  const all = await rest<any[]>("bookings?select=id", { token });
  const confirmed = await rest<any[]>(
    "bookings?select=id&status=eq.confirmed",
    { token }
  );
  const cancelled = await rest<any[]>(
    "bookings?select=id&status=eq.cancelled",
    { token }
  );

  return {
    total: all.length,
    confirmed: confirmed.length,
    cancelled: cancelled.length
  };
}

export async function fetchLatestConfirmedBooking(token: string) {
  const data = await rest<any[]>(
    "bookings?select=id,created_at,status,time_slots(slot_date,start_time,end_time),courts(name)&status=eq.confirmed&order=created_at.desc&limit=1",
    { token }
  );

  return data[0];
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
  const data = await rest<any[]>(
    `profiles?select=id,full_name,phone,category,role&id=eq.${userId}&limit=1`,
    { token }
  );

  return data[0];
}

export async function updateProfile(
  userId: string,
  token: string,
  payload: {
    full_name?: string | null;
    phone?: string | null;
    category?: string | null;
  }
) {
  await rest(`profiles?id=eq.${userId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
    headers: { Prefer: "return=minimal" }
  });
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
  return rest<any[]>(
    "profiles?select=id,full_name,phone,category,role&order=category.asc,full_name.asc",
    { token }
  );
}
