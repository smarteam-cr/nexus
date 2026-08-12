/**
 * lib/timeline/sugerencia-detalle.ts
 *
 * QUÉ HACE CADA SUGERENCIA DE LA PROPUESTA, Y CUÁNTO MUEVE EL CIERRE. Puro, client-safe.
 *
 * ── EL HUECO QUE CIERRA (2026-08-11, mirando el Wherex real) ─────────────────
 * El encabezado del Gantt dice "Cierre proyectado: 22 sep 2026". Debajo, nueve sugerencias
 * cambian duraciones ("2 → 6 semanas") e inicios ("inicio auto → S2") — y NINGUNA decía qué le
 * hacía a esa fecha. El CSE aceptaba nueve cambios y se enteraba del corrimiento después.
 *
 * La matemática ya existía entera desde la Tanda J (`projectedEnd` + `phasesAfterDeltas` +
 * `anchorAfterDeltas`); lo único que faltaba era llamarla POR ÍTEM en vez de solo para el total.
 * Eso es todo lo que hace `impactoDeUnDelta`: proyecta el cierre con el set vacío (hoy) y con
 * ESE delta aceptado, y devuelve la diferencia.
 *
 * ── POR QUÉ MARGINAL Y NO ACUMULADO ──────────────────────────────────────────
 * Cada fila responde "si acepto ESTO, ¿qué pasa?", que es exactamente la decisión que tiene
 * enfrente. El acumulado de aceptar todo ya lo dice la franja de arriba (`magnitud-propuesta`),
 * así que repetirlo por fila sería el mismo número nueve veces. ⚠ Los marginales NO suman al
 * total cuando dos sugerencias tocan la misma cadena de fechas — es esperado, no un error de
 * cuentas: una fase en paralelo puede no mover el cierre sola y sí moverlo junto a otra.
 */
import { plural, projectedEnd, endShiftDays } from "./weeks";
import {
  anchorAfterDeltas,
  phasesAfterDeltas,
  type CurrentPhaseLike,
  type MovimientoDeFase,
  type PhaseFieldChange,
  type ProposalLike,
} from "./proposal-deltas";

const NINGUNO: ReadonlySet<string> = new Set<string>();

export interface ImpactoEnElCierre {
  /** Días que se movería el cierre aceptando SOLO este cambio. null = no se puede saber. */
  dias: number | null;
  /** `true` solo si de verdad mueve la fecha. Es lo que separa lo consecuente de lo cosmético. */
  mueve: boolean;
  /** Chip corto para la fila: "4 semanas más tarde" · "2 semanas antes". null si no mueve. */
  chip: string | null;
  /** Las dos fechas, para el detalle: "22 sep 2026 → 20 oct 2026". null si falta alguna. */
  fechas: string | null;
}

const SIN_IMPACTO: ImpactoEnElCierre = { dias: 0, mueve: false, chip: null, fechas: null };

/** En semanas cuando cae justo (el cronograma es semanal); si no, en días. */
function magnitudLegible(dias: number): string {
  const abs = Math.abs(dias);
  return abs % 7 === 0 ? plural(abs / 7, "semana", "semanas") : plural(abs, "día", "días");
}

/**
 * Cuánto movería el cierre aceptar SOLO el delta `deltaKey`.
 *
 * `current` y `proposal` son los mismos que consume `computeProposalDeltas` — se reusan
 * `phasesAfterDeltas`/`anchorAfterDeltas` a propósito: son la única simulación de "cómo
 * quedaría", y recalcularla acá sería un segundo algoritmo de fechas.
 */
export function impactoDeUnDelta(
  current: CurrentPhaseLike[],
  proposal: ProposalLike,
  currentAnchor: string | null,
  deltaKey: string,
): ImpactoEnElCierre {
  const soloEste = new Set([deltaKey]);
  const antes = projectedEnd(
    anchorAfterDeltas(currentAnchor, proposal, NINGUNO as Set<string>),
    phasesAfterDeltas(current, proposal, NINGUNO as Set<string>),
  );
  const despues = projectedEnd(
    anchorAfterDeltas(currentAnchor, proposal, soloEste),
    phasesAfterDeltas(current, proposal, soloEste),
  );

  const dias = endShiftDays(antes, despues);
  if (dias === null) {
    /* Sin ancla no hay fecha de cierre y por lo tanto no hay corrimiento que afirmar — mismo
       criterio que el resto del módulo de fechas: nunca se inventa una fecha de respaldo. */
    return { dias: null, mueve: false, chip: null, fechas: null };
  }
  if (dias === 0) return SIN_IMPACTO;

  return {
    dias,
    mueve: true,
    chip: `${magnitudLegible(dias)} ${dias > 0 ? "más tarde" : "antes"}`,
    fechas: antes.label && despues.label ? `${antes.label} → ${despues.label}` : null,
  };
}

/* ── EL DETALLE ANTES/DESPUÉS ───────────────────────────────────────────────
   Los chips de la fila dicen QUÉ cambia en dos palabras. Para decidir hace falta el valor
   viejo y el nuevo — y en un caso era directamente imposible: "notas actualizadas" no decía
   ni qué nota ni qué decía antes, así que no se podía ni aceptar ni descartar con criterio. */

export interface FilaDeDetalle {
  campo: PhaseFieldChange["field"];
  /** "Duración", "Inicio", "Notas"… */
  etiqueta: string;
  antes: string;
  despues: string;
  /** true = este campo corre fechas (duración e inicio). Se muestra primero. */
  mueveFechas: boolean;
}

const ETIQUETA: Record<PhaseFieldChange["field"], string> = {
  durationWeeks: "Duración",
  startWeek: "Inicio",
  sessionCount: "Sesiones",
  activityType: "Tipo",
  notes: "Notas",
  name: "Nombre",
};

const TIPO_LEGIBLE: Record<string, string> = {
  EXPLORACION: "Exploración",
  PLANIFICACION: "Planificación",
  CONFIGURACION: "Configuración",
  ADOPCION: "Adopción",
  SEGUIMIENTO: "Seguimiento",
};

function valorLegible(campo: PhaseFieldChange["field"], v: string | number | null): string {
  if (campo === "durationWeeks") return v === null ? "—" : plural(Number(v), "semana", "semanas");
  if (campo === "startWeek") return v === null ? "automático (tras la fase anterior)" : `semana ${v}`;
  if (campo === "sessionCount") return v === null ? "sin estimar" : String(v);
  if (campo === "activityType") return v === null ? "sin tipo" : (TIPO_LEGIBLE[String(v)] ?? String(v));
  if (campo === "notes") {
    const t = v === null ? "" : String(v).trim();
    return t.length > 0 ? t : "(sin notas)";
  }
  return v === null ? "—" : String(v);
}

/** Las filas del detalle, lo que mueve fechas primero. */
export function filasDeDetalle(changes: readonly PhaseFieldChange[]): FilaDeDetalle[] {
  const mueve = (f: PhaseFieldChange["field"]) => f === "durationWeeks" || f === "startWeek";
  return [...changes]
    .sort((a, b) => Number(mueve(b.field)) - Number(mueve(a.field)))
    .map((c) => ({
      campo: c.field,
      etiqueta: ETIQUETA[c.field],
      antes: valorLegible(c.field, c.from),
      despues: valorLegible(c.field, c.to),
      mueveFechas: mueve(c.field),
    }));
}

/**
 * El reordenamiento en palabras: SOLO las fases que se mueven, de mayor salto a menor.
 * "Sales Hub sube de 5º a 2º" en vez de la cadena de 10 nombres con flechas, que muestra el
 * destino y obliga a diffear a ojo contra el Gantt para saber qué se movió.
 */
export function describeMovimiento(m: MovimientoDeFase): string {
  return `${m.nombre} ${m.a < m.de ? "sube" : "baja"} de ${m.de}º a ${m.a}º`;
}

/** Los movimientos ordenados por cuánto se desplazan — el salto grande primero. */
export function movimientosPorSalto(movimientos: readonly MovimientoDeFase[]): MovimientoDeFase[] {
  return [...movimientos].sort((a, b) => Math.abs(b.a - b.de) - Math.abs(a.a - a.de));
}
