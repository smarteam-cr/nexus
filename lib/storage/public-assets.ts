/**
 * lib/storage/public-assets.ts
 *
 * Storage para assets PÚBLICOS (logos de cliente + logo de Smarteam). A
 * diferencia de `lib/storage/client.ts` (bucket privado `client-documents` con
 * signed URLs de 1h), acá el bucket es **público**: la URL es estable y no
 * expira → sirve en las páginas externas (que el cliente puede dejar abiertas
 * horas) y se referencia con un simple `<img src>`. Los logos no son sensibles.
 *
 * Reusa el cliente lazy/resiliente de `client.ts` (degrada con gracia si faltan
 * las credenciales de Supabase Storage).
 */
import { getStorageClient } from "./client";

export const PUBLIC_BUCKET = "public-assets";
export const MAX_LOGO_SIZE = 4 * 1024 * 1024; // 4MB

/** MIME permitidos para logos. SVG vía <img> (cross-origin) no ejecuta scripts. */
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function isAllowedLogoType(mime: string): boolean {
  return LOGO_MIME_TYPES.includes(mime);
}

/** MIME para IMÁGENES de contenido subidas por usuarios (portadas, diagramas):
 *  SIN SVG (los diagramas van rasterizados). Subset de los MIME del bucket —
 *  el bucket ya limita a LOGO_MIME_TYPES y 4MB a nivel Supabase. */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_SIZE = MAX_LOGO_SIZE; // 4MB (límite del bucket)

export function isAllowedImageType(mime: string): boolean {
  return IMAGE_MIME_TYPES.includes(mime);
}

/** Asegura el bucket público (idempotente). No-op si Storage no está configurado. */
export async function ensurePublicBucket(): Promise<void> {
  const client = getStorageClient();
  if (!client) return;
  const { data } = await client.storage.getBucket(PUBLIC_BUCKET);
  if (!data) {
    await client.storage.createBucket(PUBLIC_BUCKET, {
      public: true,
      fileSizeLimit: MAX_LOGO_SIZE,
      allowedMimeTypes: LOGO_MIME_TYPES,
    });
  }
}

/** URL pública estable de un path (no expira). Null si Storage no configurado. */
export function publicAssetUrl(path: string): string | null {
  const client = getStorageClient();
  if (!client) return null;
  return client.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Sube (upsert) un asset al bucket público en un path FIJO (sin timestamp → no
 * acumula huérfanos al reemplazar). Devuelve la URL pública con un query
 * cache-bust (`?t=`) para invalidar el CDN al reemplazar. Null si falla / sin Storage.
 */
export async function uploadPublicAsset(
  path: string,
  bytes: ArrayBuffer | Uint8Array | Buffer,
  contentType: string,
): Promise<string | null> {
  const client = getStorageClient();
  if (!client) return null;
  await ensurePublicBucket();
  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const { error } = await client.storage
    .from(PUBLIC_BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) return null;
  const url = publicAssetUrl(path);
  return url ? `${url}?t=${Date.now()}` : null;
}

/** Borra un asset público. No-op si Storage no está configurado. */
export async function removePublicAsset(path: string): Promise<void> {
  const client = getStorageClient();
  if (!client) return;
  await client.storage.from(PUBLIC_BUCKET).remove([path]);
}
