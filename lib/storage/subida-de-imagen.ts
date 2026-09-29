import "server-only";

/**
 * lib/storage/subida-de-imagen.ts — preparar/confirmar de una IMAGEN de documento (portadas e imágenes
 * del kickoff y de la propuesta), al bucket público. Mismo flujo que los documentos: el archivo va
 * directo del navegador a Supabase (el VPS corta en 1 MB y estas llegan a 4). Ver subida-directa.ts.
 */
import { randomUUID } from "node:crypto";
import { IMAGE_MIME_TYPES, MAX_IMAGE_SIZE } from "./public-assets";
import { pedirPermisoDeSubida, urlPublica, validarDeclarado, validarSubido, type ResultadoDePermiso } from "./subida-directa";

export const REGLAS_DE_IMAGEN = {
  mimes: IMAGE_MIME_TYPES,
  maxBytes: MAX_IMAGE_SIZE,
  etiquetaMax: `${MAX_IMAGE_SIZE / 1024 / 1024} MB`,
  tipos: "PNG, JPG o WebP",
} as const;

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function prepararImagen(
  carpeta: string,
  declarado: { nombre?: unknown; tipo?: unknown; tamano?: unknown },
): Promise<ResultadoDePermiso> {
  const v = validarDeclarado(declarado, REGLAS_DE_IMAGEN);
  if (!v.ok) return v;
  return pedirPermisoDeSubida("publico", `${carpeta}/${randomUUID()}.${EXT[v.tipo] ?? "bin"}`);
}

export async function confirmarImagen(
  carpeta: string,
  path: unknown,
): Promise<{ ok: true; url: string } | { ok: false; error: string; status: number }> {
  if (typeof path !== "string" || !path.startsWith(`${carpeta}/`) || path.includes("..") || path.slice(carpeta.length + 1).includes("/")) {
    return { ok: false, error: "Esa subida no es de este lugar.", status: 400 };
  }
  const v = await validarSubido("publico", path, REGLAS_DE_IMAGEN);
  if (!v.ok) return v;
  const url = urlPublica(path);
  if (!url) return { ok: false, error: "El almacenamiento no está configurado en el servidor.", status: 503 };
  return { ok: true, url: url.split("?")[0] };
}
