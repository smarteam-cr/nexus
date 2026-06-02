/**
 * GET /auth/callback
 *
 * Recibe el code de Supabase OAuth tras volver de Google. Hace el exchange
 * por sesión Supabase y luego aplica DOS filtros duros:
 *
 *   1. Email termina en @smarteamcr.com (dominio único permitido).
 *   2. Existe un AppUser INTERNAL con ese email (TeamMember registrado).
 *
 * Si pasa los filtros, vincula auth.users.id al AppUser (primer login),
 * y redirige a /clients. Si falla, hace signOut y redirige a / con un
 * mensaje de error en query string.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";

const ALLOWED_DOMAIN = "@smarteamcr.com";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/?error=oauth_no_code", req.url));
  }

  const supabase = await createSupabaseServerClient();

  // 1. Exchange code → session (Supabase setea cookies automáticamente)
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[/auth/callback] Exchange failed:", exchangeError);
    return NextResponse.redirect(new URL("/?error=oauth_exchange", req.url));
  }

  // 2. Resolver el user que acaba de autenticarse
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?error=oauth_no_user", req.url));
  }

  const email = user.email.toLowerCase();

  // 3. Filtro: dominio Smarteam
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    console.warn(`[/auth/callback] Email fuera del dominio: ${email}`);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?error=domain", req.url));
  }

  // 4. Filtro: TeamMember existente (AppUser INTERNAL con ese email)
  const appUser = await prisma.appUser.findUnique({
    where: { email },
    select: { id: true, kind: true, authUserId: true },
  });

  if (!appUser || appUser.kind !== "INTERNAL") {
    console.warn(`[/auth/callback] No hay AppUser INTERNAL para ${email}`);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?error=not_member", req.url));
  }

  // 5. Primer login: vincular authUserId al AppUser
  if (!appUser.authUserId) {
    await prisma.appUser.update({
      where: { id: appUser.id },
      data: { authUserId: user.id },
    });
    console.log(`[/auth/callback] ✓ Vinculado authUserId al AppUser ${email}`);
  } else if (appUser.authUserId !== user.id) {
    // Caso raro: el AppUser ya estaba vinculado a OTRO auth.users.id.
    // Puede pasar si la persona se reinscribe con otra cuenta Google.
    // Actualizamos al nuevo id (la identidad es por email, no por auth id).
    await prisma.appUser.update({
      where: { id: appUser.id },
      data: { authUserId: user.id },
    });
    console.log(`[/auth/callback] ↻ Re-vinculado authUserId para ${email}`);
  }

  // 6. Bienvenida — al detalle de clientes (entry point estándar del CSE)
  return NextResponse.redirect(new URL("/clients", origin));
}
