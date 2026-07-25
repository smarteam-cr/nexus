/**
 * lib/landing/hero-title.ts — el TÍTULO de la portada de un documento. PURO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Las portadas del motor están marcadas como "traen su propio encabezado", así que el
 * motor NO les pinta el rótulo del documento. Consecuencia: el único texto grande era el
 * titular que escribe el agente — una frase de venta larga— y si no estaba, la página no
 * tenía título de ninguna clase. En pantalla eso se veía como el texto de plantilla sin
 * llenar («[Verbo de transformación] la [operación / proceso] de [cliente]…»).
 *
 * Peor: cada portada resolvía ese hueco por su cuenta, con textos escritos a mano DENTRO
 * del componente. Como Exploración, Planificación e Implementación comparten la portada
 * de Desarrollo, las tres decían «Requerimiento técnico de integración» cuando estaban
 * vacías — el respaldo de un documento presentándose como otro.
 *
 * Acá vive la única cadena de respaldo, y el rótulo entra por parámetro: el respaldo sale
 * SIEMPRE del documento que se está pintando, nunca de uno escrito a mano en el
 * componente. Por eso una portada compartida ya no puede prestarle su identidad a otra.
 */

export interface HeroTitleInput {
  /** Lo que escribió el agente o se editó a mano como título (`data.titulo`). */
  escrito?: unknown;
  /** El titular del caso que ya existe en los documentos generados (`data.headline`). */
  titular?: unknown;
  /**
   * El rótulo del documento que resuelve el motor: lo que el CSE renombró, y si no,
   * el rótulo declarado en la definición ("Diagnóstico de rendimiento", "Plan de
   * implementación"…). Es el escalón que hace que nunca falte un título.
   */
  rotulo?: string | null;
}

export interface HeroTitleResult {
  /** El título de la página. Corto y nunca vacío (ver la nota de abajo). */
  titulo: string;
  /** El titular del caso, como bajada. "" cuando el titular SUBIÓ a ser el título. */
  bajada: string;
}

/**
 * Reparte los dos textos de la portada, con UNA regla que evita el problema obvio:
 * el titular del caso es el título **o** la bajada, nunca los dos.
 *
 * Por qué importa: los documentos que ya se generaron guardan su titular en `headline`
 * y lo muestran como título grande — algunos ya publicados y vistos por el cliente.
 * Si el titular bajara a bajada de golpe, esas páginas cambiarían de aspecto sin que
 * nadie las tocara. Así, en cambio: mientras el documento no tenga título propio, su
 * titular sigue siendo el título; cuando el agente (o una persona) le escribe uno, el
 * titular pasa a bajada y la portada queda con los tres niveles.
 *
 * `titulo` sale vacío solo si los tres escalones lo están — un estado que no puede
 * ocurrir en los documentos reales porque toda definición declara su rótulo, y hay un
 * candado (lib/landing/hero-title.test.ts) que falla si alguna deja de hacerlo. La
 * promesa "ninguna portada sin título" la sostiene ese test, no un texto de relleno
 * acá: un respaldo genérico tipo "Documento" taparía el error en vez de delatarlo.
 */
export function resolveHeroTitle({ escrito, titular, rotulo }: HeroTitleInput): HeroTitleResult {
  const propio = texto(escrito);
  const caso = texto(titular);
  if (propio) {
    // Si el título propio y el titular dicen LO MISMO, la bajada se calla: repetir el
    // mismo texto dos veces seguidas se lee como un error de la página, y es un empate
    // fácil de producir (el agente escribiendo ambos campos, o alguien copiando uno en
    // el otro). Se compara sin distinguir mayúsculas ni espacios de más.
    return { titulo: propio, bajada: mismoTexto(propio, caso) ? "" : caso };
  }
  // Sin título propio: el titular ocupa su lugar y no se repite abajo.
  if (caso) return { titulo: caso, bajada: "" };
  return { titulo: (rotulo ?? "").trim(), bajada: "" };
}

function mismoTexto(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return !!b && norm(a) === norm(b);
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Tope de largo para el título que escribe el agente, en caracteres.
 *
 * No lo recorta el código —cortar una frase a la mitad es peor que una larga—: es el
 * número que se le declara al agente en la guía de cada portada, y el que este módulo
 * expone para que las seis definiciones digan lo mismo desde un solo lugar.
 */
export const HERO_TITLE_MAX_CHARS = 60;

/**
 * La frase que se le pide al agente, para que las seis portadas pidan lo mismo.
 *
 * Dice "puede precisar de qué trata este caso" a propósito: sin esa licencia salen
 * títulos genéricos, todos iguales entre proyectos. Con ella salen los que sirven
 * ("Integración HubSpot–SAP: módulo CXC y cobranza"). Es la misma instrucción que usa
 * el backfill de los documentos ya escritos (scripts/backfill-titulos-portada.ts) —
 * tienen que pedir lo mismo o conviven dos estilos de título en la misma app.
 */
export function heroTitleBrief(ejemplo: string): string {
  return (
    `\`titulo\`: el nombre del documento en pocas palabras (máximo ${HERO_TITLE_MAX_CHARS} ` +
    `caracteres), del tipo "${ejemplo}", pudiendo precisar de qué trata este caso concreto ` +
    `(los sistemas involucrados, el objeto del trabajo). Es un sintagma nominal, no un ` +
    `titular de venta: sin verbos conjugados, sin promesas y sin el nombre del cliente. `
  );
}
