import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el Data Lake (solo server-side; usa la secret key para
 * acceso completo de lectura).
 *
 * LAZY a propósito: antes este módulo hacía `createClient(url, key)` a nivel
 * top-level, lo que EXPLOTABA al importarse ("supabaseUrl is required") cuando
 * DATA_LAKE_URL no estaba definida — p. ej. durante `next build` (la generación
 * estática evalúa los módulos del servidor) o en un contenedor sin esa env.
 * Ahora el cliente se crea en el PRIMER USO; si falta config, lanza un error
 * claro que los callers ya atrapan (degradan a "sin notas del Data Lake").
 */
let _client: SupabaseClient | null = null;

export function getDataLake(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.DATA_LAKE_URL ?? "";
  const key = process.env.DATA_LAKE_SECRET_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "Data Lake no configurado: faltan DATA_LAKE_URL / DATA_LAKE_SECRET_KEY.",
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
