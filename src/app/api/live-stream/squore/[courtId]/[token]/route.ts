import { NextRequest } from "next/server";
import { handleSquorePost } from "@/lib/live-squore-handler";

export async function POST(
  request: NextRequest,
  { params }: { params: { courtId: string; token: string } }
) {
  return handleSquorePost(request, params);
}
