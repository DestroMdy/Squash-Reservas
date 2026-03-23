import { NextResponse } from "next/server";
import {
  getStoredLiveCenterCourts,
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
    const courts = (await getStoredLiveCenterCourts()).map((court) => ({
      ...court,
      stream: toPublicLiveStreamConfig(court.stream)
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
