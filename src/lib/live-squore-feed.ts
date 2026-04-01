import { normalizeSquoreRecentMatch } from "@/lib/live-score";
import { LiveScoreboard } from "@/types/db";

type SquoreRecentMatch = Record<string, unknown>;
type SquoreRecentMatchesPayload = {
  Count?: number;
  Files?: SquoreRecentMatch[];
};

function buildAfterValue(startsAt?: string | null) {
  const now = new Date();
  const baseDate = startsAt ? new Date(startsAt) : now;
  const effectiveDate = Number.isNaN(baseDate.getTime()) ? now : baseDate;
  effectiveDate.setDate(effectiveDate.getDate() - 1);
  const year = effectiveDate.getFullYear();
  const month = String(effectiveDate.getMonth() + 1).padStart(2, "0");
  const day = String(effectiveDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}-000001`;
}

function getMatchSortValue(match: SquoreRecentMatch) {
  const ts = typeof match.ts === "string" ? match.ts : "";
  if (ts) {
    return ts;
  }

  const date = typeof match.date === "string" ? match.date.replaceAll("-", "") : "";
  const time = typeof match.time === "string" ? match.time.replaceAll(":", "") : "";
  return `${date}${time}`;
}

function pickLatestMatch(
  payload: SquoreRecentMatchesPayload,
  deviceId: string
) {
  const matches = Array.isArray(payload.Files) ? payload.Files : [];
  const normalizedDeviceId = deviceId.trim().toLowerCase();

  return [...matches]
    .filter((match) => {
      const liveScoreDeviceId =
        typeof match.liveScoreDeviceId === "string"
          ? match.liveScoreDeviceId.trim().toLowerCase()
          : "";
      return !normalizedDeviceId || liveScoreDeviceId === normalizedDeviceId;
    })
    .sort((left, right) =>
      getMatchSortValue(right).localeCompare(getMatchSortValue(left), "en")
    )[0] || null;
}

function loadJsonp<T>(urlBuilder: (callbackName: string) => string) {
  return new Promise<T>((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("JSONP solo esta disponible en el navegador."));
      return;
    }

    const jsonpWindow = window as unknown as Window & Record<string, unknown>;
    const callbackName = `__srSquoreFeed${Date.now()}${Math.random()
      .toString(36)
      .slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Squore no respondio a tiempo."));
    }, 8000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.remove();
      delete jsonpWindow[callbackName];
    }

    jsonpWindow[callbackName] = (payload: T) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo cargar el feed de Squore."));
    };
    script.src = urlBuilder(callbackName);
    script.async = true;

    document.body.appendChild(script);
  });
}

export async function fetchLatestSquoreFeedScoreboard(
  deviceId: string,
  startsAt?: string | null
) {
  if (!deviceId.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    after: buildAfterValue(startsAt),
    deviceIdFilter: deviceId.trim(),
    _: String(Date.now()),
    v: "1"
  });
  const payload = await loadJsonp<SquoreRecentMatchesPayload>((callbackName) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("callback", callbackName);
    return `https://squore.double-yellow.be/recent.matches.json.php?${nextParams.toString()}`;
  }).catch(() => null);

  if (!payload) {
    return null;
  }

  const latestMatch = pickLatestMatch(payload, deviceId);
  return latestMatch ? normalizeSquoreRecentMatch(latestMatch) : null;
}

export async function hydrateCourtsWithSquoreFeed<
  T extends {
    stream: { squore_device_id: string | null; starts_at: string | null } | null;
    scoreboard: LiveScoreboard | null;
  }
>(courts: T[]) {
  const hydratedCourts = await Promise.all(
    courts.map(async (court) => {
      const deviceId = court.stream?.squore_device_id;

      if (!deviceId) {
        return court;
      }

      const feedScoreboard = await fetchLatestSquoreFeedScoreboard(
        deviceId,
        court.stream?.starts_at
      ).catch(() => null);

      return {
        ...court,
        scoreboard: feedScoreboard || court.scoreboard
      };
    })
  );

  return hydratedCourts;
}
