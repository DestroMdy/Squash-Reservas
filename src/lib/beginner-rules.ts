import "server-only";
import {
  clearBeginnerRulesAcknowledgedAt,
  getBeginnerRulesAcknowledgedAt,
  setBeginnerRulesAcknowledgedAt
} from "@/lib/beginner-rules-store";
import { adminHeaders } from "@/lib/server-auth";

export function isBeginnerCategory(category: string | null | undefined) {
  return category?.trim().toLowerCase() === "principiante";
}

export async function fetchUserProfileStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=category,role&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<{
    category?: string | null;
    role?: string | null;
  }>;

  if (!response.ok) {
    throw new Error("No se pudo cargar el estado del perfil.");
  }

  return {
    category: rows[0]?.category ?? null,
    role: rows[0]?.role ?? null
  };
}

export async function getBeginnerRulesStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const [profile, storedAcknowledgedAt] = await Promise.all([
    fetchUserProfileStatus(supabaseUrl, serviceRoleKey, userId),
    getBeginnerRulesAcknowledgedAt(userId)
  ]);

  const isBeginner = isBeginnerCategory(profile.category);
  let acknowledgedAt = storedAcknowledgedAt;

  if (profile.role === "admin" && !isBeginner && acknowledgedAt) {
    await clearBeginnerRulesAcknowledgedAt(userId);
    acknowledgedAt = null;
  }

  return {
    category: profile.category,
    role: profile.role,
    acknowledgedAt,
    required: isBeginner && !acknowledgedAt,
    alwaysShow: false
  };
}

export async function acknowledgeBeginnerRules(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const profile = await fetchUserProfileStatus(
    supabaseUrl,
    serviceRoleKey,
    userId
  );

  if (!isBeginnerCategory(profile.category)) {
    return {
      category: profile.category,
      role: profile.role,
      acknowledgedAt: null,
      required: false,
      alwaysShow: false
    };
  }

  const acknowledgedAt = await setBeginnerRulesAcknowledgedAt(userId);

  return {
    category: profile.category,
    role: profile.role,
    acknowledgedAt,
    required: false,
    alwaysShow: false
  };
}
