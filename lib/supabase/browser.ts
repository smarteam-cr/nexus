/**
 * lib/supabase/browser.ts
 *
 * Cliente Supabase para Client Components. Usado por el botón "Iniciar con
 * Google" y cualquier otra interacción auth desde el browser.
 *
 * IMPORTANTE: este cliente apunta al proyecto Supabase de Auth (mismo de
 * DATABASE_URL), no al de Storage.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
    );
  }
  _client = createBrowserClient(url, anon);
  return _client;
}
