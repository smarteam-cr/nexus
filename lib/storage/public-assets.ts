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
/** El límite FÍSICO del bucket público — lo comparten los logos y las imágenes de contenido. */
export const PUBLIC_BUCKET_MAX_SIZE = 4 * 1024 * 1024; // 4MB

/**
 * C-22 (2026-09-04): un logo se pinta a ~30 px de alto (rail del cliente, portadas, PDF). Un
 * archivo de 4 MB no se ve mejor que uno de 300 KB: solo carga más lento en cada página que el
 * cliente deja abierta. 300 KB alcanza de sobra para un PNG/WebP de ~600 px de ancho, o un SVG.
 * Sin `sharp` (dependencia nativa; no entra al Docker en una tanda desatendida) acá no se puede
 * achicar: se rechaza CON el porqué, y el mensaje tiene un solo dueño (`mensajeDeLogoMuyGrande`)
 * para que las dos rutas de logo digan lo mismo.
 */
export const MAX_LOGO_SIZE = 300 * 1024; // 300 KB
export const MAX_LOGO_SIZE_LABEL = "300 KB";

/**
 * ⚠ La FOTO de una persona del equipo NO es un logo, y por eso no comparte su tope.
 *
 * C-22 bajó `MAX_LOGO_SIZE` a 300 KB con un argumento que vale solo para un logo: se pinta a
 * ~30 px de alto. Una foto de equipo se pinta a 140 px en el kickoff que abre el cliente, y las
 * fotos llegan de un celular sin procesar — con 300 KB se rechazaban casi todas. 1 MB entra
 * holgado para 140 px en pantalla retina y sigue cuatro veces por debajo del tope del bucket.
 */
export const MAX_PHOTO_SIZE = 1024 * 1024; // 1 MB
export const MAX_PHOTO_SIZE_LABEL = "1 MB";

export function mensajeDeFotoMuyGrande(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  return (
    `La foto pesa ${kb} KB y el máximo es ${MAX_PHOTO_SIZE_LABEL}. Se muestra a unos 140 px, así que ` +
    `no hace falta más: exportala más chica o recortala antes de subirla.`
  );
}

export function mensajeDeLogoMuyGrande(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  return (
    `El logo pesa ${kb} KB y el máximo es ${MAX_LOGO_SIZE_LABEL}. Se muestra a unos 30 px de alto, así que ` +
    "más peso no se ve mejor: solo carga más lento en cada página del cliente. Exportalo más chico " +
    "(un PNG o WebP de unos 600 px de ancho alcanza) o subilo en SVG."
  );
}

/** MIME permitidos para logos. SVG vía <img> (cross-origin) no ejecuta scripts. */
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function isAllowedLogoType(mime: string): boolean {
  return LOGO_MIME_TYPES.includes(mime);
}

/** MIME para IMÁGENES de contenido subidas por usuarios (portadas, diagramas):
 *  SIN SVG (los diagramas van rasterizados). Subset de los MIME del bucket —
 *  el bucket ya limita a LOGO_MIME_TYPES y 4MB a nivel Supabase. Una portada SÍ se
 *  pinta grande: conserva el límite del bucket, no el de los logos (C-22). */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_SIZE = PUBLIC_BUCKET_MAX_SIZE; // 4MB (límite del bucket)

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
      fileSizeLimit: PUBLIC_BUCKET_MAX_SIZE,
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
