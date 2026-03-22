import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

const STATUS_QUERY = `{
  user {
    user_id
    email
    name
  }
}`;

export const GET = withAuth(async () => {

  const apiKey = process.env.FIREFLIES_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ connected: false, reason: "no_key" });
  }

  try {
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: STATUS_QUERY }),
      // No cachear — siempre verificar en tiempo real
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ connected: false, reason: "invalid_key" });
    }

    const data = (await res.json()) as {
      data?: { user?: { user_id: string; email: string; name: string } };
      errors?: unknown[];
    };

    if (data.errors || !data.data?.user) {
      return NextResponse.json({ connected: false, reason: "invalid_key" });
    }

    return NextResponse.json({
      connected: true,
      user: {
        id: data.data.user.user_id,
        email: data.data.user.email,
        name: data.data.user.name,
      },
    });
  } catch {
    return NextResponse.json({ connected: false, reason: "network_error" });
  }
});
