import { NextRequest, NextResponse } from "next/server";
import {
  acknowledgeBeginnerRules,
  getBeginnerRulesStatus
} from "@/lib/beginner-rules";
import { requireAuthenticatedRequest } from "@/lib/server-auth";

function noStoreJson(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Vary: "Authorization, Cookie"
    }
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return noStoreJson({ error: auth.error }, auth.status);
  }

  try {
    const status = await getBeginnerRulesStatus(
      auth.supabaseUrl,
      auth.serviceRoleKey,
      auth.user.id
    );

    return noStoreJson({
      required: status.required,
      category: status.category,
      acknowledged_at: status.acknowledgedAt
    });
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el estado del reglamento."
      },
      400
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return noStoreJson({ error: auth.error }, auth.status);
  }

  try {
    const status = await acknowledgeBeginnerRules(
      auth.supabaseUrl,
      auth.serviceRoleKey,
      auth.user.id
    );

    return noStoreJson({
      ok: true,
      required: status.required,
      category: status.category,
      acknowledged_at: status.acknowledgedAt
    });
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo confirmar la lectura del reglamento."
      },
      400
    );
  }
}
