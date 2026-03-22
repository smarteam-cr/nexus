import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  const secret = process.env.CONSULTANT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Servidor no configurado" },
      { status: 500 }
    );
  }

  if (password !== secret) {
    return NextResponse.json(
      { error: "Contraseña incorrecta" },
      { status: 401 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set("consultant_session", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });

  return NextResponse.json({ ok: true });
}
