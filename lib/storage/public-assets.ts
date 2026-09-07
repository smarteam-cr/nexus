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
 * Por qué falló una subida. El motivo IMPORTA: cada uno se arregla en un lugar distinto y
 * decirle «no se pudo» a la persona la deja sin nada que hacer.
 */
export type MotivoDeFalloAlSubir =
  /** No hay credenciales de Storage en el entorno. Se arregla en el `.env` del servidor. */
  | "sin-credenciales"
  /** Las credenciales existen pero Supabase las rechaza (revocadas, rotadas, de otro proyecto). */
  | "credenciales-invalidas"
  /** El bucket rechazó el archivo (tamaño o tipo por encima de lo que él acepta). */
  | "rechazado-por-el-bucket"
  /** Cualquier otra cosa: red, timeout, 5xx de Supabase. */
  | "error";

export type ResultadoDeSubida =
  | { ok: true; url: string }
  | { ok: false; motivo: MotivoDeFalloAlSubir; mensaje: string; detalle: string };

/**
 * Traduce el error crudo de Supabase Storage a un motivo y a una frase que se le puede mostrar
 * a una persona. Sin esto, los seis lugares que suben archivos dicen «no se pudo» y el error
 * real —el único dato que sirve— se pierde.
 */
function interpretarFalloDeSubida(detalle: string, status?: number): { motivo: MotivoDeFalloAlSubir; mensaje: string } {
  const t = detalle.toLowerCase();
  if (status === 401 || status === 403 || t.includes("unauthorized") || t.includes("invalid") && t.includes("key") || t.includes("jwt") || t.includes("signature")) {
    return {
      motivo: "credenciales-invalidas",
      mensaje:
        "El almacenamiento rechazó las credenciales del servidor. No es tu archivo: hay que revisar " +
        "la clave de Supabase en el servidor (SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY).",
    };
  }
  if (t.includes("exceeded the maximum allowed size") || t.includes("payload too large") || status === 413) {
    return { motivo: "rechazado-por-el-bucket", mensaje: `El archivo supera el máximo que acepta el almacenamiento (${Math.round(PUBLIC_BUCKET_MAX_SIZE / 1024 / 1024)} MB).` };
  }
  if (t.includes("mime") || t.includes("content type") || t.includes("not supported")) {
    return { motivo: "rechazado-por-el-bucket", mensaje: "El almacenamiento no acepta ese tipo de archivo. Probá con PNG, JPG o WebP." };
  }
  return { motivo: "error", mensaje: `El almacenamiento falló al guardar el archivo: ${detalle}` };
}

/**
 * Sube (upsert) un asset al bucket público en un path FIJO (sin timestamp → no
 * acumula huérfanos al reemplazar). Devuelve la URL pública con un query
 * cache-bust (`?t=`) para invalidar el CDN al reemplazar.
 *
 * ⚠ DEVUELVE EL MOTIVO, no un `null` pelado. Hasta el 2026-09-07 hacía `if (error) return null`
 * y el error de Supabase se tiraba a la basura: los SEIS lugares que suben archivos contestaban
 * «No se pudo subir…» y no había forma de saber si era la clave del servidor, el tamaño, el tipo
 * o la red — ni desde la pantalla ni desde los logs. Diagnosticar exigía leer el código y
 * adivinar. El motivo se propaga y además se loguea (nombre + mensaje, nunca el objeto entero,
 * como manda A-15).
 */
export async function uploadPublicAsset(
  path: string,
  bytes: ArrayBuffer | Uint8Array | Buffer,
  contentType: string,
): Promise<ResultadoDeSubida> {
  const client = getStorageClient();
  if (!client) {
    return {
      ok: false,
      motivo: "sin-credenciales",
      mensaje: "El almacenamiento no está configurado en el servidor.",
      detalle: "getStorageClient() devolvió null",
    };
  }
  await ensurePublicBucket();
  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const { error } = await client.storage
    .from(PUBLIC_BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    const detalle = error.message || String(error);
    const status = (error as { statusCode?: number | string }).statusCode;
    const { motivo, mensaje } = interpretarFalloDeSubida(detalle, typeof status === "string" ? Number(status) : status);
    console.error(`[storage] upload falló (${motivo}) en «${path}»: ${detalle}`);
    return { ok: false, motivo, mensaje, detalle };
  }
  const url = publicAssetUrl(path);
  if (!url) {
    console.error(`[storage] subió «${path}» pero no se pudo derivar su URL pública`);
    return { ok: false, motivo: "error", mensaje: "Se guardó el archivo pero no se pudo obtener su dirección.", detalle: "publicAssetUrl devolvió null" };
  }
  return { ok: true, url: `${url}?t=${Date.now()}` };
}

/** Borra un asset público. No-op si Storage no está configurado. */
export async function removePublicAsset(path: string): Promise<void> {
  const client = getStorageClient();
  if (!client) return;
  await client.storage.from(PUBLIC_BUCKET).remove([path]);
}

/**
 * ¿El almacenamiento acepta las credenciales de ESTE servidor? Solo lectura: pide el bucket, no
 * sube nada.
 *
 * Existe porque la pregunta «¿la clave de Supabase del servidor sirve?» solo se podía responder
 * pidiéndole a alguien que intentara subir una foto y fallara — y el fallo, además, no decía la
 * causa. Lo consume `/api/health?storage=1`, que devuelve el booleano y nada más.
 */
export async function storageAcepta(): Promise<boolean> {
  const client = getStorageClient();
  if (!client) return false;
  const { error } = await client.storage.getBucket(PUBLIC_BUCKET);
  if (error) {
    console.error(`[storage] el bucket «${PUBLIC_BUCKET}» no respondió: ${error.message}`);
    return false;
  }
  return true;
}
