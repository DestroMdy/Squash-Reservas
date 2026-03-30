"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import {
  clearPostSignupRedirect,
  getPostSignupRedirect
} from "@/lib/post-signup-redirect";
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

    function applyPendingPostSignupRedirect() {
      const pendingRedirect = getPostSignupRedirect();
      if (!pendingRedirect || typeof window === "undefined") {
        return false;
      }

      const currentUrl = `${window.location.pathname}${window.location.search}`;

      if (currentUrl === pendingRedirect) {
        clearPostSignupRedirect();
        return false;
      }

      window.location.replace(pendingRedirect);
      return true;
    }

    async function bootstrap() {
      const existingSession = getSession();
      if (existingSession?.access_token || !hasUserCookie()) {
        if (existingSession?.access_token && applyPendingPostSignupRedirect()) {
          return;
        }

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
        if (applyPendingPostSignupRedirect()) {
          return;
        }

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
