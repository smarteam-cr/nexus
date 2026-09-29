/**
 * lib/storage/subir-directo.ts — el lado del NAVEGADOR de la subida directa a Supabase.
 *
 * Lo usan todos los que suben archivos (documentos, transcripciones, adjuntos del cuestionario,
 * imágenes, el import de cobranza). El porqué y el flujo completo, en `lib/storage/subida-directa.ts`.
 *
 * Tres pasos que el llamador no tiene que repetir:
 *   1. POST a su ruta con `{ accion: "preparar", nombre, tipo, tamano, ...extra }` → permiso firmado.
 *   2. PUT del archivo directo a Supabase con ese permiso (sin clave: el permiso ES la llave).
 *   3. POST a su ruta con `{ accion: "confirmar", path, ...extra }` → lo que la ruta devuelva.
 *
 * Nunca tira: todo fallo vuelve como `{ ok: false, error }` con un mensaje para mostrar tal cual.
 * Un error mudo es lo que hizo invisible el tope de 1 MB durante semanas.
 *
 * Módulo client-safe (sin imports de servidor).
 */

export type ResultadoDeSubirDirecto<T> = { ok: true; data: T } | { ok: false; error: string };

async function leerJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mensaje(data: Record<string, unknown> | null, res: Response, porDefecto: string): string {
  const e = data?.error;
  if (typeof e === "string" && e) return e;
  if (res.status === 413) return "El archivo es demasiado grande.";
  return `${porDefecto} (${res.status}).`;
}

export async function subirDirecto<T = Record<string, unknown>>(opts: {
  /** La ruta de la app que prepara y confirma (la misma para los dos pasos). */
  ruta: string;
  archivo: File;
  /** Campos extra que viajan en los dos pasos (token del cliente, descripción, modo…). */
  extra?: Record<string, unknown>;
  /** Cabeceras extra para la ruta de la app (no para Supabase). */
  headers?: Record<string, string>;
}): Promise<ResultadoDeSubirDirecto<T>> {
  const { ruta, archivo, extra = {} } = opts;
  const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };

  // 1 · permiso
  let permiso: { signedUrl?: unknown; path?: unknown } | null;
  try {
    const res = await fetch(ruta, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...extra, accion: "preparar", nombre: archivo.name, tipo: archivo.type, tamano: archivo.size }),
    });
    const data = await leerJson(res);
    if (!res.ok) return { ok: false, error: mensaje(data, res, "No se pudo preparar la subida") };
    permiso = data as typeof permiso;
  } catch {
    return { ok: false, error: "No hay conexión. Revisa tu internet e inténtalo de nuevo." };
  }
  const signedUrl = typeof permiso?.signedUrl === "string" ? permiso.signedUrl : "";
  const path = typeof permiso?.path === "string" ? permiso.path : "";
  if (!signedUrl || !path) return { ok: false, error: "El servidor no dio permiso para subir el archivo." };

  // 2 · el archivo, directo a Supabase (misma forma que `uploadToSignedUrl` de supabase-js)
  try {
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", archivo);
    const res = await fetch(signedUrl, { method: "PUT", body: fd, headers: { "x-upsert": "false" } });
    if (!res.ok) {
      const data = await leerJson(res);
      const detalle = typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : "";
      if (res.status === 413 || /maximum allowed size/i.test(detalle)) {
        return { ok: false, error: "El archivo supera el máximo que acepta el almacenamiento." };
      }
      return { ok: false, error: `El almacenamiento rechazó el archivo${detalle ? `: ${detalle}` : ` (${res.status})`}.` };
    }
  } catch {
    return { ok: false, error: "Se cortó la conexión mientras se subía el archivo. Inténtalo de nuevo." };
  }

  // 3 · confirmar
  try {
    const res = await fetch(ruta, { method: "POST", headers, body: JSON.stringify({ ...extra, accion: "confirmar", path }) });
    const data = await leerJson(res);
    if (!res.ok) return { ok: false, error: mensaje(data, res, "El archivo subió pero no se pudo registrar") };
    return { ok: true, data: (data ?? {}) as T };
  } catch {
    return { ok: false, error: "El archivo subió pero se cortó la conexión al registrarlo. Recarga la página para ver si quedó." };
  }
}
