/**
 * lib/asistente/alcance.ts — LA LÍNEA DE ALCANCE QUE SE ANTEPONE AL MENSAJE DEL CSE. Puro.
 *
 * El chip del chat («Sobre «X»») viaja al modelo como una línea al principio del texto del turno. Vive
 * acá, fuera de `components/asistente/chat-de-seccion.tsx` (que la re-exporta), para poder probarla:
 * el project `unit` solo corre `lib/**`.
 *
 * ⚠ Va en el CONTENIDO del turno y no en un campo aparte porque el hilo se re-manda entero al modelo
 * en cada turno: lo que no está en el texto no existe dos mensajes después. Mismo mecanismo que el
 * bloque de pendientes, y misma razón.
 *
 * ⛔ Y por eso mismo hay que SACARLA al pintar: es una instrucción para el modelo, no algo que la
 * persona escribió. Verla entera arriba de su propia frase —repitiendo lo que el chip ya dice al
 * lado— se lee como ruido del sistema metido en su mensaje. Visto en pantalla el 2026-08-22.
 *
 * E4 P1: el «IA» de cada fase del Gantt abre el chat con la fase señalada (`tipo: "fase"`, la key
 * `fase:<id>`). Su línea es otra marca; la de una sección queda byte a byte igual, así los hilos
 * viejos se siguen limpiando.
 */

export interface SeccionReferida {
  key: string;
  label: string;
  /**
   * ⭐ El texto del ÍTEM que se señaló, cuando el pedido salió del 💬 de una tarjeta y no del
   * botón de la sección entera.
   *
   * Es la misma cuerda que el campo `cita` de las operaciones (`lib/canvas/citas-de-documento.ts`):
   * el modelo recibe el texto que la persona señaló y lo devuelve como identificador. Por eso
   * señalar en pantalla y escribir «cambia donde dice X» terminan en el MISMO mecanismo — no en
   * dos caminos que pueden divergir.
   */
  cita?: string;
  /** E4 P1: una FASE del cronograma, señalada con su «IA». La key es `fase:<id>`. */
  tipo?: "fase";
}

export const MARCA_DE_ALCANCE = "[SOBRE LA SECCIÓN";
/** E4 P1: la marca de una fase del cronograma. */
export const MARCA_DE_FASE = "[SOBRE LA FASE";
/** Las marcas que `mensajeSinAlcance` sabe sacar. */
export const MARCAS_DE_ALCANCE = [MARCA_DE_ALCANCE, MARCA_DE_FASE] as const;

/** El prefijo de la key de una fase señalada: `fase:<id>` (el id vivo, o `n:…` de una fase nueva). */
export const PREFIJO_DE_FASE = "fase:";

export function lineaDeAlcance(seccion: SeccionReferida | null): string {
  if (!seccion) return "";
  if (seccion.tipo === "fase") {
    return (
      `${MARCA_DE_FASE} «${seccion.label}» [${seccion.key.slice(PREFIJO_DE_FASE.length)}]]\n` +
      "La persona la señaló con «IA» en el Gantt: es de dónde vino el pedido, no un límite; si habla de otra fase, atiéndelo igual.\n\n"
    );
  }
  /* ⚠ La línea de la cita va DENTRO del bloque, antes de la línea en blanco que lo cierra: si
     quedara después, `mensajeSinAlcance` cortaría en el primer «\n\n» y el marcador se pintaría
     crudo arriba del mensaje de la persona — el bug que ya se vio en pantalla el 2026-08-22. */
  const cita = seccion.cita?.trim()
    ? `Señaló el punto que dice: «${seccion.cita.trim()}». Úsalo como \`cita\` para identificarlo.\n`
    : "";
  return (
    `${MARCA_DE_ALCANCE} «${seccion.label}» (${seccion.key})]\n` +
    cita +
    "Es de dónde vino el pedido, no un límite: si lo que sigue habla de otra sección, atiéndelo igual.\n\n"
  );
}

/**
 * El texto del CSE tal como lo escribió, sin la línea de alcance.
 *
 * ⚠ Se corta por la línea en blanco que cierra el bloque, no por el largo del texto: el marcador
 * tiene dos líneas y el mensaje puede empezar con lo que sea. Si el bloque no está, devuelve el
 * mensaje intacto — un turno viejo, o uno mandado sin alcance.
 */
export function mensajeSinAlcance(texto: string): string {
  if (!MARCAS_DE_ALCANCE.some((m) => texto.startsWith(m))) return texto;
  const corte = texto.indexOf("\n\n");
  return corte === -1 ? texto : texto.slice(corte + 2);
}
