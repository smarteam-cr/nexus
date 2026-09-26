/**
 * lib/timeline/__fixtures__/propuesta-grande.ts — LA PROPUESTA GRANDE, anonimizada (L3 P3b, 2026-09-26).
 *
 * Un proyecto real («Regenerar todo» con 133 cambios crudos, 112 tareas vivas, una fase terminada y una
 * fase que se alarga) pasado por `plan-legible/fixture/anonimizar.cjs`, un script FUERA del repo: ids
 * `f01…f12` / `n:p01` / `t001…`, títulos `Tarea 001…` (por huella completa: dos títulos con la misma
 * huella dan el mismo), notas `Nota 001…`, fases «Semana 0» y `Fase A…L`, y el texto libre sintético.
 * Lo usan las guardas de L3 a L7 (spec §0.4).
 *
 * ⚠ Los tests LEEN el JSON (`leerFixtureGrande`), nunca lo importan: con `resolveJsonModule` y todos los .ts
 * en el `include` de tsconfig, un `import` haría que el «Running TypeScript» de `next build` infiera un
 * tipo literal de todo el archivo, justo la etapa que murió por memoria el 26-sep. El tipo va escrito a
 * mano acá. Guarda: `propuesta-grande.test.ts` (ningún .ts importa `__fixtures__/*.json`).
 */
import fs from "node:fs";
import path from "node:path";
import {
  leerBorrador,
  type Borrador,
  type Party,
  type TipoDeTarea,
  type Vivo,
} from "@/lib/timeline/borrador";

/** Una tarea viva del fixture: `TareaDelVivo` más su `order` y su `statusSource`. */
export interface TareaDelFixture {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: Party | null;
  type: TipoDeTarea | null;
  status: string;
  statusSource: string;
  source: string;
  needsValidation: boolean;
}

/** Una fase viva del fixture, en su orden. */
export interface FaseDelFixture {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  status: string;
  statusSource: string;
  source: string;
  tareas: TareaDelFixture[];
}

export interface FixtureGrande {
  /** De dónde sale (sin nombres reales). */
  _origen: string;
  /** El arranque del proyecto (YYYY-MM-DD). */
  ancla: string;
  /** El `hoy` fijo de las guardas, CON zona: sin ella, las atrasadas dependen de la máquina. */
  hoy: string;
  vivo: { fases: FaseDelFixture[] };
  /** El borrador-v1 tal como se guarda (`pendingProposal`): se lee con `leerBorrador`. */
  borrador: unknown;
  /** La salida del paso 2 que se fusionó (`timelineDetail`), con los mismos ids y textos. */
  paso2: {
    timelineDetail: {
      phases: Array<{
        id: string;
        activityType: string | null;
        tasks: Array<{
          title: string;
          weekIndex: number;
          notes: string | null;
          porValidar: boolean;
          party: Party | null;
          type: TipoDeTarea | null;
        }>;
      }>;
    };
  };
  /** Las instrucciones adicionales de la corrida anterior y de esta (sintéticas). */
  instrucciones: { antes: string; ahora: string };
  /** Lo último que se subió al cliente: su cierre, el día que se subió y sus semanas. */
  prometido: { cierreISO: string; fecha: string; semanas: number };
  /** El último handoff (aproximado): sus semanas y su fecha. */
  handoff: { semanas: number; fecha: string };
  /** Atrasos cargados, antes y después de lo prometido. */
  particularidades: Array<{ kind: "ATRASO"; party: Party; weeksImpact: number; occurredAt: string }>;
}

export const RUTA_DEL_FIXTURE_GRANDE = "lib/timeline/__fixtures__/propuesta-grande.json";
/** La fase terminada (la que la propuesta rellena con 8 tareas nuevas). */
export const FASE_TERMINADA = "f03";
/** La fase que pasa de 3 a 5 semanas. */
export const FASE_QUE_SE_ALARGA = "f12";
/** La fase nueva de la propuesta. */
export const FASE_NUEVA = "n:p01";

/** Lee el fixture del disco (nunca con `import`: ver arriba). */
export function leerFixtureGrande(): FixtureGrande {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), RUTA_DEL_FIXTURE_GRANDE), "utf8")) as FixtureGrande;
}

/** El cronograma vivo del fixture como lo lee el plan (sin fechas fijadas a mano). */
export function vivoDelFixture(f: FixtureGrande): Vivo {
  return {
    ancla: f.ancla,
    fases: f.vivo.fases.map((x) => ({
      id: x.id,
      name: x.name,
      durationWeeks: x.durationWeeks,
      startWeek: x.startWeek,
      sessionCount: x.sessionCount,
      notes: x.notes,
      activityType: x.activityType,
      status: x.status,
      tareas: x.tareas.map((t) => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        notes: t.notes,
        party: t.party,
        type: t.type,
        status: t.status,
        source: t.source,
        inicioFijado: null,
        finFijado: null,
        needsValidation: t.needsValidation,
      })),
    })),
  };
}

/** El borrador del fixture, leído como lo lee el servidor. */
export function borradorDelFixture(f: FixtureGrande): Borrador {
  const b = leerBorrador(f.borrador);
  if (!b) throw new Error("el borrador del fixture no se deja leer");
  return b;
}
