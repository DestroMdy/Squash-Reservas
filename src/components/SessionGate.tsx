"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import { refreshSessionFromCookie, getSession, clearSession } from "@/lib/supabase";
import { USER_COOKIE_NAME } from "@/lib/session-cookies";

function hasUserCookie() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie.split("; ").some((entry) => entry.startsWith(`${USER_COOKIE_NAME}=`));
}

export function SessionGate({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const existingSession = getSession();
      if (existingSession?.access_token || !hasUserCookie()) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }

      try {
        await refreshSessionFromCookie();
      } catch {
        clearSession();
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-slate-600">
        Cargando sesión...
      </div>
    );
  }

  return <>{children}</>;
}
