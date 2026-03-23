import { NextResponse } from "next/server";
import {
  getStoredLiveStream,
  isLiveStreamStoreConfigured
} from "@/lib/live-stream-store";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache"
  };
}

export async function GET() {
  if (!isLiveStreamStoreConfigured()) {
    return NextResponse.json(
      { stream: null, unavailable: true },
      {
        status: 200,
        headers: responseHeaders()
      }
    );
  }

  try {
    const stream = await getStoredLiveStream();

    return NextResponse.json(
      {
        stream,
        unavailable: false
      },
      {
        headers: responseHeaders()
      }
    );
  } catch {
    return NextResponse.json(
      { stream: null, unavailable: true },
      {
        status: 200,
        headers: responseHeaders()
      }
    );
  }
}
