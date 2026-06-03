import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase Storage (server-side). Usa la service-role/secret key
 * para acceso completo.
 *
 * Resiliente: se inicializa LAZY y devuelve null si las credenciales no están
 * configuradas. Antes este módulo hacía `createClient(url, "")` a nivel top-level,
 * lo que EXPLOTABA al importarse ("supabaseKey is required") y rompía con 500
 * cualquier endpoint que lo importara (GET/DELETE documents, upload) — incluso
 * features que no usan Storage (ej. documentos por link de Google, que solo
 * necesitan el GET de la lista). Ahora la falta de credenciales degrada con
 * gracia en vez de tumbar el endpoint.
 *
 * Variables (con fallback a los nombres del proyecto principal de Supabase):
 *   - SUPABASE_URL          ?? NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SECRET_KEY   ?? SUPABASE_SERVICE_ROLE_KEY
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const BUCKET_NAME = "client-documents";
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

let _client: SupabaseClient | null = null;
let _warned = false;

/**
 * Devuelve el cliente de Storage, o null si no está configurado (sin lanzar).
 * El caller decide cómo degradar (ej. upload → 503, getSignedUrl → null).
 */
export function getStorageClient(): SupabaseClient | null {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    if (!_warned) {
      console.warn(
        "[storage] Storage deshabilitado: faltan SUPABASE_URL/SUPABASE_SECRET_KEY " +
          "(o NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY). " +
          "La subida de archivos no funcionará hasta configurarlas; los documentos por link de Google sí.",
      );
      _warned = true;
    }
    return null;
  }
  _client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
  return _client;
}

/** True si Storage está configurado (para que los endpoints den errores claros). */
export function isStorageConfigured(): boolean {
  return !!getStorageClient();
}

/**
 * Asegura que el bucket exista. No-op si Storage no está configurado.
 */
export async function ensureBucket() {
  const client = getStorageClient();
  if (!client) return;
  const { data } = await client.storage.getBucket(BUCKET_NAME);
  if (!data) {
    await client.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "text/plain",
        "text/csv",
        "image/png",
        "image/jpeg",
        "image/webp",
      ],
    });
  }
}

/**
 * Genera un path de Storage para un documento de cliente.
 */
export function storagePath(clientId: string, projectId: string, fileName: string): string {
  const timestamp = Date.now();
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${clientId}/${projectId}/${timestamp}_${safe}`;
}

/**
 * Genera una signed URL para descargar un archivo. Devuelve null si Storage no
 * está configurado o si falla.
 */
export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const client = getStorageClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Borra un archivo del bucket. No-op si Storage no está configurado.
 */
export async function removeFile(path: string): Promise<void> {
  const client = getStorageClient();
  if (!client) return;
  await client.storage.from(BUCKET_NAME).remove([path]);
}
