/**
 * lib/timeline/heredar-omitidos.ts — LO QUE EL MODIFICADOR OMITE ES «NO TOCAR», NO «BORRAR». Puro.
 *
 * ── EL PROBLEMA (validación 2026-09-23) ──────────────────────────────────────
 * «Pedir cambio con IA» devuelve el cronograma COMPLETO. Cuando el modelo repite una fase o una
 * tarea sin alguno de sus campos, el camino de siempre lo leía como vacío:
 *  · el validador del PUT convierte `sessionCount` y `notes` omitidos en null (se borraban);
 *  · una tarea que se MUDA de fase pierde su id (el PUT la recrea), así que nacía sin dueño, sin
 *    tipo y sin nota aunque el modelo la hubiera copiado bien;
 *  · la vista previa mostraba «arranque relativo 3 → auto» por un `startWeek` que solo faltaba.
 *
 * `heredarLoOmitido` corre sobre el JSON CRUDO del modelo, ANTES de `repararPropuesta` y del
 * validador: rellena con lo actual lo que falta, y respeta lo que vino (un null explícito es un
 * pedido: «quitale el dueño» sigue funcionando). MUTA el crudo, igual que `repararPropuesta`.
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 *  1. Fase con id conocido: si falta la CLAVE (`in`, no `??`) de startWeek, activityType,
 *     sessionCount o notes, hereda la actual.
 *  2. Tarea con id conocido, en CUALQUIER fase (la ruta le quita el id después si cambió de fase):
 *     hereda party, type y notes omitidos.
 *  3. Tarea SIN id que es una mudanza: su título coincide con UNA sola tarea actual de OTRA fase que
 *     la propuesta ya no trae. Es el mismo criterio —y la misma llave, `huella`— con que la vista
 *     previa arma el ítem «tarea-se-muda» (lib/timeline/assist-items.ts): si fueran distintos, la
 *     pantalla mostraría una mudanza que el servidor no reconoció, o al revés. Con dos homónimas no
 *     se adivina.
 *  No toca title, weekIndex, order ni durationWeeks, ni la regla «tasks ausente = []» de la ruta.
 *  Solo hereda valores que existen: heredar un null sería lo mismo que omitirlo.
 */
import { huella } from "./assist-items";

export interface TareaParaHeredar {
  id: string;
  title: string;
  /* ⚠ OBLIGATORIOS aunque puedan ser null: si alguien los saca del select de la ruta, tsc falla
     acá en vez de que la herencia deje de heredarlos en silencio. */
  party: string | null;
  type: string | null;
  notes: string | null;
}

export interface FaseParaHeredar {
  id: string;
  startWeek: number | null;
  activityType: string | null;
  sessionCount: number | null;
  notes: string | null;
  tasks: readonly TareaParaHeredar[];
}

export interface Herencia {
  /** Cuántos campos se completaron con lo actual. */
  heredados: number;
  /** Ids de las tareas actuales reconocidas como MUDADAS a otra fase (regla 3). */
  mudanzas: string[];
}

const CAMPOS_DE_FASE = ["startWeek", "activityType", "sessionCount", "notes"] as const;
const CAMPOS_DE_TAREA = ["party", "type", "notes"] as const;

type Crudo = Record<string, unknown>;
const esObjeto = (v: unknown): v is Crudo => !!v && typeof v === "object" && !Array.isArray(v);

/** Completa en `destino` las claves AUSENTES con el valor actual, si lo hay. Devuelve cuántas. */
function completar<K extends string>(destino: Crudo, actual: Readonly<Record<K, unknown>>, campos: readonly K[]): number {
  let n = 0;
  for (const campo of campos) {
    if (campo in destino) continue; // presente —aunque sea null— es un pedido: se respeta
    const valor = actual[campo];
    if (valor === null || valor === undefined) continue;
    destino[campo] = valor;
    n++;
  }
  return n;
}

export function heredarLoOmitido(crudo: unknown, actuales: readonly FaseParaHeredar[]): Herencia {
  const out: Herencia = { heredados: 0, mudanzas: [] };
  if (!esObjeto(crudo) || !Array.isArray(crudo.phases)) return out;

  const faseActualPorId = new Map(actuales.map((f) => [f.id, f]));
  const tareaActualPorId = new Map<string, TareaParaHeredar>();
  const faseDeTarea = new Map<string, string>();
  for (const f of actuales) {
    for (const t of f.tasks) {
      tareaActualPorId.set(t.id, t);
      faseDeTarea.set(t.id, f.id);
    }
  }

  const idsPropuestos = new Set<string>();
  const sinId: Array<{ claveFase: string; clave: string; tarea: Crudo }> = [];

  crudo.phases.forEach((fase, i) => {
    if (!esObjeto(fase)) return;
    const idDeFase = typeof fase.id === "string" && fase.id ? fase.id : null;
    // Regla 1.
    const faseActual = idDeFase ? faseActualPorId.get(idDeFase) : undefined;
    if (faseActual) out.heredados += completar(fase, faseActual, CAMPOS_DE_FASE);

    const claveFase = idDeFase ?? `n${i}`; // la misma clave que `claveDeFase` de assist-items
    if (!Array.isArray(fase.tasks)) return;
    fase.tasks.forEach((tarea, j) => {
      if (!esObjeto(tarea)) return;
      const idDeTarea = typeof tarea.id === "string" && tarea.id ? tarea.id : null;
      if (idDeTarea) {
        idsPropuestos.add(idDeTarea);
        // Regla 2.
        const actual = tareaActualPorId.get(idDeTarea);
        if (actual) out.heredados += completar(tarea, actual, CAMPOS_DE_TAREA);
        return;
      }
      if (typeof tarea.title === "string") sinId.push({ claveFase, clave: `${claveFase}:${j}`, tarea });
    });
  });

  // Regla 3 — el mismo recorrido que `indexar` en assist-items.ts.
  const consumidas = new Set<string>();
  for (const [id, actual] of tareaActualPorId) {
    if (idsPropuestos.has(id)) continue;
    const faseOrigen = faseDeTarea.get(id);
    const candidatas = sinId.filter(
      (c) =>
        huella(c.tarea.title as string) === huella(actual.title) &&
        c.claveFase !== faseOrigen &&
        !consumidas.has(c.clave),
    );
    if (candidatas.length !== 1) continue;
    const c = candidatas[0];
    consumidas.add(c.clave);
    out.mudanzas.push(id);
    out.heredados += completar(c.tarea, actual, CAMPOS_DE_TAREA);
  }
  return out;
}
