/**
 * middleware.ts
 *
 * Gate global de la app. Permite el paso si hay sesión Supabase Auth válida.
 *
 * Rutas siempre públicas: la landing, las rutas del flujo de auth Supabase, y
 * las rutas de OAuth de HubSpot (integración separada de la autenticación de
 * Nexus — HubSpot OAuth conecta una HubspotAccount, no loguea al usuario).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Rutas públicas exactas
const PUBLIC_PATHS = ["/"];

// Prefijos siempre públicos:
//   - /api/auth/hubspot/*  → flujo OAuth HubSpot (integración, no auth de usuario)
//   - /api/auth/callback   → callback OAuth HubSpot
//   - /auth/*              → rutas de Supabase Auth (google, callback, signout)
//   - /share/*             → vista pública de proyecto compartido por token.
//                            La página hace su propio "auth" buscando por
//                            shareToken (24 chars hex) y solo expone cards con
//                            publishedToClient=true. Requiere acceso público
//                            sin login para que el cliente final pueda abrirla.
//   - /external/*          → landing del cliente externo (Fase 1 módulo externo).
//                            La página verifica token+contraseña vía
//                            /api/external/verify-access. Requiere acceso público
//                            porque el cliente final no tiene sesión Supabase.
//   - /api/external/*      → endpoints públicos del cliente externo (verify,
//                            futuro: lecturas del landing). Cada endpoint hace
//                            su propia validación (token+pass o JWT externo).
const PUBLIC_PREFIXES = [
  "/api/auth/hubspot",
  "/api/auth/callback",
  "/auth/",
  "/share/",
  "/external/",
  "/api/external/",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Importante: el middleware tiene que RETORNAR la response que Supabase
  // pueda haber modificado (token refresh setea cookies nuevas).
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    // Sin Supabase configurado no se puede autenticar — redirect a la landing
    // con error visible para que el deploy se diagnostique rápido.
    return NextResponse.redirect(new URL("/?error=oauth_init", request.url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  if (data.user) return response;

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    /*
     * Aplica el middleware a todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
