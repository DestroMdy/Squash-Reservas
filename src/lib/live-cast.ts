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
            requestSession(): Promise<void>;
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

export async function castLiveCourtToTv({
  appId,
  courtId,
  courtLabel,
  title
}: {
  appId: string;
  courtId: LiveCourtId;
  courtLabel: string;
  title: string;
}) {
  if (!appId.trim()) {
    throw new Error(
      "Falta el App ID de Google Cast. Configuralo en Admin > Centro en vivo."
    );
  }

  try {
    await loadGoogleCastSdk();

    const castContext = window.cast?.framework?.CastContext.getInstance();
    const autoJoinPolicy =
      window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED || undefined;

    if (!castContext) {
      throw new Error("Google Cast no esta disponible en este navegador.");
    }

    castContext.setOptions({
      receiverApplicationId: appId.trim(),
      autoJoinPolicy,
      resumeSavedSession: true
    });

    let session = castContext.getCurrentSession();

    if (!session) {
      await castContext.requestSession();
      session = castContext.getCurrentSession();
    }

    if (!session) {
      throw new Error("No se pudo iniciar la sesion de Google Cast.");
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
