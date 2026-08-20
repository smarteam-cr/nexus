/**
 * lib/timeline/reparar-propuesta.ts — UN ENTERO FUERA DE RANGO NO TIRA EL CAMBIO ENTERO.
 *
 * PURO. Sin Prisma, sin red.
 *
 * ── EL CASO REAL QUE LO ORIGINÓ (2026-08-20) ─────────────────────────────────────────────────
 * Elías conversó con el asistente para fusionar dos fases de Wherex: «Configuración Marketing Hub»
 * (2 semanas, 7 tareas) dentro de «Marketing Hub» (4 semanas, 5 tareas), dejando 12 tareas en una
 * fase de 4 semanas. El modelo hizo el trabajo bien… y dejó UNA tarea de otra fase —«Reportería y
 * Data», que la instrucción ni mencionaba— en la semana 2 de una fase de 2 semanas.
 *
 * Resultado: `validateTimelinePayload` rechazó la propuesta ENTERA con
 * `phases[6].tasks[7].weekIndex debe ser entero en [0, durationWeeks)`. **231 segundos y $0,29 de
 * modelo tirados por un entero**, con un mensaje que el CSE no puede accionar y sobre una fase que
 * él nunca pidió tocar.
 *
 * ── POR QUÉ REPARAR Y NO SOLO VALIDAR ────────────────────────────────────────────────────────
 * El repo YA sabía que esto pasa: `rescate-progreso.ts:22-25` documenta exactamente este 400 y
 * recorta la semana para evitarlo. Pero ese recorte corre DESPUÉS de la validación, así que en
 * este camino no llega a actuar nunca. Esto adelanta la misma idea al único lugar donde sirve.
 *
 * ⛔ SOLO SE REPARA LO ARITMÉTICO, Y ES LA LÍNEA QUE NO SE CRUZA. Una semana fuera de rango tiene
 * UNA sola corrección sensata (la última semana que existe). Un título vacío, un id inventado o
 * una fase sin nombre NO: ahí adivinar sería inventar contenido, y para eso está el rechazo.
 *
 * ⚠ Y lo reparado se REPORTA. El repo avisa, nunca arregla en silencio: si el modelo movió una
 * tarea a una semana que no existe, el CSE tiene que verlo en la vista previa — puede ser la
 * señal de que la fase quedó corta para lo que le metieron.
 */

export interface ReparacionDePropuesta {
  /** La propuesta con los enteros acomodados. Es el mismo objeto, mutado. */
  propuesta: unknown;
  /** Qué se acomodó, en castellano, para mostrárselo al CSE. Vacío = no hizo falta nada. */
  arreglos: string[];
}

type Obj = Record<string, unknown>;

const esObjeto = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Acomoda los `weekIndex` que caen fuera de su fase y los `order` negativos.
 *
 * No valida nada más: lo que quede mal después de esto lo rechaza `validateTimelinePayload`, que
 * sigue siendo el único juez de si la propuesta es aplicable.
 */
export function repararPropuesta(crudo: unknown): ReparacionDePropuesta {
  const arreglos: string[] = [];
  if (!esObjeto(crudo) || !Array.isArray(crudo.phases)) return { propuesta: crudo, arreglos };

  for (const fase of crudo.phases) {
    if (!esObjeto(fase) || !Array.isArray(fase.tasks)) continue;

    const duracion = fase.durationWeeks;
    /* Sin una duración utilizable no hay contra qué recortar: se deja pasar y que valide. */
    if (typeof duracion !== "number" || !Number.isInteger(duracion) || duracion < 1) continue;
    const ultimaSemana = duracion - 1;
    const nombre = typeof fase.name === "string" ? fase.name : "(sin nombre)";

    let desbordadas = 0;
    for (const tarea of fase.tasks) {
      if (!esObjeto(tarea)) continue;

      const w = tarea.weekIndex;
      if (typeof w === "number" && Number.isFinite(w)) {
        const entero = Math.floor(w);
        const acotado = Math.min(Math.max(entero, 0), ultimaSemana);
        if (acotado !== w) {
          tarea.weekIndex = acotado;
          desbordadas++;
        }
      }

      /* `order` solo se toca si es un número inválido: el orden REAL lo reasigna el aplicador.
         Acá alcanza con que no rompa la validación por ser negativo o fraccionario. */
      const o = tarea.order;
      if (typeof o === "number" && Number.isFinite(o)) {
        const entero = Math.max(Math.floor(o), 0);
        if (entero !== o) tarea.order = entero;
      }
    }

    if (desbordadas > 0) {
      arreglos.push(
        `En «${nombre}» ${desbordadas === 1 ? "una tarea quedaba" : `${desbordadas} tareas quedaban`} ` +
          `fuera de las ${duracion} ${duracion === 1 ? "semana" : "semanas"} de la fase; ` +
          `${desbordadas === 1 ? "se movió" : "se movieron"} a la última semana. ` +
          `Conviene revisar si la fase necesita más semanas.`,
      );
    }
  }

  return { propuesta: crudo, arreglos };
}
