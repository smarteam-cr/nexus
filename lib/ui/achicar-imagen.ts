/**
 * lib/ui/achicar-imagen.ts — la foto se achica EN EL NAVEGADOR antes de subirla.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────
 * Subir el archivo tal como sale del teléfono es pedirle a la red, al proxy y al bucket que
 * aguanten 3-8 MB para pintar un avatar de 44 px y una foto de 140 px en el kickoff. Y cada eslabón
 * de ese camino tiene su propio tope: el handler (1 MB), el bucket (4 MB) y —el que no se ve— el
 * `client_max_body_size` del nginx del VPS, que por defecto es 1 MB y NO vive en este repo. Cuando
 * el que corta es el proxy, la respuesta es un HTML de error: el cliente no encuentra `error` en el
 * JSON, cae a su mensaje genérico, y la persona lee «No se pudo subir la foto» sin ninguna pista.
 * Eso fue exactamente lo que pasó el 2026-09-07.
 *
 * Achicando antes de enviar, el archivo sale de ~4 MB a ~40 KB y deja de tocar TODOS esos topes a
 * la vez. Es la única de las soluciones posibles que no depende de configurar algo fuera del repo.
 *
 * ── FAIL-OPEN, A PROPÓSITO ───────────────────────────────────────────────────
 * Si algo del reescalado falla —un formato que el navegador no sabe decodificar, un canvas
 * bloqueado por privacidad, memoria— se devuelve el archivo ORIGINAL y que decida el servidor.
 * Nunca se bloquea una subida por no haber podido optimizarla: el peor resultado de esta función
 * es «no la achiqué», no «no la subí».
 */

/** Lado mayor de la imagen resultante. 512 px cubre el avatar (44) y el kickoff (140) en retina. */
export const LADO_MAXIMO_FOTO = 512;

/** Calidad JPEG/WebP del reescalado. 0.85 es indistinguible a estos tamaños. */
const CALIDAD = 0.85;

/** Por debajo de esto no se toca nada: ya es chica y reescalar solo agregaría riesgo. */
const YA_ES_CHICA = 250 * 1024;

export interface ResultadoDeAchique {
  archivo: File;
  /** true si de verdad se achicó. false = se devuelve el original (ya era chico, o falló). */
  seAchico: boolean;
  /** Para el log/diagnóstico: por qué no se achicó. */
  motivo?: string;
}

/**
 * Devuelve una versión más liviana de la imagen, o la original si no hizo falta o no se pudo.
 * Solo corre en el navegador (usa canvas): llamarla desde el servidor devuelve el original.
 */
export async function achicarImagen(
  file: File,
  ladoMaximo: number = LADO_MAXIMO_FOTO,
): Promise<ResultadoDeAchique> {
  if (typeof document === "undefined") return { archivo: file, seAchico: false, motivo: "sin-dom" };
  if (!file.type.startsWith("image/")) return { archivo: file, seAchico: false, motivo: "no-es-imagen" };
  // Un SVG es vectorial: rasterizarlo lo empeora y además pesa poco. Se sube tal cual.
  if (file.type === "image/svg+xml") return { archivo: file, seAchico: false, motivo: "svg" };
  if (file.size <= YA_ES_CHICA) return { archivo: file, seAchico: false, motivo: "ya-es-chica" };

  try {
    const bitmap = await cargarBitmap(file);
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    // Ya está dentro del tamaño objetivo: no se reescala, pero SÍ se recomprime, que es de donde
    // sale la mayor parte del ahorro en una foto de teléfono.
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { archivo: file, seAchico: false, motivo: "sin-contexto-2d" };
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    /* JPEG y no WebP: el bucket acepta los dos, pero JPEG lo decodifica cualquier cosa que abra el
       documento después (incluido el Chromium del PDF). Una foto no tiene transparencia que perder. */
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", CALIDAD));
    if (!blob) return { archivo: file, seAchico: false, motivo: "toBlob-null" };
    // Si por lo que sea quedó más pesada que la original, la original gana.
    if (blob.size >= file.size) return { archivo: file, seAchico: false, motivo: "no-mejoro" };

    const nombre = file.name.replace(/\.[^.]+$/, "") || "foto";
    return {
      archivo: new File([blob], `${nombre}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
      seAchico: true,
    };
  } catch (e) {
    return { archivo: file, seAchico: false, motivo: e instanceof Error ? e.name : "error" };
  }
}

/** `createImageBitmap` cuando existe (más formatos, sin tocar el DOM); si no, un <img> con objectURL. */
async function cargarBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari viejo y algunos formatos: se sigue por el camino del <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("no se pudo decodificar la imagen"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
