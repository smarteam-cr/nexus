import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/api/auth/login", "/api/auth/logout"];

// Prefijos de rutas públicas (OAuth HubSpot)
const PUBLIC_PREFIXES = ["/api/auth/hubspot", "/api/auth/callback"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas exactas
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Rutas públicas por prefijo
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Verificar sesión de consultor
  const session = request.cookies.get("consultant_session");
  if (session?.value !== "authenticated") {
    // Redirigir al login
    const loginUrl = new URL("/", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
