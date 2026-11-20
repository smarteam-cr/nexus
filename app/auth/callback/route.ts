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
import { enmascararCorreo } from "@/lib/auth/enmascarar-correo";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { COOKIE_TRAS_LOGIN, destinoTrasLogin } from "@/lib/auth/destino-tras-login";

const ALLOWED_DOMAIN = "@smarteamcr.com";

/** Vuelve a la entrada con el error, y borra el destino guardado: un login fallido no deja una partida «pegada». */
function alInicioConError(codigo: string, req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL(`/?error=${codigo}`, req.url));
  res.cookies.delete(COOKIE_TRAS_LOGIN);
  return res;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return alInicioConError("oauth_no_code", req);
  }

  const supabase = await createSupabaseServerClient();

  // 1. Exchange code → session (Supabase setea cookies automáticamente)
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[/auth/callback] Exchange failed:", exchangeError);
    return alInicioConError("oauth_exchange", req);
  }

  // 2. Resolver el user que acaba de autenticarse
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    await supabase.auth.signOut();
    return alInicioConError("oauth_no_user", req);
  }

  const email = user.email.toLowerCase();

  // 3. Filtro: dominio Smarteam
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    // A-15: un intento fallido se loguea con el correo ENMASCARADO (dominio + una pista).
    console.warn(`[/auth/callback] Email fuera del dominio: ${enmascararCorreo(email)}`);
    await supabase.auth.signOut();
    return alInicioConError("domain", req);
  }

  // 4. Filtro: TeamMember existente (AppUser INTERNAL con ese email)
  const appUser = await prisma.appUser.findUnique({
    where: { email },
    select: {
      id: true,
      kind: true,
      authUserId: true,
      teamMember: { select: { deactivatedAt: true } },
    },
  });

  if (!appUser || appUser.kind !== "INTERNAL") {
    console.warn(`[/auth/callback] No hay AppUser INTERNAL para ${enmascararCorreo(email)}`);
    await supabase.auth.signOut();
    return alInicioConError("not_member", req);
  }

  // 4b. Miembro desactivado → bloquear acceso (mantiene histórico, sin login)
  if (appUser.teamMember?.deactivatedAt) {
    console.warn(`[/auth/callback] Miembro desactivado intentó entrar: ${enmascararCorreo(email)}`);
    await supabase.auth.signOut();
    return alInicioConError("deactivated", req);
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

  // 6. Bienvenida — a «Para ti» (2026-10-04): lo que le toca a cada persona, de todos los módulos. O, si venía de
  // un enlace (el QR de una trivia), de vuelta ahí (2026-11-19, lib/auth/destino-tras-login.ts).
  // Usar APP_URL (URL pública) y no `origin`, que detrás de proxy/Docker puede
  // resolver a localhost. Fallback al origin del request en dev local.
  const destino = destinoTrasLogin(req.cookies.get(COOKIE_TRAS_LOGIN)?.value) ?? "/para-ti";
  const res = NextResponse.redirect(new URL(destino, process.env.APP_URL || origin));
  res.cookies.delete(COOKIE_TRAS_LOGIN);
  return res;
}
