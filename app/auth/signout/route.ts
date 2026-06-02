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
  return NextResponse.redirect(new URL("/", req.url));
}

export const POST = handler;
export const GET = handler;
