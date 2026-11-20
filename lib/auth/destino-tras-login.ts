/**
 * lib/auth/destino-tras-login.ts — a dónde vuelve la persona después de iniciar sesión. Puro (lo usan el portero, la
 * página de entrada y las dos rutas del login con Google).
 *
 * Hasta el 2026-11-19 todo login terminaba en «Para ti»: quien abría un enlace de Nexus sin sesión (el QR de una
 * trivia, un enlace pegado en un chat) iniciaba sesión y perdía a dónde iba. Ahora el portero (middleware.ts) manda al
 * login con `?next=<ruta>`, `/auth/google` lo guarda en una cookie corta y `/auth/callback` vuelve ahí.
 *
 * Por qué una cookie y no el `redirectTo` de Supabase: Supabase solo acepta una URL de vuelta que esté en la lista de
 * su panel, y con un parámetro distinto cada vez no habría lista que alcance (ni en el 3005).
 *
 * ⛔ Solo rutas de ESTA app: la regla única de lib/navegacion/ruta-interna.ts y, encima, letras, números y `-._~/`
 * nada más (sin `%`: nada codificado que el navegador decodifique a `//otro.com`) y sin tramos `.` o `..` (que el
 * navegador resuelve: `/x/../auth/signout` es el cierre de sesión). Cualquier otra cosa se descarta y la persona va a
 * «Para ti», como siempre.
 */
import { esRutaInterna } from "@/lib/navegacion/ruta-interna";

export const COOKIE_TRAS_LOGIN = "nexus-tras-login";
/** Diez minutos: lo que tarda un login con Google, con holgura. */
export const VIDA_DE_LA_COOKIE_S = 600;

const FORMA = /^\/(?!\/)[A-Za-z0-9\-._~/]*$/;
const LARGO_MAXIMO = 300;

/** La ruta interna a la que volver, o null si no sirve (o no hace falta: la raíz ya lleva a «Para ti»). */
export function destinoTrasLogin(crudo: string | null | undefined): string | null {
  if (!crudo || crudo.length > LARGO_MAXIMO || !esRutaInterna(crudo) || !FORMA.test(crudo)) return null;
  if (crudo.split("/").some((tramo) => tramo === "." || tramo === "..")) return null;
  if (crudo === "/" || crudo.startsWith("/auth/") || crudo.startsWith("/api/")) return null;
  return crudo;
}
