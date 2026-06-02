/**
 * lib/supabase/server.ts
 *
 * Cliente Supabase para Server Components, Server Actions y API routes.
 * Usa createServerClient de @supabase/ssr que lee/escribe cookies de sesión
 * vía la API de cookies() de Next.js.
 *
 * IMPORTANTE: este cliente apunta al proyecto Supabase donde vive `auth.users`
 * y la tabla `AppUser` (debe coincidir con DATABASE_URL de Prisma).
 * NO confundir con `lib/storage/client.ts` que apunta a OTRO proyecto Supabase
 * usado solo para Storage de documentos.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local. " +
        "Configurá las variables del proyecto Supabase de Auth (el mismo de la DB).",
    );
  }
}

/**
 * Crea un cliente Supabase atado al request actual (Server Component / API route).
 * Lee y escribe las cookies de sesión vía Next.js cookies().
 */
export async function createSupabaseServerClient() {
  assertEnv();
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamada desde Server Component que no puede setear cookies (Next 15).
          // Es esperado en read-only paths; Supabase tolera el fallback.
        }
      },
    },
  });
}

/**
 * Atajo para leer el usuario autenticado en server-side.
 * Devuelve null si no hay sesión válida.
 */
export async function getSupabaseUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
