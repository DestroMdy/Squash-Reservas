import { NextRequest } from "next/server";
import { handleSquorePost } from "@/lib/live-squore-handler";

export async function POST(request: NextRequest) {
  return handleSquorePost(request);
}
