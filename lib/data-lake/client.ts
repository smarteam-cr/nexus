import { createClient } from "@supabase/supabase-js";

const url = process.env.DATA_LAKE_URL!;
const key = process.env.DATA_LAKE_SECRET_KEY!;

/**
 * Cliente Supabase para el Data Lake (solo server-side).
 * Usa la secret key para tener acceso completo de lectura.
 */
export const dataLake = createClient(url, key, {
  auth: { persistSession: false },
});
