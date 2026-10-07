/**
 * lib/no-encontrada/sugerencias.ts — lo que la página 404 sabe de la dirección que no existe (2026-10-06).
 *
 * Dos preguntas, las dos puras: corren en el navegador con la dirección de `usePathname`, porque el
 * not-found.tsx del server no la recibe.
 *   - `fichaDeLaDireccion`: ¿es la ficha de algo (un cliente, una propuesta, un documento de Roles…)?
 *     Entonces el 404 dice QUÉ se buscó y lleva a su listado. Son las siete rutas que llaman a
 *     `notFound()` bajo app/(shell).
 *   - `sugerenciasParaLaDireccion`: si no, ¿a qué secciones del menú se parece lo que se escribió? La
 *     interfaz está en español y las rutas en inglés (`/clientes` contra `/clients`): ese error es común.
 *
 * Nada de IA: se compara contra el menú que la persona puede abrir, que el server le pasa ya filtrado.
 * ⚠ Ningún texto confirma que algo existe: Roles responde 404 a propósito cuando el documento no está
 * compartido contigo, y decir «este documento existe pero no es tuyo» sería la fuga que eso evita.
 */

/** Una entrada del menú que la persona puede abrir. `padre` = el ítem del menú que la contiene. */
export interface DestinoDelMenu {
  etiqueta: string;
  href: string;
  padre?: string;
}

export interface FichaNoEncontrada {
  titulo: string;
  detalle: string;
  /** A dónde lleva el botón azul (si la persona puede abrirlo; si no, «Para ti»). */
  listado: { etiqueta: string; href: string };
  /** Solo Roles: el 404 también puede ser «no está compartido contigo». */
  compartible: boolean;
}

interface Ficha {
  prefijo: string;
  /** El sustantivo con su artículo: «este cliente», «esta propuesta». */
  que: string;
  genero: "m" | "f";
  listado: { etiqueta: string; href: string };
  compartible?: boolean;
}

/** El prefijo más largo primero: `/sales/exploraciones/` no puede perder contra uno más corto. */
const FICHAS: readonly Ficha[] = [
  { prefijo: "/sales/exploraciones/", que: "esta preventa", genero: "f", listado: { etiqueta: "Preventa", href: "/sales/exploraciones" } },
  { prefijo: "/customer-success/", que: "esta cuenta", genero: "f", listado: { etiqueta: "Éxito del cliente", href: "/customer-success" } },
  { prefijo: "/business-cases/", que: "esta propuesta", genero: "f", listado: { etiqueta: "Propuestas", href: "/business-cases" } },
  { prefijo: "/sessions/", que: "esta reunión", genero: "f", listado: { etiqueta: "Sesiones", href: "/sessions" } },
  { prefijo: "/clients/", que: "este cliente", genero: "m", listado: { etiqueta: "Clientes", href: "/clients" } },
  { prefijo: "/audits/", que: "esta auditoría", genero: "f", listado: { etiqueta: "Auditoría", href: "/audits" } },
  { prefijo: "/roles/", que: "este documento", genero: "m", listado: { etiqueta: "Roles", href: "/roles" }, compartible: true },
];

/** La dirección tal como la escribió la persona: sin la barra final y con las tildes legibles. */
export function direccionLegible(pathname: string): string {
  const sinBarra = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  try {
    return decodeURIComponent(sinBarra);
  } catch {
    return sinBarra;
  }
}

export function fichaDeLaDireccion(pathname: string): FichaNoEncontrada | null {
  const direccion = direccionLegible(pathname);
  const ficha = FICHAS.find((f) => direccion.startsWith(f.prefijo) && direccion.length > f.prefijo.length);
  if (!ficha) return null;
  const pronombre = ficha.genero === "f" ? "la" : "lo";
  const detalle = ficha.compartible
    ? `Puede que ${pronombre} hayan borrado, que el enlace esté incompleto o que no esté ${ficha.genero === "f" ? "compartida" : "compartido"} contigo.`
    : `Puede que ${pronombre} hayan borrado o que el enlace esté incompleto.`;
  return { titulo: `No encontramos ${ficha.que}`, detalle, listado: ficha.listado, compartible: ficha.compartible === true };
}

/** Palabras que no dicen a dónde se quería ir. */
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "a", "en", "mi", "mis"]);

/** Minúsculas, sin tildes, partido en palabras. */
export function palabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0 && !VACIAS.has(p));
}

/** Un id (cuid, número) no se parece a ninguna sección: compararlo solo mete ruido. */
function pareceUnId(palabra: string): boolean {
  return /^\d+$/.test(palabra) || (palabra.length >= 8 && /\d/.test(palabra));
}

function distancia(a: string, b: string): number {
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i];
    for (let j = 1; j <= b.length; j++) {
      nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    fila = nueva;
  }
  return fila[b.length];
}

const singular = (p: string) => (p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p);

/** 3 = la misma palabra (o su singular) · 2 = se parece (empieza igual o tiene un error de tipeo) · 0 = no. */
export function parecido(a: string, b: string): number {
  if (a === b || singular(a) === singular(b)) return 3;
  if (Math.min(a.length, b.length) < 4) return 0;
  if (a.startsWith(b) || b.startsWith(a)) return 2;
  return distancia(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1) ? 2 : 0;
}

/**
 * Las secciones del menú que se parecen a la dirección, de la más parecida a la menos, hasta `max`.
 * Se queda con las que están cerca de la mejor (a 2 puntos o menos): con una coincidencia clara no
 * se arrastran las vecinas que solo comparten la carpeta («/finanzas/…»).
 */
export function sugerenciasParaLaDireccion<T extends DestinoDelMenu>(pathname: string, destinos: readonly T[], max = 3): T[] {
  const buscadas = palabras(direccionLegible(pathname)).filter((p) => !pareceUnId(p));
  if (buscadas.length === 0) return [];

  const puntuados = destinos.map((destino, orden) => {
    const deLaEtiqueta = palabras(destino.etiqueta);
    const todas = [...deLaEtiqueta, ...palabras(destino.href), ...palabras(destino.padre ?? "")];
    let puntaje = 0;
    for (const buscada of buscadas) puntaje += Math.max(0, ...todas.map((p) => parecido(buscada, p)));
    // La etiqueta entera calza con lo escrito: es la que buscaba, no una vecina.
    const etiquetaCompleta =
      deLaEtiqueta.length > 0 && deLaEtiqueta.every((p) => buscadas.some((b) => parecido(b, p) >= 2));
    return { destino, orden, puntaje: puntaje + (etiquetaCompleta ? 1 : 0) };
  });

  const mejor = Math.max(0, ...puntuados.map((p) => p.puntaje));
  const piso = Math.max(2, mejor - 2);
  const vistos = new Set<string>();
  return puntuados
    .filter((p) => p.puntaje >= piso)
    .sort((a, b) => b.puntaje - a.puntaje || a.orden - b.orden)
    .filter((p) => (vistos.has(p.destino.href) ? false : (vistos.add(p.destino.href), true)))
    .slice(0, max)
    .map((p) => p.destino);
}
