import { NextRequest } from "next/server";
import { REFRESH_COOKIE_NAME } from "@/lib/session-cookies";

type SupabaseUser = {
  id: string;
  email?: string;
};

export function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

type AuthenticatedContext = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  accessToken: string;
  user: SupabaseUser;
};

type AuthenticatedContextWithServiceRole = AuthenticatedContext & {
  serviceRoleKey: string;
};

type ErrorContext = {
  error: string;
  status: 401 | 403 | 503;
};

async function fetchUser(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
) {
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!userResponse.ok) {
    return null;
  }

  return (await userResponse.json()) as SupabaseUser;
}

async function exchangeRefreshToken(
  supabaseUrl: string,
  anonKey: string,
  refreshToken: string
) {
  const refreshResponse = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      }),
      cache: "no-store"
    }
  );

  if (!refreshResponse.ok) {
    return null;
  }

  const payload = (await refreshResponse.json()) as {
    access_token?: string;
    user?: SupabaseUser;
  };

  if (!payload.access_token) {
    return null;
  }

  return {
    accessToken: payload.access_token,
    user: payload.user
  };
}

export async function requireAuthenticatedRequest(
  request: NextRequest,
  options: {
    requireServiceRole: true;
  }
): Promise<AuthenticatedContextWithServiceRole | ErrorContext>;
export async function requireAuthenticatedRequest(
  request: NextRequest,
  options?: {
    requireServiceRole?: false;
  }
): Promise<AuthenticatedContext | ErrorContext>;
export async function requireAuthenticatedRequest(
  request: NextRequest,
  options?: {
    requireServiceRole?: boolean;
  }
): Promise<AuthenticatedContext | AuthenticatedContextWithServiceRole | ErrorContext> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || (options?.requireServiceRole && !serviceRoleKey)) {
    return { error: "Falta configuración de backend.", status: 503 };
  }

  const authHeader = request.headers.get("authorization");
  let accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : "";

  let user: SupabaseUser | null = null;

  if (accessToken) {
    user = await fetchUser(supabaseUrl, anonKey, accessToken);
  }

  if (!user) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      return { error: "No autenticado", status: 401 };
    }

    const refreshed = await exchangeRefreshToken(
      supabaseUrl,
      anonKey,
      refreshToken
    );

    if (!refreshed?.accessToken) {
      return { error: "Sesión inválida", status: 401 };
    }

    accessToken = refreshed.accessToken;
    user =
      refreshed.user ||
      (await fetchUser(supabaseUrl, anonKey, refreshed.accessToken));
  }

  if (!user) {
    return { error: "Sesión inválida", status: 401 };
  }

  const authenticatedContext: AuthenticatedContext = {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    accessToken,
    user
  };

  if (options?.requireServiceRole) {
    return {
      ...authenticatedContext,
      serviceRoleKey: serviceRoleKey as string
    };
  }

  return authenticatedContext;
}

export async function requireAdminRequest(
  request: NextRequest
): Promise<
  | (AuthenticatedContext & {
      serviceRoleKey: string;
    })
  | ErrorContext
> {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return auth;
  }

  const roleResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/profiles?select=role&id=eq.${auth.user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey as string),
      cache: "no-store"
    }
  );

  const roles = (await roleResponse.json()) as Array<{ role?: string }>;

  if (roles[0]?.role !== "admin") {
    return {
      error: "No tienes permisos de administrador.",
      status: 403
    };
  }

  return {
    ...auth,
    serviceRoleKey: auth.serviceRoleKey as string
  };
}
