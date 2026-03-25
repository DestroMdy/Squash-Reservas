import { NextResponse } from "next/server";
import { fetchProfilesForLiveAvatars } from "@/lib/live-avatar-profiles";
import { attachLiveScoreboardAvatars } from "@/lib/live-score";
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
    const [storedCourts, profiles, mappings] = await Promise.all([
      getStoredLiveCenterCourts(),
      fetchProfilesForLiveAvatars().catch(() => []),
      getStoredLivePlayerMappings().catch(() => [])
    ]);

    const courts = storedCourts.map((court) => ({
      ...court,
      stream: toPublicLiveStreamConfig(court.stream),
      scoreboard: court.scoreboard
        ? attachLiveScoreboardAvatars(court.scoreboard, profiles, mappings)
        : null
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
