/**
 * POST /auth/signout
 *
 * Cierra la sesión de Supabase Auth. Llamado desde el botón "Cerrar sesión"
 * en el avatar de la sidebar (que se construye en Fase E del plan).
 *
 * GET también funciona por compatibilidad con flujos de redirect directo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function handler(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Usar APP_URL (URL pública). Detrás de Docker, req.url resuelve al bind interno
  // (0.0.0.0:3004) y el logout mandaría a una URL inalcanzable. Fallback al origin en dev.
  const base = process.env.APP_URL || new URL(req.url).origin;
  return NextResponse.redirect(new URL("/", base));
}

export const POST = handler;
export const GET = handler;
