/**
 * lib/timeline/acomodar-en-paralelo.ts — LOS INICIOS DE LAS FASES LOS PONE EL CÓDIGO, NO LA IA
 * (2026-10-02). PURO.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────
 * El prompt del handoff decía «por defecto las fases son SECUENCIALES; paralelo solo con equipos
 * distintos». En los 50 cronogramas activos, solo el desarrollo corría en paralelo, y la capacitación
 * iba después de TODA la configuración en 15 de los 19 que la tienen. En Club Amantes del Vino eso
 * solo ya sumaba 2 semanas: con la capacitación en la segunda mitad de la configuración, el plan
 * entra en las 12 vendidas. Elías: «Configuración, migración y capacitación normalmente van juntas;
 * pruebas y ajustes van después de configurar.» El repo ya aprendió que la aritmética de semanas la
 * hace mal el modelo («la cuenta la hace el sistema», lib/agents/estructura-cronograma.ts): acá la IA
 * dice QUÉ es cada fase (`tipo`) y el código pone CUÁNDO arranca.
 *
 * ── LA REGLA (decisiones de Elías, 2026-10-02) ───────────────────────────────
 *  arranque → diagnóstico → planificación, en fila.
 *  Después, juntas: la configuración (sus fases en fila entre sí: es el mismo equipo), la migración
 *  (en fila entre sí, en paralelo a la configuración) y el desarrollo (el inicio que dio la IA, que es
 *  el de su equipo; si no dio, en paralelo a la configuración).
 *  La capacitación arranca en la SEGUNDA MITAD de la configuración — de la de su Hub, si su nombre lo
 *  nombra («Capacitación Sales» con «Configuración Sales Hub»); si no, la del bloque entero.
 *  Pruebas y ajustes, al terminar la configuración y la migración.
 *  El cierre, al final de todo.
 *
 * ── LO QUE NO HACE ───────────────────────────────────────────────────────────
 *  · No cambia duraciones ni nombres: solo inicios y orden.
 *  · NUNCA alarga el plan. Si con la regla queda más largo que como lo armó la IA (pasó con Metzger: la
 *    IA ya había puesto la capacitación antes), se queda el de la IA. El código acomoda para que quepa,
 *    no para estirar (medido sobre los 38 handoffs de Customer Success activos, 2026-10-02).
 *  · No toca un plan con alguna fase sin tipo reconocible: ahí no sabe razonar y lo deja como vino.
 *  · Solo para la implementación de Customer Success (la que tiene Semana 0). Desarrollo y Web tienen
 *    su propia secuencia; ahí lo decide el handoff por tipo, como siempre.
 *
 * ── EL ORDEN Y `startWeek` ───────────────────────────────────────────────────
 * Una fase sin `startWeek` arranca donde termina la de ARRIBA en la lista (`computePhaseRanges`), no la
 * que termina más tarde. Por eso el resultado sale ordenado por inicio, y `startWeek` queda explícito
 * SOLO donde la contigua no daría el inicio calculado: así una cadena en fila sigue empujándose sola
 * cuando el CSE alarga una fase en el Gantt.
 */
import { PRIMERA_FASE_ES_ARRANQUE } from "./arranque";
import { timelineSpan } from "./weeks";

export const TIPOS_DE_FASE = [
  "arranque",
  "diagnostico",
  "planificacion",
  "configuracion",
  "migracion",
  "desarrollo",
  "capacitacion",
  "pruebas",
  "cierre",
] as const;
export type TipoDeFase = (typeof TIPOS_DE_FASE)[number];

const RANGO: Record<TipoDeFase, number> = {
  arranque: 0,
  diagnostico: 1,
  planificacion: 2,
  configuracion: 3,
  migracion: 3,
  desarrollo: 3,
  capacitacion: 4,
  pruebas: 5,
  cierre: 6,
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El tipo que declaró la IA, tolerante a mayúsculas y tildes. null si no es uno de la lista. */
export function leerTipoDeFase(x: unknown): TipoDeFase | null {
  if (typeof x !== "string") return null;
  const t = sinTildes(x.trim());
  return (TIPOS_DE_FASE as readonly string[]).includes(t) ? (t as TipoDeFase) : null;
}

/**
 * El tipo por el NOMBRE, para cuando la IA no lo declaró (un handoff de antes). El orden de las reglas
 * importa: «Capacitación y cierre» y «QA y Go-Live» son cierre (van al final); «Configuración y
 * migración» es configuración; «Auditoría y cierre de gaps» NO es cierre.
 */
export function tipoPorNombre(nombre: string): TipoDeFase | null {
  const n = sinTildes(nombre);
  if (PRIMERA_FASE_ES_ARRANQUE.test(n)) return "arranque";
  if (/\bgo.?live\b|\bsalida a produccion\b|\bpase a produccion\b|\blanzamiento\b|\bcierre\b(?! de )|\bentrega\b(?! de )/.test(n)) return "cierre";
  if (/\bcapacitacion|\bentrenamiento|\badopcion\b|\bformacion\b/.test(n)) return "capacitacion";
  if (/\bpruebas?\b|\bqa\b|\buat\b|\btesting\b|\bajustes\b|\bvalidacion\b/.test(n)) return "pruebas";
  if (/\bdesarrollo\b|\bintegracion|\bsdk\b|\bapi\b|\bconector/.test(n)) return "desarrollo";
  if (/\bconfiguracion\b|\bsetup\b|\bimplementacion\b|\bjourneys?\b|\bautomatizacion|\bworkflows?\b|\bpipelines?\b|\bestructuracion\b|\bconstruccion\b/.test(n)) {
    return "configuracion";
  }
  if (/\bmigracion\b|\bimportacion\b|\bdata mapping\b|\blimpieza\b/.test(n)) return "migracion";
  if (/\bdiagnostico\b|\bauditoria\b|\blevantamiento\b|\bdescubrimiento\b|\bdiscovery\b|\bexploracion\b|\brelevamiento\b|\banalisis\b/.test(n)) {
    return "diagnostico";
  }
  if (/\barquitectura\b|\bplanificacion\b|\bdiseno\b|\bblueprint\b|\bestrategia\b/.test(n)) return "planificacion";
  return null;
}

const HUBS = ["sales", "marketing", "service", "content", "data", "commerce", "operations", "cms", "crm"] as const;
/** Los Hubs que nombra una fase («Setup Sales + Service» nombra dos). */
function hubsDe(nombre: string): string[] {
  const n = sinTildes(nombre);
  return HUBS.filter((h) => new RegExp(`\\b${h}\\b`).test(n));
}

export interface FaseParaAcomodar {
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  /** El que declaró la IA; null = se deduce del nombre. */
  tipo?: TipoDeFase | null;
}

export interface Acomodo<T> {
  fases: T[];
  /** false = el plan quedó como vino (con el motivo). */
  aplicado: boolean;
  motivo?: string;
}

/** ⭐ Acomoda los inicios con la regla de arriba. Devuelve las fases (mismos objetos, copiados) reordenadas. */
export function acomodarEnParalelo<T extends FaseParaAcomodar>(fases: readonly T[]): Acomodo<T> {
  const n = fases.length;
  if (n < 2) return { fases: [...fases], aplicado: false, motivo: "menos de dos fases" };
  const tipos = fases.map((f) => f.tipo ?? tipoPorNombre(f.name));
  const sinTipo = fases.filter((_, i) => tipos[i] === null).map((f) => f.name);
  if (sinTipo.length > 0) {
    return { fases: [...fases], aplicado: false, motivo: `sin tipo reconocible: ${sinTipo.join(", ")}` };
  }
  const tipo = tipos as TipoDeFase[];
  const dur = (i: number) => Math.max(1, Math.floor(fases[i].durationWeeks || 1));
  const de = (t: TipoDeFase) => tipo.flatMap((x, i) => (x === t ? [i] : []));
  const inicio = new Array<number>(n).fill(0);
  const fin = new Array<number>(n).fill(0);
  const enFila = (ids: number[], desde: number) => {
    let c = desde;
    for (const i of ids) {
      inicio[i] = c;
      fin[i] = c + dur(i);
      c = fin[i];
    }
    return c;
  };

  const finArranque = enFila(de("arranque"), 0);
  const finDiagnostico = enFila(de("diagnostico"), finArranque);
  const base = enFila(de("planificacion"), finDiagnostico);
  const configuracion = de("configuracion");
  const finConfiguracion = enFila(configuracion, base);
  const finMigracion = enFila(de("migracion"), base);

  // Desarrollo: el inicio que dio la IA (es el de su equipo); si no dio, junto con la configuración.
  let cursorDev = base;
  for (const i of de("desarrollo")) {
    const s = fases[i].startWeek;
    const desde = typeof s === "number" && Number.isInteger(s) && s >= finArranque ? s : cursorDev;
    inicio[i] = desde;
    fin[i] = desde + dur(i);
    cursorDev = fin[i];
  }

  // Capacitación: en la segunda mitad de la configuración de su Hub, o de todo el bloque.
  const finFrente = Math.max(finConfiguracion, finMigracion);
  let cursorCap: number | null = null;
  for (const i of de("capacitacion")) {
    const suyos = hubsDe(fases[i].name);
    const par =
      suyos.length > 0 ? configuracion.find((j) => hubsDe(fases[j].name).some((h) => suyos.includes(h))) : undefined;
    const [a, b] = par !== undefined ? [inicio[par], fin[par]] : configuracion.length > 0 ? [base, finConfiguracion] : [finFrente, finFrente];
    const mitad = a + Math.ceil((b - a) / 2);
    const desde = par !== undefined ? mitad : (cursorCap ?? mitad);
    inicio[i] = desde;
    fin[i] = desde + dur(i);
    if (par === undefined) cursorCap = fin[i];
  }

  enFila(de("pruebas"), finFrente);
  const antesDelCierre = Math.max(0, ...tipo.flatMap((t, i) => (t === "cierre" ? [] : [fin[i]])));
  enFila(de("cierre"), antesDelCierre);

  // Orden: por inicio; con el mismo inicio, por el lugar del tipo en la secuencia, y después como vino.
  const orden = fases
    .map((_, i) => i)
    .sort((x, y) => inicio[x] - inicio[y] || RANGO[tipo[x]] - RANGO[tipo[y]] || x - y);
  let cursor = 0;
  const out = orden.map((i) => {
    const startWeek = inicio[i] === cursor ? null : inicio[i];
    cursor = fin[i];
    return { ...fases[i], startWeek };
  });
  const antes = timelineSpan([...fases]);
  const despues = timelineSpan(out);
  if (despues > antes) {
    return { fases: [...fases], aplicado: false, motivo: `acomodar alargaba el plan (${antes} → ${despues} semanas)` };
  }
  return { fases: out, aplicado: true };
}
