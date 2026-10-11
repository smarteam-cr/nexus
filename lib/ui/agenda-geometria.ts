/**
 * lib/ui/agenda-geometria.ts — la geometría de arrastrar un bloque en `AgendaDeLaSemana` (docs/tareas-plan.md §5.9).
 * PURA, client-safe y sin dependencias: la pantalla mide, esto decide.
 *
 * La lección de `semanaEnX` (el Gantt de la propuesta): la medida se lee VIVA en cada movimiento (la grilla puede
 * cambiar de tamaño mientras se arrastra), se guarda una sola vez al soltar, y si el nodo mide 0×0 no se mueve nada:
 * devolver un «default» con una medida en cero mandó una vez todo a la primera semana.
 *
 * Todo se cuenta en MINUTOS desde el inicio de la grilla (la primera hora rotulada), en saltos de `paso`. Se trabaja
 * con el DESPLAZAMIENTO desde donde se agarró, no con la posición absoluta: así el bloque no salta a donde está el
 * puntero si se lo agarró del medio.
 */

export interface GeometriaDeLaAgenda {
  /** Ancho, en px, de las columnas de los días (sin la columna de las horas). */
  ancho: number;
  /** Alto, en px, de la grilla. */
  alto: number;
  dias: number;
  /** Minutos que cubre la grilla de arriba abajo. */
  minutosTotales: number;
  /** El salto, en minutos (15). */
  paso: number;
}

export interface PosicionEnMinutos {
  /** 0 = lunes. */
  dia: number;
  /** Minutos desde el inicio de la grilla. */
  desde: number;
  minutos: number;
}

/** Lo que ya pasó: los días antes de `dia` enteros y, ese día, hasta `desde`. */
export interface Pasado {
  dia: number;
  desde: number;
}

function medible(g: GeometriaDeLaAgenda): boolean {
  return g.ancho > 0 && g.alto > 0 && g.dias > 0 && g.minutosTotales > 0 && g.paso > 0;
}

function alPaso(min: number, paso: number): number {
  return Math.round(min / paso) * paso;
}

function limitar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** ¿Arranca en algo que ya pasó? */
export function caeEnElPasado(p: Pick<PosicionEnMinutos, "dia" | "desde">, pasado: Pasado | null | undefined): boolean {
  if (!pasado) return false;
  return p.dia < pasado.dia || (p.dia === pasado.dia && p.desde < pasado.desde);
}

/**
 * Mover: el bloque se corre lo que se corrió el puntero, en días enteros y en saltos de `paso`, sin salirse de la
 * grilla (ni arriba ni abajo, ni antes del lunes ni después del viernes). Devuelve `null` si no hay medida o si
 * cae en el pasado: ahí el bloque se queda donde estaba.
 */
export function moverBloque(
  orig: PosicionEnMinutos,
  dx: number,
  dy: number,
  g: GeometriaDeLaAgenda,
  pasado?: Pasado | null,
): PosicionEnMinutos | null {
  if (!medible(g)) return null;
  const anchoDelDia = g.ancho / g.dias;
  const dia = limitar(orig.dia + Math.round(dx / anchoDelDia), 0, g.dias - 1);
  const minutos = Math.min(orig.minutos, g.minutosTotales);
  const desde = limitar(alPaso(orig.desde + (dy / g.alto) * g.minutosTotales, g.paso), 0, g.minutosTotales - minutos);
  const nueva = { dia, desde, minutos };
  return caeEnElPasado(nueva, pasado) ? null : nueva;
}

/** Estirar desde el borde de abajo: cambia la duración, en saltos de `paso`, entre un salto y el final de la grilla. */
export function estirarBloque(orig: PosicionEnMinutos, dy: number, g: GeometriaDeLaAgenda): PosicionEnMinutos | null {
  if (!medible(g)) return null;
  const minutos = limitar(alPaso(orig.minutos + (dy / g.alto) * g.minutosTotales, g.paso), g.paso, g.minutosTotales - orig.desde);
  return { ...orig, minutos };
}

/** La posición en minutos de un bloque ubicado en fracciones del alto (como los recibe la agenda). */
export function enMinutos(b: { dia: number; arriba: number; alto: number }, minutosTotales: number, paso: number): PosicionEnMinutos {
  return { dia: b.dia, desde: alPaso(b.arriba * minutosTotales, paso), minutos: Math.max(paso, alPaso(b.alto * minutosTotales, paso)) };
}

export function mismaPosicion(a: PosicionEnMinutos, b: PosicionEnMinutos): boolean {
  return a.dia === b.dia && a.desde === b.desde && a.minutos === b.minutos;
}
