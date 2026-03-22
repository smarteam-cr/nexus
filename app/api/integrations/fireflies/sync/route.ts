import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { syncFirefliesSessions } from "@/lib/fireflies/sync";

export const POST = withAuth(async () => {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return apiError("no_key", 503);

  const result = await syncFirefliesSessions();
  return NextResponse.json(result);
});
