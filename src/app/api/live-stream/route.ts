import { NextResponse } from "next/server";
import { fetchProfilesForLiveAvatars } from "@/lib/live-avatar-profiles";
import { getStoredLiveCenterCommentsMap } from "@/lib/live-comments-store";
import { attachLiveScoreboardAvatars } from "@/lib/live-score";
import { fetchSquoreMqttSnapshot } from "@/lib/live-squore-mqtt-server";
import {
  getStoredLiveCenterCourts,
  getStoredLivePlayerMappings,
  isLiveStreamStoreConfigured
} from "@/lib/live-stream-store";
import { getPrimaryLiveCourt, toPublicLiveStreamConfig } from "@/lib/live-stream";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache"
  };
}

export async function GET() {
  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { courts: [], stream: null, scoreboard: null, unavailable: true },
      {
        status: 200,
        headers: responseHeaders()
      }
    );
  }

  try {
    const [storedCourts, profiles, mappings, commentsMap] = await Promise.all([
      getStoredLiveCenterCourts(),
      fetchProfilesForLiveAvatars().catch(() => []),
      getStoredLivePlayerMappings().catch(() => []),
      getStoredLiveCenterCommentsMap().catch(() => ({
        "court-1": [],
        "court-2": []
      }))
    ]);

    const mqttSnapshots = await Promise.all(
      storedCourts.map(async (court) => {
        if (!court.stream) {
          return null;
        }

        return fetchSquoreMqttSnapshot(court.stream).catch(() => null);
      })
    );

    const courts = storedCourts.map((court, index) => ({
      ...court,
      stream: toPublicLiveStreamConfig(court.stream),
      scoreboard: mqttSnapshots[index]
        ? attachLiveScoreboardAvatars(mqttSnapshots[index], profiles, mappings)
        : court.scoreboard
          ? attachLiveScoreboardAvatars(court.scoreboard, profiles, mappings)
          : null,
      comments: commentsMap[court.id] || []
    }));
    const primaryCourt = getPrimaryLiveCourt(courts);

    return NextResponse.json(
      {
        courts,
        stream: primaryCourt?.stream || null,
        scoreboard: primaryCourt?.scoreboard || null,
        unavailable: false
      },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { courts: [], stream: null, scoreboard: null, unavailable: true },
      {
        status: 200,
        headers: responseHeaders()
      }
    );
  }
}
