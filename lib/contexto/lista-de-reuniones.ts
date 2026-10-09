/**
 * lib/contexto/lista-de-reuniones.ts — los textos y los estados de la lista de reuniones de todo
 * «Contexto adicional» (2026-10-09). PURO.
 *
 * Una sola lista de reuniones para la propuesta, los proyectos (handoff, cronograma y documentos) y la
 * preventa (components/contexto/ListaDeReuniones.tsx). Lo que depende de la cuenta («Elegiste 2 de
 * 4», «Quitar las 2», «Quitaste 1 reunión.») y cómo se dice el estado de cada reunión viven acá, en un
 * solo lugar con su prueba: tres pantallas que cuentan distinto son tres formas de equivocarse.
 *
 * Los estados de una reunión se dicen como PUNTO + TEXTO en la línea de datos, nunca como píldora en
 * mayúsculas (diseño «Contexto · columna de reuniones»): lo que pide atención en ámbar, lo que está
 * bien en verde, lo neutro en gris, y lo que solo informa —«Leída»— como texto gris, sin punto.
 */

/** Todas las fechas en la hora de Costa Rica: el VPS no corre en esa zona y una reunión de las 8 p. m. es de ese día. */
const ZONA = "America/Costa_Rica";
/** Node y Chrome meten espacios especiales distintos: sin igualarlos, servidor y navegador no coinciden. */
const conEspaciosComunes = (s: string) => s.replace(/[\u00a0\u202f\u2007\u2009]/g, " ");

/**
 * La fecha de la línea de datos: «28 sept», o «28 sept 2025» si no es de este año. La misma en las
 * tres listas (antes la propuesta, los proyectos y la preventa la escribían cada una a su manera).
 */
export function fechaDeReunion(fecha: string | number | Date, ahora: Date = new Date()): string {
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(f.getTime())) return "";
  const anio = (x: Date) => x.toLocaleDateString("es-CR", { year: "numeric", timeZone: ZONA });
  return conEspaciosComunes(
    f.toLocaleDateString("es-CR", {
      day: "numeric",
      month: "short",
      ...(anio(f) !== anio(ahora) ? { year: "numeric" } : {}),
      timeZone: ZONA,
    }),
  ).replace(/\.$/, "");
}

/** La línea de datos con el origen, donde el origen varía (la preventa): «HubSpot · 28 sept». */
export function datosConOrigen(origen: string, fecha: string | number | Date, ahora: Date = new Date()): string {
  const f = fechaDeReunion(fecha, ahora);
  return [origen.trim(), f].filter(Boolean).join(" · ");
}

/** Cómo se pinta un estado: el color del punto (o ninguno) y del texto. */
export type TonoDelEstado = "atencion" | "bien" | "neutro" | "sinPunto";

export interface EstadoDeReunion {
  texto: string;
  tono: TonoDelEstado;
  /** El detalle, para el `title` (la insignia del material del cronograma). */
  detalle?: string;
}

/** La fila de arriba: qué dice y cómo está la casilla «Elegir todas». */
export interface BarraDeEleccion {
  rotulo: string;
  casilla: "vacia" | "parcial" | "llena";
  /** El nombre accesible de la casilla: lo que hace al tocarla. */
  etiqueta: string;
}

export function barraDeEleccion(elegidas: number, total: number): BarraDeEleccion {
  if (elegidas <= 0 || total <= 0) return { rotulo: "Elegir todas", casilla: "vacia", etiqueta: "Elegir todas" };
  if (elegidas >= total) {
    return {
      rotulo: total === 1 ? "Elegiste la única" : `Elegiste las ${total}`,
      casilla: "llena",
      etiqueta: "No elegir ninguna",
    };
  }
  return { rotulo: `Elegiste ${elegidas} de ${total}`, casilla: "parcial", etiqueta: "Elegir todas" };
}

/** El botón de la fila de arriba con algo elegido. */
export function textoDeQuitar(elegidas: number): string {
  return elegidas === 1 ? "Quitar la reunión" : `Quitar las ${elegidas}`;
}

/** La franja de deshacer, con lo último que se quitó. */
export function textoDeDeshacer(quitadas: number): string {
  return quitadas === 1 ? "Quitaste 1 reunión." : `Quitaste ${quitadas} reuniones.`;
}

/** El aviso de una reunión que no se puede leer o todavía no ocurrió (propuesta y proyectos). */
export function estadoDeLaReunion(r: { futura?: boolean; sinTranscripcion?: boolean }): EstadoDeReunion | null {
  if (r.futura) return { texto: "Aún no ocurrió", tono: "atencion" };
  if (r.sinTranscripcion) return { texto: "Sin transcripción", tono: "atencion" };
  return null;
}

/**
 * La insignia del material del cronograma (lib/contexto/material-cronograma.ts › insigniaDelMaterial)
 * pasada a punto + texto: verde = bien, ámbar = atención, cualquier otro tono = neutro. El detalle
 * («la IA lee 3 200 de 7 100 caracteres») queda en el `title`.
 */
export function estadoDesdeInsignia(i: { label: string; tone: string; detalle?: string } | null | undefined): EstadoDeReunion | null {
  if (!i || !i.label.trim()) return null;
  const tono: TonoDelEstado = i.tone === "green" ? "bien" : i.tone === "amber" ? "atencion" : "neutro";
  return { texto: i.label, tono, ...(i.detalle ? { detalle: i.detalle } : {}) };
}

/** La lectura de una reunión de la preventa: «● Sin leer» pide atención; «Leída» solo informa. */
export function estadoDeLectura(leida: boolean): EstadoDeReunion {
  return leida ? { texto: "Leída", tono: "sinPunto" } : { texto: "Sin leer", tono: "atencion" };
}

/**
 * Quién atiende Ctrl+Z en una pantalla con listas de reuniones: la lista A LA VISTA con el paso más
 * reciente (con dos, el handoff y el cronograma, la que quitó último). Devuelve su índice, o -1 si la
 * tecla no es de ninguna. Le toca a otro:
 *   · si estás trabajando en una superficie con deshacer PROPIO (el diagrama: tu último clic o el foco
 *     están adentro) — su pila no la ve nadie más;
 *   · si el deshacer global tiene algo a la vista hecho DESPUÉS (una tarea del Gantt), y el global va
 *     a atender con ese foco (con una casilla enfocada no atiende: ahí la lista no le cede la tecla,
 *     que se perdería).
 * Así Ctrl+Z deshace siempre lo último que hiciste. Las horas son `Date.now()`; 0 = nada que deshacer.
 */
export function listaQueDeshace(
  listas: readonly { ultimaQuita: number; visible: boolean }[],
  c: { ultimaDelGlobal: number; elGlobalAtiende: boolean; enSuperficieConDeshacerPropio: boolean },
): number {
  if (c.enSuperficieConDeshacerPropio) return -1;
  let elegida = -1;
  let hora = 0;
  listas.forEach((l, i) => {
    if (l.visible && l.ultimaQuita > hora) {
      elegida = i;
      hora = l.ultimaQuita;
    }
  });
  if (elegida < 0) return -1;
  return c.elGlobalAtiende && c.ultimaDelGlobal > hora ? -1 : elegida;
}
