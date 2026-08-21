/**
 * lib/timeline/dependencias-de-operaciones.ts — QUÉ OPERACIÓN NECESITA A CUÁL.
 *
 * PURO. Sin Prisma, sin red, sin React.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * Desde que el chat emite las operaciones de tarea ENUMERADAS —una por tarea, para que la cajita
 * azul las nombre— un acuerdo normal pasó de 2 líneas a 12. Y aplicar es todo-o-nada: si una sola
 * se rechaza, no se aplica ninguna. La auditoría del 2026-08-21 lo marcó como el hueco más caro:
 * con lotes de doce, «Aplicar» se volvió una apuesta.
 *
 * El arreglo es dejar aceptar un subconjunto. Pero un subconjunto NO es «cualquier combinación»:
 *
 *   1. fase.crear  «Cierre con junta» ref=cierreJD
 *   2. tarea.crear phaseId=cierreJD  «Revisión conjunta»
 *
 * Desmarcar la 1 y dejar la 2 produce una operación que apunta a una fase que no existe. El
 * ejecutor la rechaza —correctamente— y el rechazo tumba el lote entero, así que la persona
 * desmarca UNA cosa y no se aplica NADA. Peor que el todo-o-nada que se vino a arreglar.
 *
 * ⭐ Este módulo dice, para cada operación, de cuáles depende. La pantalla usa eso para
 * desmarcar en cascada, de forma VISIBLE — nunca para aplicar en silencio algo que se desmarcó.
 *
 * ── ⚠ LO QUE NO INTENTA ──────────────────────────────────────────────────────────────────────
 * No modela el orden general de ejecución. Dos `fase.duracion` sobre la misma fase se pisan y
 * gana el último, y eso está bien: son independientes, no dependientes. Acá solo se declara la
 * dependencia DURA — la que convierte una operación en imposible si la otra no corre.
 */
import type { Operacion } from "./operaciones";

/**
 * Para cada índice, los índices que TIENEN que aplicarse para que esa operación sea posible.
 * Vacío = independiente.
 */
export function dependenciasDeOperaciones(
  operaciones: readonly Operacion[],
): Map<number, number[]> {
  const mapa = new Map<number, number[]>();

  /* Dónde se crea cada `ref`. Solo la PRIMERA: dos `fase.crear` con el mismo ref las rechaza el
     ejecutor, así que acá no hay que desempatar nada. */
  const creaLaFase = new Map<string, number>();
  operaciones.forEach((o, i) => {
    if (o.op === "fase.crear" && o.ref?.trim() && !creaLaFase.has(o.ref.trim())) {
      creaLaFase.set(o.ref.trim(), i);
    }
  });

  operaciones.forEach((o, i) => {
    const requiere: number[] = [];
    /* Toda operación que nombra una fase por su `ref` depende de la que la crea. */
    const phaseId = "phaseId" in o ? o.phaseId : null;
    if (phaseId) {
      const origen = creaLaFase.get(phaseId.trim());
      if (origen !== undefined && origen !== i) requiere.push(origen);
    }
    mapa.set(i, requiere);
  });

  return mapa;
}

/**
 * Dado lo que la persona desmarcó, devuelve TODO lo que queda fuera — arrastrando lo que ya no
 * puede correr. Es la cascada, y se calcula acá (no en la pantalla) para que sea testeable.
 *
 * ⚠ Itera hasta estabilizarse: una tarea puede depender de una fase que a su vez dependiera de
 * otra. Hoy la cadena es de un solo salto, pero el día que no lo sea esto no se rompe en silencio.
 */
export function arrastreAlDesmarcar(
  operaciones: readonly Operacion[],
  desmarcadas: ReadonlySet<number>,
): Set<number> {
  const deps = dependenciasDeOperaciones(operaciones);
  const fuera = new Set(desmarcadas);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const [i, requiere] of deps) {
      if (fuera.has(i)) continue;
      if (requiere.some((r) => fuera.has(r))) {
        fuera.add(i);
        cambio = true;
      }
    }
  }
  return fuera;
}
