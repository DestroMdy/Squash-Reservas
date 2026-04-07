"use client";

import { useEffect, useState } from "react";
import {
  dismissPushPrompt,
  ensurePushSubscription,
  getPushStatusFlag,
  isPushPromptDismissed,
  isPushSupported,
  PUSH_STATUS_EVENT,
  requestPushPermissionAndSubscribe
} from "@/lib/push-client";
import { getSession } from "@/lib/supabase";

export function PushNotificationsManager() {
  const [authenticated, setAuthenticated] = useState(false);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncAuth = () => {
      setAuthenticated(Boolean(getSession()?.user?.id));
    };

    syncAuth();
    window.addEventListener("sr-auth-change", syncAuth);

    return () => {
      window.removeEventListener("sr-auth-change", syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setAvailable(false);
      setEnabled(false);
      setPermission("unsupported");
      setDismissed(false);
      setError(null);
      return;
    }

    if (!isPushSupported()) {
      setAvailable(false);
      setEnabled(false);
      setPermission("unsupported");
      setDismissed(false);
      return;
    }

    let cancelled = false;

    const syncStatus = () => {
      if (cancelled) {
        return;
      }

      setEnabled(getPushStatusFlag());
      setPermission(Notification.permission);
      setDismissed(isPushPromptDismissed());
    };

    async function bootstrap() {
      syncStatus();

      try {
        const result = await ensurePushSubscription();

        if (cancelled) {
          return;
        }

        setAvailable(result.available);
        setEnabled(result.enabled);
        setPermission(result.permission);
        setDismissed(isPushPromptDismissed());
      } catch {
        if (cancelled) {
          return;
        }

        setAvailable(false);
        setEnabled(false);
      }
    }

    void bootstrap();
    window.addEventListener(PUSH_STATUS_EVENT, syncStatus);

    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_STATUS_EVENT, syncStatus);
    };
  }, [authenticated]);

  async function handleEnable() {
    try {
      setLoading(true);
      setError(null);

      const result = await requestPushPermissionAndSubscribe();
      setAvailable(result.available);
      setEnabled(result.enabled);
      setPermission(result.permission);
      setDismissed(isPushPromptDismissed());

      if (!result.enabled && result.permission === "denied") {
        setError(
          "Las notificaciones quedaron bloqueadas en este dispositivo. Puedes reactivarlas desde la configuracion del navegador o del sistema."
        );
      }
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "No pudimos activar las notificaciones en este dispositivo."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    dismissPushPrompt();
    setDismissed(true);
  }

  if (
    !authenticated ||
    enabled ||
    !available ||
    permission === "denied" ||
    permission === "unsupported" ||
    dismissed
  ) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-950/95 p-4 text-white shadow-2xl shadow-slate-900/30 backdrop-blur">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
        Notificaciones
      </p>
      <h2 className="mt-2 text-lg font-semibold text-white">
        Activá avisos en tu celular
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-200">
        Podemos avisarte por mensaje nuevo, turno liberado y reservas desde la
        barra superior del teléfono.
      </p>
      {error ? (
        <p className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          onClick={handleDismiss}
          disabled={loading}
        >
          Ahora no
        </button>
        <button
          type="button"
          className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleEnable}
          disabled={loading}
        >
          {loading ? "Activando..." : "Activar"}
        </button>
      </div>
    </div>
  );
}
