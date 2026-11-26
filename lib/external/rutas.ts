/**
 * lib/external/rutas.ts — la dirección de cada superficie externa NOMBRA el proyecto.
 *
 * ── EL INCIDENTE QUE LO ORIGINÓ (2026-09-10) ─────────────────────────────────
 * A Elías le pasaron `/external/cronograma` con el código de Judesur y vio el cronograma de
 * Wherex. No era caché: esa dirección no decía de qué proyecto era, y la página mostraba el del
 * último acceso que había guardado ese navegador. Era la dirección a la que se llega DESPUÉS de
 * poner la contraseña, así que quedaba en la barra con cara de compartible — y alguien la compartió.
 *
 * Ahora el destino es `/external/<superficie>/<id del acceso>`. El id no es secreto y no abre nada
 * por sí solo: sin la credencial de ESE proyecto en el navegador, la página no muestra contenido.
 * Y nunca muestra un proyecto distinto del que nombra (lo hace cumplir `resolveActiveAccess`).
 *
 * Por qué el id del ACCESO y no el del proyecto: el del proyecto circula en las URLs internas de
 * Nexus; el del acceso solo existe del lado del cliente. Y no cambia con «Regenerar todo» (el POST
 * de external-access es un upsert que conserva la fila), así que un favorito sobrevive a rotar la
 * contraseña: pide volver a entrar, pero sigue apuntando al mismo proyecto.
 *
 * Módulo PURO y client-safe: lo importa VerifyForm, que corre en el navegador.
 */
import { PUBLISH_SURFACES, type PublishSurfaceKey } from "@/lib/projects/publish-surfaces";

/**
 * cuid (25) o UUID (36). ⛔ NUNCA `z.string().cuid()`: en este repo conviven los dos formatos.
 * El tope de 40 deja afuera un token de 64 hex: un token jamás puede terminar en una dirección.
 */
export const ACCESO_ID_RE = /^[A-Za-z0-9_-]{16,40}$/;

export function esIdDeAcceso(valor: unknown): valor is string {
  return typeof valor === "string" && ACCESO_ID_RE.test(valor);
}

const CLAVES = new Set<string>(PUBLISH_SURFACES.map((s) => s.key));

/** `?next=` → superficie. Lista cerrada: nada del parámetro se interpola en una URL. */
export function superficieDeNext(next: string | null | undefined): PublishSurfaceKey {
  return next && CLAVES.has(next) ? (next as PublishSurfaceKey) : "kickoff";
}

/** Los flags de publicación de un proyecto, tal como los lee cada página (`<superficie>PublishedAt`). */
export type FlagsDePublicacion = Partial<Record<(typeof PUBLISH_SURFACES)[number]["flag"], Date | null>>;

/**
 * A dónde llega el cliente después de la contraseña cuando el enlace no trae `?next=` (2026-11-25, RC Inmobiliaria: con
 * solo el cronograma publicado, el enlace de siempre caía en el kickoff sin publicar y mostraba «no disponible»).
 *
 * La primera superficie PUBLICADA en el orden del registro. El requerimiento técnico va al final: lo abre el
 * desarrollador con su propio enlace (`?next=desarrollo`), y el mensaje para el cliente tampoco lo nombra; solo es
 * el destino si es lo único publicado. Sin nada publicado, el kickoff (la página dice «no disponible», como antes).
 */
export function primeraSuperficiePublicada(flags: FlagsDePublicacion): PublishSurfaceKey {
  const publicadas = PUBLISH_SURFACES.filter((s) => flags[s.flag] != null);
  const paraElCliente = publicadas.find((s) => s.key !== "desarrollo");
  return (paraElCliente ?? publicadas[0])?.key ?? "kickoff";
}

/**
 * El destino del formulario: el `?next=` si es una superficie conocida; si no, la que calculó el servidor
 * (`primeraSuperficiePublicada`). Las dos pasan por la lista cerrada: nada de la respuesta se usa sin validar.
 */
export function destinoDespuesDeEntrar(next: string | null | undefined, delServidor: unknown): PublishSurfaceKey {
  if (next && CLAVES.has(next)) return next as PublishSurfaceKey;
  return superficieDeNext(typeof delServidor === "string" ? delServidor : null);
}

/** La dirección de una superficie de UN proyecto. Lanza con un id inválido: nunca arma basura. */
export function rutaDeSuperficie(accesoId: string, superficie: PublishSurfaceKey): string {
  if (!esIdDeAcceso(accesoId)) throw new Error("id de acceso inválido");
  if (!CLAVES.has(superficie)) throw new Error(`superficie desconocida: ${superficie}`);
  return `/external/${superficie}/${accesoId}`;
}
