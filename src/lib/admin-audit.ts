export type AdminAuditAction =
  | "booking.updated"
  | "profile.updated"
  | "profile.avatar.updated"
  | "profile.avatar.deleted"
  | "profile.deleted"
  | "profile.promoted"
  | "external_tournament.created"
  | "external_tournament.updated"
  | "external_tournament.deleted"
  | "schedule.override.updated"
  | "schedule.override.cleared"
  | "booking.availability.updated"
  | "live_stream.updated"
  | "live_stream.deleted"
  | "live_stream.player_mapping_upserted"
  | "live_stream.player_mapping_deleted";

export type AdminAuditLogPayload = {
  actorId: string;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown> | null;
};

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

export function isMissingAuditTableError(errorText: string) {
  return (
    errorText.includes("admin_audit_logs") &&
    (errorText.includes("does not exist") ||
      errorText.includes("relation") ||
      errorText.includes("schema cache"))
  );
}

export async function logAdminAudit(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: AdminAuditLogPayload
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/admin_audit_logs`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      actor_id: payload.actorId,
      action: payload.action,
      target_type: payload.targetType,
      target_id: payload.targetId,
      details: payload.details ?? {}
    })
  });

  if (response.ok) {
    return { ok: true as const, enabled: true as const };
  }

  const errorText = await response.text();

  if (isMissingAuditTableError(errorText)) {
    return { ok: false as const, enabled: false as const };
  }

  throw new Error(errorText || "No se pudo registrar la auditoría admin.");
}
