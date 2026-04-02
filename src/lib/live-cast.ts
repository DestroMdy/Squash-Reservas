"use client";

import { LiveCourtId } from "@/types/db";

const GOOGLE_CAST_NAMESPACE = "urn:x-cast:com.lamartineta.squash.live";
const GOOGLE_CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: {
      framework?: {
        CastContextEventType?: {
          SESSION_STATE_CHANGED?: string;
        };
        SessionState?: {
          SESSION_STARTED?: string;
          SESSION_RESUMED?: string;
        };
        CastContext: {
          getInstance(): {
            setOptions(options: {
              receiverApplicationId: string;
              autoJoinPolicy?: string;
              resumeSavedSession?: boolean;
            }): void;
            getCurrentSession(): {
              sendMessage(
                namespace: string,
                data: Record<string, unknown>
              ): Promise<void>;
            } | null;
            addEventListener(
              eventType: string,
              listener: (event: { sessionState?: string }) => void
            ): void;
            removeEventListener?: (
              eventType: string,
              listener: (event: { sessionState?: string }) => void
            ) => void;
          };
        };
      };
    };
    chrome?: {
      cast?: {
        AutoJoinPolicy?: {
          ORIGIN_SCOPED?: string;
        };
      };
    };
  }
}

let castSdkPromise: Promise<void> | null = null;
let castConfiguredAppId: string | null = null;

function mapCastError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudo iniciar Google Cast.";
}

export async function loadGoogleCastSdk() {
  if (typeof window === "undefined") {
    throw new Error("Google Cast solo esta disponible en el navegador.");
  }

  if (window.cast?.framework && window.chrome?.cast) {
    return;
  }

  if (!castSdkPromise) {
    castSdkPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src="${GOOGLE_CAST_SDK_URL}"]`
      );

      const handleAvailable = (isAvailable: boolean) => {
        if (isAvailable && window.cast?.framework && window.chrome?.cast) {
          resolve();
          return;
        }

        reject(new Error("Google Cast no esta disponible en este dispositivo."));
      };

      window.__onGCastApiAvailable = handleAvailable;

      if (existingScript) {
        return;
      }

      const script = document.createElement("script");
      script.src = GOOGLE_CAST_SDK_URL;
      script.async = true;
      script.onerror = () =>
        reject(new Error("No se pudo cargar el SDK de Google Cast."));
      document.head.appendChild(script);
    }).catch((error) => {
      castSdkPromise = null;
      throw error;
    });
  }

  return castSdkPromise;
}

export async function waitForGoogleCastLauncher() {
  if (typeof window === "undefined" || !window.customElements) {
    return;
  }

  if (window.customElements.get("google-cast-launcher")) {
    return;
  }

  await window.customElements.whenDefined("google-cast-launcher");
}

export async function initializeGoogleCast(appId: string) {
  if (!appId.trim()) {
    return false;
  }

  await loadGoogleCastSdk();

  const castContext = window.cast?.framework?.CastContext.getInstance();
  const autoJoinPolicy =
    window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED || undefined;

  if (!castContext) {
    throw new Error("Google Cast no esta disponible en este navegador.");
  }

  if (castConfiguredAppId === appId.trim()) {
    return true;
  }

  castContext.setOptions({
    receiverApplicationId: appId.trim(),
    autoJoinPolicy,
    resumeSavedSession: true
  });

  castConfiguredAppId = appId.trim();
  return true;
}

export function getGoogleCastContext() {
  return window.cast?.framework?.CastContext.getInstance() || null;
}

export function getGoogleCastSession() {
  return getGoogleCastContext()?.getCurrentSession() || null;
}

export function subscribeToGoogleCastSessionChanges(
  listener: (event: { sessionState?: string; hasActiveSession: boolean }) => void
) {
  const castContext = getGoogleCastContext();
  const eventType =
    window.cast?.framework?.CastContextEventType?.SESSION_STATE_CHANGED;

  if (!castContext || !eventType) {
    return () => {};
  }

  const handler = (event: { sessionState?: string }) => {
    listener({
      sessionState: event?.sessionState,
      hasActiveSession: Boolean(castContext.getCurrentSession())
    });
  };

  castContext.addEventListener(eventType, handler);

  return () => {
    castContext.removeEventListener?.(eventType, handler);
  };
}

export function isGoogleCastSessionReady(event?: { sessionState?: string }) {
  const sessionState = event?.sessionState;
  const startedState = window.cast?.framework?.SessionState?.SESSION_STARTED;
  const resumedState = window.cast?.framework?.SessionState?.SESSION_RESUMED;

  return sessionState === startedState || sessionState === resumedState;
}

export async function sendLiveCourtToCastSession({
  courtId,
  courtLabel,
  title
}: {
  courtId: LiveCourtId;
  courtLabel: string;
  title: string;
}) {
  try {
    const session = getGoogleCastSession();

    if (!session) {
      throw new Error(
        "No hay una sesion activa de Google Cast."
      );
    }

    await session.sendMessage(GOOGLE_CAST_NAMESPACE, {
      type: "load_court",
      courtId,
      courtLabel,
      title,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    throw new Error(mapCastError(error));
  }
}

export { GOOGLE_CAST_NAMESPACE };
