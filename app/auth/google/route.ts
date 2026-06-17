/**
 * GET /auth/google
 *
 * Inicia el flujo OAuth de Google vía Supabase Auth. Redirige al usuario al
 * consent screen de Google. Cuando vuelve, aterriza en /auth/callback.
 *
 * El filtrado por dominio (@smarteamcr.com) y por TeamMember existente
 * sucede DESPUÉS, en el callback (no acá, porque no sabemos el email del
 * usuario hasta que Google nos lo devuelva).
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  // En producción (detrás de proxy/Docker) `req.url` suele resolver a
  // localhost:3004 → el OAuth volvería a localhost. Usamos APP_URL (URL pública)
  // y caemos al origin del request solo si APP_URL no está seteada (dev local).
  const origin = new URL(req.url).origin;
  const baseUrl = process.env.APP_URL || origin;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${baseUrl}/auth/callback`,
      queryParams: {
        // hd hint le pide a Google que prefiera cuentas del dominio Smarteam
        // (no es un filtro duro — el filtro real está en el callback).
        hd: "smarteamcr.com",
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data?.url) {
    console.error("[/auth/google] Error iniciando OAuth:", error);
    return NextResponse.redirect(new URL("/?error=oauth_init", req.url));
  }

  return NextResponse.redirect(data.url);
}
