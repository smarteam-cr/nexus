import "server-only";

/**
 * lib/storage/subida-directa.ts — los archivos van del NAVEGADOR a Supabase, nunca a través del VPS.
 *
 * ── POR QUÉ (2026-09-28) ─────────────────────────────────────────────────────
 * El nginx del VPS corta todo cuerpo de más de 1 MB (413, medido contra producción con un POST
 * inofensivo de 2 MB): documentos de 3 MB, imágenes de 2 MB y el Excel de cobranza fallaban con un
 * error que no decía nada, aunque la pantalla prometía 10 MB. En ese VPS viven los demás proyectos
 * de Smarteam, así que la decisión de Elías fue no tocar nginx y estandarizar: TODA subida va directo
 * a Supabase Storage, salvo que se pida otra cosa. De paso, el servidor compartido no carga con los
 * archivos pesados.
 *
 * ── EL FLUJO, EN TRES PASOS ──────────────────────────────────────────────────
 *   1. `preparar`  — la ruta valida lo que DECLARA el navegador (sesión o token, tipo, tamaño, cupo),
 *                    arma el path ELLA (nunca lo elige el navegador) y pide acá un permiso firmado.
 *   2. El navegador sube con ese permiso (`lib/storage/subir-directo.ts`). Vence en 2 h y sirve
 *      para UNA subida: un segundo PUT con el mismo permiso da 400 (probado 2026-09-28).
 *   3. `confirmar` — la ruta vuelve a validar, pero esta vez lo REAL: `leerSubido` trae el tamaño y
 *                    el tipo que guardó Storage. Si no cumple, se borra y se contesta el error.
 *
 * ⚠ El bucket de documentos NO filtra tipos (se creó sin `allowedMimeTypes`): el filtro real es el
 * paso 3. El tope de tamaño sí lo aplica el bucket (10 MB) y además se vuelve a mirar acá.
 */
import { BUCKET_NAME, getStorageClient } from "./client";
import { PUBLIC_BUCKET, ensurePublicBucket } from "./public-assets";

/** `documentos` = privado (se lee con enlace firmado) · `publico` = imágenes y logos con URL pública. */
export type Almacen = "documentos" | "publico";

const BUCKET: Record<Almacen, string> = { documentos: BUCKET_NAME, publico: PUBLIC_BUCKET };

export interface PermisoDeSubida {
  /** URL absoluta de Supabase a la que el navegador hace el PUT. */
  signedUrl: string;
  /** El path que armó el servidor; el navegador lo devuelve tal cual al confirmar. */
  path: string;
}

export type ResultadoDePermiso = ({ ok: true } & PermisoDeSubida) | { ok: false; error: string; status: number };

export async function pedirPermisoDeSubida(almacen: Almacen, path: string): Promise<ResultadoDePermiso> {
  const client = getStorageClient();
  if (!client) {
    return {
      ok: false,
      error: "El almacenamiento de archivos no está configurado en el servidor.",
      status: 503,
    };
  }
  if (almacen === "publico") await ensurePublicBucket();
  const { data, error } = await client.storage.from(BUCKET[almacen]).createSignedUploadUrl(path);
  if (error || !data) {
    console.error(`[storage] no se pudo firmar la subida de «${path}»: ${error?.message ?? "sin datos"}`);
    return { ok: false, error: `El almacenamiento no dio permiso para subir: ${error?.message ?? "sin respuesta"}`, status: 502 };
  }
  return { ok: true, signedUrl: data.signedUrl, path };
}

export interface ObjetoSubido {
  size: number;
  mimetype: string;
}

/** Tamaño y tipo REALES de lo que quedó en Storage. `null` = no está (no se subió, o ya se borró). */
export async function leerSubido(almacen: Almacen, path: string): Promise<ObjetoSubido | null> {
  const client = getStorageClient();
  if (!client) return null;
  const corte = path.lastIndexOf("/");
  const carpeta = corte >= 0 ? path.slice(0, corte) : "";
  const nombre = corte >= 0 ? path.slice(corte + 1) : path;
  const { data, error } = await client.storage.from(BUCKET[almacen]).list(carpeta, { search: nombre, limit: 10 });
  if (error || !data) return null;
  const o = data.find((x) => x.name === nombre);
  if (!o) return null;
  const meta = (o.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: typeof meta.size === "number" ? meta.size : 0, mimetype: typeof meta.mimetype === "string" ? meta.mimetype : "" };
}

export async function descargarSubido(almacen: Almacen, path: string): Promise<Buffer | null> {
  const client = getStorageClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET[almacen]).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Best-effort: un objeto que no se pudo borrar queda huérfano en el bucket (inofensivo). */
export async function borrarSubido(almacen: Almacen, path: string): Promise<void> {
  const client = getStorageClient();
  if (!client) return;
  const { error } = await client.storage.from(BUCKET[almacen]).remove([path]);
  if (error) console.error(`[storage] no se pudo borrar «${path}»: ${error.message}`);
}

export function urlPublica(path: string): string | null {
  const client = getStorageClient();
  if (!client) return null;
  return client.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Nombre de archivo seguro para un path. El navegador puede mandar cualquier cosa como nombre: se
 * normaliza y se recorta, así nunca arma una carpeta ni un `..`.
 */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");
  return (limpio || "archivo").slice(-120);
}

/**
 * Valida lo que DECLARA el navegador antes de dar el permiso. Es solo el primer filtro (el real es
 * `leerSubido` al confirmar), pero ahorra una subida de 40 MB que se iba a rechazar igual.
 */
export function validarDeclarado(
  declarado: { nombre?: unknown; tipo?: unknown; tamano?: unknown },
  reglas: { mimes: readonly string[]; maxBytes: number; etiquetaMax: string; tipos: string },
): { ok: true; nombre: string; tipo: string; tamano: number } | { ok: false; error: string; status: number } {
  const nombre = typeof declarado.nombre === "string" ? declarado.nombre.slice(0, 200) : "";
  const tipo = typeof declarado.tipo === "string" ? declarado.tipo : "";
  const tamano = typeof declarado.tamano === "number" && Number.isFinite(declarado.tamano) ? declarado.tamano : -1;
  if (!nombre || tamano < 0) return { ok: false, error: "Falta el archivo.", status: 400 };
  if (tamano > reglas.maxBytes) {
    return { ok: false, error: `El archivo pesa ${mb(tamano)} y el máximo es ${reglas.etiquetaMax}.`, status: 413 };
  }
  if (!reglas.mimes.includes(tipo)) {
    return {
      ok: false,
      error: `Tipo de archivo no permitido (${tipo || "desconocido"}). Se aceptan ${reglas.tipos}.`,
      status: 415,
    };
  }
  return { ok: true, nombre, tipo, tamano };
}

/**
 * Vuelve a validar contra lo REAL. Si no cumple, borra el objeto: lo que no se aceptó no se queda.
 */
export async function validarSubido(
  almacen: Almacen,
  path: string,
  reglas: { mimes: readonly string[]; maxBytes: number; etiquetaMax: string; tipos: string },
): Promise<{ ok: true; objeto: ObjetoSubido } | { ok: false; error: string; status: number }> {
  const objeto = await leerSubido(almacen, path);
  if (!objeto) return { ok: false, error: "El archivo no llegó al almacenamiento. Vuelve a intentarlo.", status: 409 };
  if (objeto.size > reglas.maxBytes) {
    await borrarSubido(almacen, path);
    return { ok: false, error: `El archivo pesa ${mb(objeto.size)} y el máximo es ${reglas.etiquetaMax}.`, status: 413 };
  }
  if (!reglas.mimes.includes(objeto.mimetype)) {
    await borrarSubido(almacen, path);
    return {
      ok: false,
      error: `Tipo de archivo no permitido (${objeto.mimetype || "desconocido"}). Se aceptan ${reglas.tipos}.`,
      status: 415,
    };
  }
  return { ok: true, objeto };
}

function mb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
