import "server-only";

/**
 * lib/documents/subida-de-documento.ts — el preparar/confirmar de un DOCUMENTO (bucket privado),
 * compartido por las tres puertas que suben documentos: los del proyecto, las transcripciones de la
 * propuesta y los adjuntos del cuestionario previo.
 *
 * Las reglas (tipos, tope) son UNA: antes cada ruta las repetía y el mensaje de error divergía.
 * El flujo y el porqué de la subida directa, en `lib/storage/subida-directa.ts`.
 */
import { prisma } from "@/lib/db/prisma";
import { extractText } from "@/lib/documents/extract-text";
import { DOCUMENT_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/storage/client";
import {
  descargarSubido,
  borrarSubido,
  nombreSeguro,
  pedirPermisoDeSubida,
  validarDeclarado,
  validarSubido,
  type ResultadoDePermiso,
} from "@/lib/storage/subida-directa";

export const REGLAS_DE_DOCUMENTO = {
  mimes: DOCUMENT_MIME_TYPES,
  maxBytes: MAX_FILE_SIZE,
  etiquetaMax: `${MAX_FILE_SIZE / 1024 / 1024} MB`,
  tipos: "PDF, Word, Excel, PowerPoint, texto, CSV o imágenes",
} as const;

/**
 * Paso 1. `carpeta` la decide la RUTA (ej. `${clientId}/${projectId}`), nunca el navegador: es lo
 * que después permite comprobar que el path que vuelve al confirmar es de este proyecto.
 */
export async function prepararDocumento(
  carpeta: string,
  declarado: { nombre?: unknown; tipo?: unknown; tamano?: unknown },
): Promise<ResultadoDePermiso> {
  const v = validarDeclarado(declarado, REGLAS_DE_DOCUMENTO);
  if (!v.ok) return v;
  return pedirPermisoDeSubida("documentos", `${carpeta}/${Date.now()}_${nombreSeguro(v.nombre)}`);
}

export type DocumentoConfirmado =
  | { ok: true; path: string; nombre: string; tamano: number; tipo: string; contenido: string | null }
  | { ok: false; error: string; status: number };

/**
 * Paso 3. Comprueba que el path sea de `carpeta` y que no esté ya registrado, valida lo REAL (tamaño y
 * tipo guardados por Storage), baja el archivo y extrae el texto. La fila la crea quien llama.
 */
export async function confirmarDocumento(
  carpeta: string,
  path: unknown,
  /** El nombre tal como lo tenía el archivo (con tildes y espacios): es solo el título visible. */
  nombreOriginal?: unknown,
): Promise<DocumentoConfirmado> {
  if (typeof path !== "string" || !path.startsWith(`${carpeta}/`) || path.includes("..") || path.slice(carpeta.length + 1).includes("/")) {
    return { ok: false, error: "Esa subida no es de este lugar.", status: 400 };
  }
  // Un path ya registrado no se confirma dos veces (doble clic, o un reintento tras un corte).
  if (await prisma.clientDocument.findFirst({ where: { url: path }, select: { id: true } })) {
    return { ok: false, error: "Ese archivo ya estaba registrado.", status: 409 };
  }
  const v = await validarSubido("documentos", path, REGLAS_DE_DOCUMENTO);
  if (!v.ok) return v;

  const buffer = await descargarSubido("documentos", path);
  if (!buffer) {
    await borrarSubido("documentos", path);
    return { ok: false, error: "No se pudo leer el archivo subido. Vuelve a intentarlo.", status: 502 };
  }
  const contenido = await extractText(buffer, v.objeto.mimetype);
  // El título visible: el nombre original si vino; si no, el del path (sin el sello de tiempo).
  const original = typeof nombreOriginal === "string" ? nombreOriginal.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const nombre = original || path.slice(carpeta.length + 1).replace(/^\d+_/, "");
  return { ok: true, path, nombre, tamano: v.objeto.size, tipo: v.objeto.mimetype, contenido };
}
