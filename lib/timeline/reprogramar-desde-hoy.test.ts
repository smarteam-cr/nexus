/**
 * lib/timeline/reprogramar-desde-hoy.test.ts — M4 P4a (spec del replanteo §5.2 y §5.11, 2026-09-27): lo atrasado se
 * reprograma desde hoy, calculado por el código. Puro: sin base, sin modelo.
 *
 * Correr: `npx vitest run lib/timeline/reprogramar-desde-hoy.test.ts --project unit`.
 *
 * Sobre la propuesta grande anonimizada (__fixtures__/propuesta-grande.json, LEÍDA, nunca importada): con su `hoy`, la
 * semana de hoy es la S18 y los números son los de Wherex (§5.1). Las fases: A = f02 (Sales Hub), C = f04
 * (Integraciones), D = f05 (Service Hub), E = f06 (Marketing Hub), F = f07 (Reportería y Data), G = f08 (Cierre y
 * entrega), H = f09, I = f10 (Capacitación y cierre Service), J = f11 (Cierre con junta directiva), K = f12.
 * Decisión de Elías (2026-09-27): en el orden del plan va por defecto; «todo desde hoy» queda hecho y apagado.
 * Cada `it` nombra la edición del código de producción que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { leerFixtureGrande, vivoDelFixture, type FixtureGrande } from "./__fixtures__/propuesta-grande";
import {
  acotarSemana,
  borradorVacio,
  claveDeCampo,
  leerBorrador,
  planDeAplicacion,
  proyectar,
  type Borrador,
  type CambioFaseCambia,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { POLITICA_DE_ATRASOS, type PoliticaDeAtrasos, type PoliticaDeFasesVencidas } from "./politica-de-atrasos";
import {
  conLaReprogramacion,
  esObservacionDeLaReprogramacion,
  OBSERVACIONES_DE_LA_REPROGRAMACION,
  reprogramarDesdeHoy,
  sinReprogramacion,
  type ReprogramacionDesdeHoy,
} from "./reprogramar-desde-hoy";
import { computePhaseRanges, timelineSpan } from "./weeks";

const fx: FixtureGrande = leerFixtureGrande();
const VIVO: Vivo = vivoDelFixture(fx);
const HOY = new Date(fx.hoy);
const politica = (fasesVencidas: PoliticaDeFasesVencidas): PoliticaDeAtrasos => ({ ...POLITICA_DE_ATRASOS, fasesVencidas });

/** El borrador del paso 1 del fixture, como está cuando se marca el paso 2: solo los cambios de fases (los de la IA). */
function guardadoDelPaso1(): Record<string, unknown> {
  const crudo = JSON.parse(JSON.stringify(fx.borrador)) as { cambios: Array<{ tipo: string }> } & Record<string, unknown>;
  return {
    ...crudo,
    cambios: crudo.cambios.filter((c) => !c.tipo.startsWith("tarea")),
    tareas: { corrida: "run-2", listas: false },
    tareasArmadasPara: {},
  };
}
const leer = (g: unknown): Borrador => {
  const b = leerBorrador(JSON.parse(JSON.stringify(g)));
  if (!b) throw new Error("no se deja leer");
  return b;
};
const SIN_LA_IA = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))) as Record<string, unknown>;

const reprogramar = (guardado: Record<string, unknown>, fases: PoliticaDeFasesVencidas, vivo: Vivo = VIVO, hoy = HOY, conSemanaCero = true) =>
  reprogramarDesdeHoy({ vivo, borrador: leer(guardado), hoy, politica: politica(fases), conSemanaCero })!;

const casillas = (r: ReprogramacionDesdeHoy) => r.cambios.filter((c) => !c.fijaInicio);
const pins = (r: ReprogramacionDesdeHoy) => r.cambios.filter((c) => c.fijaInicio);
const comoTexto = (c: CambioFaseCambia) => `${c.faseId}:${c.campo}:${String(c.desde)}→${String(c.a)}`;

/** El plan con todo lo marcado (o sin `sin`), en semanas: el fin de la última fase. */
function finDelPlan(vivo: Vivo, guardado: Record<string, unknown>, sin: Iterable<string> = []): number {
  return timelineSpan(proyectar(vivo, leer(guardado), sin).fases);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Wherex (el fixture grande) ───────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("M4 P4a · Wherex en el orden del plan (el default)", () => {
  it("⭐ 8 casillas y 1 pin; 25 arrastradas; lo empezado se estira y lo que no empezó espera a lo que le falta a lo que iba antes", () => {
    /* La edición que la pone en rojo: no esperar a las antecesoras (`espera` = −∞): D y E arrancaban en la S18, G en la
       S18 y J no se corría (el plan terminaba en la S23, no en la S33). */
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan");
    expect(r.semana).toBe(18);
    expect(casillas(r).map(comoTexto), "las casillas del sistema").toEqual([
      "f02:durationWeeks:4→20",
      "f04:durationWeeks:2→18",
      "f05:startWeek:5→20",
      "f06:startWeek:5→20",
      "f07:durationWeeks:3→11",
      "f08:startWeek:11→24",
      "f10:durationWeeks:1→3",
      "f11:startWeek:null→29",
    ]);
    expect(pins(r).map(comoTexto), "el pin de «Capacitación y cierre Service»").toEqual(["f10:startWeek:null→16"]);
    expect(r.cambios.every((c) => c.desdeHoy === true && !c.motivo), "un cambio del sistema sin su marca o con motivo").toBe(true);

    expect(r.tareas).toHaveLength(25);
    const porFase = (id: string) => r.tareas.filter((t) => t.faseId === id);
    expect([porFase("f02").length, porFase("f04").length, porFase("f07").length, porFase("f10").length]).toEqual([8, 9, 3, 5]);
    // Cada arrastrada va con la duración de su fase y se corre lo mismo que la primera abierta: A y C 16, F 8, I 2.
    const corrimiento = (id: string) => [...new Set(porFase(id).map((t) => t.a.weekIndex! - t.desde.weekIndex))];
    expect([corrimiento("f02"), corrimiento("f04"), corrimiento("f07"), corrimiento("f10")]).toEqual([[16], [16], [8], [2]]);
    for (const t of r.tareas) {
      expect(t.desdeHoy).toBe(true);
      expect(t.conCambio).toBe(claveDeCampo(t.faseId, "durationWeeks"));
    }

    expect(r.sinHacer).toEqual([{ faseId: "f01", motivo: "semana-0" }]);
    expect(r.sinNadaMarcado, "las sin empezar que vuelven a arrancar sin ninguna tarea marcada").toEqual(["f05", "f06", "f08"]);
    expect(r.nacenDesmarcadas).toEqual([]);
    expect(r.reemplazadas).toEqual([]);
    expect(r.reloj).toEqual({ instante: HOY.toISOString(), semana: 18, politica: politica("en-el-orden-del-plan") });
  });

  it("⭐ el plan: 21 → 33 semanas sin la IA y 25 → 37 con la IA de ayer (Fase K de 3 a 5 y una fase nueva de 2)", () => {
    /* La edición que la pone en rojo: hacer esperar también a lo EMPEZADO (Fase I quedaba con lo que falta en la S30 y el
       plan en 35), o no esperar a las antecesoras (23). */
    const sinIa = SIN_LA_IA();
    expect(finDelPlan(VIVO, sinIa)).toBe(21);
    expect(finDelPlan(VIVO, conLaReprogramacion(sinIa, reprogramar(sinIa, "en-el-orden-del-plan")))).toBe(33);
    const conIa = guardadoDelPaso1();
    expect(finDelPlan(VIVO, conIa)).toBe(25);
    const r = reprogramar(conIa, "en-el-orden-del-plan");
    expect(finDelPlan(VIVO, conLaReprogramacion(conIa, r))).toBe(37);
    // Lo de la IA se queda: no cae en una fase atrasada (Fase K no está atrasada; la fase nueva no se toca).
    expect(r.reemplazadas).toEqual([]);
    expect(casillas(r)).toHaveLength(8);
  });
});

describe("M4 P4a · las otras dos opciones del interruptor", () => {
  it("⭐ todo desde hoy (implementada, apagada): 7 casillas y 1 pin; D, E y G en la S18; 21 → 23; el cierre nace desmarcado", () => {
    /* La edición que la pone en rojo: ignorar la política (reprogramar siempre en el orden del plan). */
    const sinIa = SIN_LA_IA();
    const r = reprogramar(sinIa, "todo-desde-hoy");
    expect(casillas(r).map(comoTexto)).toEqual([
      "f02:durationWeeks:4→20",
      "f04:durationWeeks:2→18",
      "f05:startWeek:5→18",
      "f06:startWeek:5→18",
      "f07:durationWeeks:3→11",
      "f08:startWeek:11→18",
      "f10:durationWeeks:1→3",
    ]);
    expect(pins(r).map(comoTexto)).toEqual(["f10:startWeek:null→16"]);
    expect(r.tareas).toHaveLength(25);
    expect(finDelPlan(VIVO, conLaReprogramacion(sinIa, r))).toBe(23);
    // «Fase G» es «Cierre y entrega» en Wherex: con todo desde hoy quedaría antes del trabajo que la precedía.
    const conCierre: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "f08" ? { ...f, name: "Cierre y entrega" } : f)) };
    const r2 = reprogramar(sinIa, "todo-desde-hoy", conCierre);
    expect(r2.nacenDesmarcadas).toEqual([claveDeCampo("f08", "startWeek")]);
    expect(reprogramar(sinIa, "en-el-orden-del-plan", conCierre).nacenDesmarcadas, "en el orden del plan no hace falta").toEqual([]);
    const guardado = conLaReprogramacion(sinIa, r2);
    expect(guardado.excluidos).toEqual([claveDeCampo("f08", "startWeek")]);
  });

  it("⭐ avisar: sin cambios ni tareas, y lo sin hacer nombra todas las atrasadas; sin fecha de arranque, null", () => {
    /* La edición que la pone en rojo: reprogramar con «avisar». */
    const r = reprogramar(SIN_LA_IA(), "avisar");
    expect(r.cambios).toEqual([]);
    expect(r.tareas).toEqual([]);
    expect(r.sinHacer).toEqual([
      { faseId: "f01", motivo: "semana-0" },
      ...["f02", "f04", "f05", "f06", "f07", "f08", "f09", "f10", "f11"].map((faseId) => ({ faseId, motivo: "atrasada" })),
    ]);
    expect(
      reprogramarDesdeHoy({ vivo: { ...VIVO, ancla: null }, borrador: leer(SIN_LA_IA()), hoy: HOY, politica: POLITICA_DE_ATRASOS, conSemanaCero: true }),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Las invariantes: el fixture y 50 cronogramas al azar ─────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Un generador con semilla (mulberry32): los mismos 50 cronogramas en cada corrida. */
function azar(semilla: number) {
  let s = semilla >>> 0;
  const n = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entero = (min: number, max: number) => min + Math.floor(n() * (max - min + 1));
  const uno = <T>(xs: readonly T[]): T => xs[entero(0, xs.length - 1)];
  return { n, entero, uno };
}

const ANCLA_AZAR = "2026-05-04T00:00:00.000Z";
/**
 * Un cronograma al azar: fases cortas, en paralelo o contiguas, empezadas o no, con abiertas cuya semana pasa la duración
 * (p ≥ duración) y algunas con fecha fijada. Las hechas y suspendidas caen dentro de su fase: el validador
 * (lib/timeline/validate.ts) no deja guardar otra cosa. A veces, la IA alarga la última fase.
 */
function cronogramaAlAzar(semilla: number): { vivo: Vivo; guardado: Record<string, unknown>; hoy: Date; conSemanaCero: boolean } {
  const r = azar(semilla);
  const nFases = r.entero(2, 6);
  const fases: FaseViva[] = [];
  let k = 0;
  for (let i = 0; i < nFases; i++) {
    const dur = r.entero(1, 4);
    const status = r.uno(["PENDING", "PENDING", "IN_PROGRESS", "DONE", "SUSPENDED", "PENDING"]);
    const empezada = status !== "PENDING" || r.n() < 0.3;
    const tareas: TareaDelVivo[] = [];
    for (let j = r.entero(0, 5); j > 0; j--) {
      const estado =
        status === "DONE" ? "DONE" : empezada ? r.uno(["DONE", "PENDING", "IN_PROGRESS", "SUSPENDED", "PENDING"]) : "PENDING";
      const abierta = estado === "PENDING" || estado === "IN_PROGRESS";
      const fijada = abierta && r.n() < 0.15;
      tareas.push({
        id: `t${semilla}-${k++}`,
        title: `Tarea ${k}`,
        weekIndex: abierta ? r.entero(0, dur + 2) : r.entero(0, dur - 1),
        notes: null,
        party: "SMARTEAM",
        type: "TASK",
        status: estado,
        source: "AGENT",
        inicioFijado: fijada ? "2026-06-01" : null,
        finFijado: null,
      });
    }
    fases.push({
      id: `f${i}`,
      name: i === nFases - 1 && r.n() < 0.4 ? "Cierre del proyecto" : `Fase ${i}`,
      durationWeeks: dur,
      startWeek: i > 0 && r.n() < 0.4 ? r.entero(0, 8) : null,
      sessionCount: null,
      notes: null,
      activityType: null,
      status,
      tareas,
    });
  }
  const vivo: Vivo = { ancla: ANCLA_AZAR, fases };
  const guardado = SIN_LA_IA();
  const ultima = fases[fases.length - 1];
  if (r.n() < 0.5) {
    guardado.cambios = [
      {
        tipo: "fase-cambia",
        clave: claveDeCampo(ultima.id, "durationWeeks"),
        faseId: ultima.id,
        fase: ultima.name,
        campo: "durationWeeks",
        desde: ultima.durationWeeks,
        a: ultima.durationWeeks + r.entero(1, 2),
        motivo: "Las instrucciones del CSE la alargan.",
      },
    ];
  }
  const hoy = new Date(Date.parse(ANCLA_AZAR) + (r.entero(0, 14) * 7 + r.entero(0, 6)) * 86_400_000 + 43_200_000);
  return { vivo, guardado, hoy, conSemanaCero: r.n() < 0.7 };
}

/** La semana absoluta de cada tarea viva como la pinta la proyección, y el inicio de cada fase. */
function semanas(vivo: Vivo, guardado: Record<string, unknown>, sin: Iterable<string>) {
  const p = proyectar(vivo, leer(guardado), sin);
  const rangos = computePhaseRanges(p.fases);
  const tarea = new Map<string, number>();
  const inicio = new Map<string, number>();
  const duracion = new Map<string, number>();
  p.fases.forEach((f, i) => {
    inicio.set(f.clave, rangos[i].start);
    duracion.set(f.clave, f.durationWeeks);
    for (const t of f.tareas) if (t.id) tarea.set(t.id, rangos[i].start + t.weekIndex);
  });
  return { tarea, inicio, duracion };
}

/**
 * Las invariantes de §5.11 sobre un cronograma. (1), (2) y (3) para TODA combinación de casillas de fase (las del sistema
 * y las de la IA; las de tareas, marcadas). El pin no tiene casilla: aplica si algo aplica.
 * 2026-09-27, M4 P4d: hasta P4d el pin se emulaba acá (se desmarcaba solo con todo desmarcado); desde P4d lo decide el
 * plan (`planDeAplicacion`, paso 9), así que las combinaciones van tal cual y lo que se prueba es el plan de verdad. Además,
 * el pin viaja SIEMPRE en `sin` (una pantalla que intentara desmarcarlo): sin casilla, no lo toca.
 */
function comprobarInvariantes(nombre: string, vivo: Vivo, guardado: Record<string, unknown>, hoy: Date, fases: PoliticaDeFasesVencidas, conSemanaCero: boolean) {
  const b = leer(guardado);
  const r = reprogramarDesdeHoy({ vivo, borrador: b, hoy, politica: politica(fases), conSemanaCero });
  if (!r) throw new Error(`${nombre}: sin semana de hoy`);
  // (6) determinista.
  expect(reprogramarDesdeHoy({ vivo, borrador: leer(guardado), hoy, politica: politica(fases), conSemanaCero }), `${nombre}: no es determinista`).toEqual(r);
  const con = conLaReprogramacion(guardado, r);
  const H = r.semana;

  const antes = semanas(vivo, guardado, []);
  const empezadas = vivo.fases.filter((f) => f.status !== "PENDING" || (f.tareas ?? []).some((t) => t.status !== "PENDING"));
  const conAvance = vivo.fases.flatMap((f) => (f.tareas ?? []).filter((t) => t.status === "DONE" || t.status === "SUSPENDED"));
  const cero = conSemanaCero ? vivo.fases[0]?.id : undefined;

  const deFase = leer(con).cambios.filter((c) => c.tipo === "fase-cambia" || c.tipo === "fase-nueva");
  const conCasilla = deFase.filter((c) => !(c.tipo === "fase-cambia" && c.fijaInicio)).map((c) => c.clave);
  const delPin = deFase.filter((c) => c.tipo === "fase-cambia" && c.fijaInicio).map((c) => c.clave);
  expect(conCasilla.length, `${nombre}: demasiadas casillas para recorrerlas todas`).toBeLessThanOrEqual(12);
  for (let m = 0; m < 1 << conCasilla.length; m++) {
    const sin = conCasilla.filter((_, j) => !(m & (1 << j)));
    const d = semanas(vivo, con, [...sin, ...delPin]);
    const combinacion = `${nombre} · marcadas: ${conCasilla.filter((_, j) => m & (1 << j)).join(", ") || "ninguna"}`;
    // (1) ninguna fase empezada cambia de inicio.
    for (const f of empezadas) expect(d.inicio.get(f.id), `${combinacion} · movió el inicio de ${f.id}, que empezó`).toBe(antes.inicio.get(f.id));
    // (2) ninguna hecha o suspendida cambia de semana absoluta.
    for (const t of conAvance) expect(d.tarea.get(t.id), `${combinacion} · movió ${t.id} (${t.status})`).toBe(antes.tarea.get(t.id));
    // (3) la Semana 0 no cambia.
    if (cero) {
      expect(d.inicio.get(cero), `${combinacion} · movió la Semana 0`).toBe(antes.inicio.get(cero));
      expect(d.duracion.get(cero), `${combinacion} · cambió la Semana 0`).toBe(antes.duracion.get(cero));
    }
  }

  // Con todo marcado:
  const todo = semanas(vivo, con, []);
  // (4) ninguna abierta movible de una fase reprogramada queda vencida.
  for (const t of r.tareas) expect(todo.tarea.get(t.tareaId)!, `${nombre} · ${t.tareaId} quedó vencida`).toBeGreaterThanOrEqual(H);
  for (const c of r.cambios.filter((x) => x.campo === "startWeek" && !x.fijaInicio)) {
    expect(todo.inicio.get(c.faseId)!, `${nombre} · ${c.faseId} arranca en el pasado`).toBeGreaterThanOrEqual(H);
  }
  // (5) en el orden del plan, lo que no empezó y se reprograma no arranca antes de que termine lo que le falta a su antecesora.
  if (fases === "en-el-orden-del-plan") {
    const e = proyectar(vivo, b).fases;
    const r0 = computePhaseRanges(e);
    const k = new Map(e.map((f, i) => [f.clave, i]));
    const fin = (id: string) => todo.inicio.get(id)! + todo.duracion.get(id)!;
    for (const c of r.cambios.filter((x) => x.campo === "startWeek" && !x.fijaInicio)) {
      const i = k.get(c.faseId)!;
      for (let j = 0; j < i; j++) {
        if (e[j].clave === cero || r0[j].end > r0[i].start) continue;
        expect(todo.inicio.get(c.faseId)!, `${nombre} · ${c.faseId} arranca antes de que termine ${e[j].clave}`).toBeGreaterThanOrEqual(fin(e[j].clave));
      }
    }
  }
  return r;
}

/* 2026-09-27, P4h: el tope de tiempo del bloque sube a 30 s, como el de eslint-guards.test.ts. Recorre TODA combinación de
   casillas sobre el fixture (2^9 proyecciones por caso): tarda ~3 s solo y pasaba de los 5 s por defecto con la suite
   entera en la máquina cargada (se cortaba por tiempo, no por una invariante). Las aserciones no cambian. */
describe("M4 P4a · las invariantes", { timeout: 30_000 }, () => {
  it("⭐ sobre el fixture, con y sin la IA, en las dos opciones que reprograman", () => {
    /* Las ediciones que la ponen en rojo: mover el inicio de una empezada (sin el pin, o `startWeek → desde` también en
       una empezada), darle casilla al pin (sin `fijaInicio`: desmarcarlo corre «Fase I», que ya empezó), o usar
       `dur − p` sin el `max` ni el tope de `p` (las abiertas de más allá de la duración quedan vencidas). */
    for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy"] as const) {
      comprobarInvariantes(`fixture sin la IA · ${fases}`, VIVO, SIN_LA_IA(), HOY, fases, true);
      comprobarInvariantes(`fixture con la IA · ${fases}`, VIVO, guardadoDelPaso1(), HOY, fases, true);
    }
  });

  it("⭐ sobre 50 cronogramas al azar (semilla fija), con duraciones cortas, p ≥ duración y semanas más allá de la duración", () => {
    let conReprogramacion = 0;
    let conPin = 0;
    for (let semilla = 1; semilla <= 50; semilla++) {
      const c = cronogramaAlAzar(semilla);
      for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy"] as const) {
        const r = comprobarInvariantes(`al azar ${semilla} · ${fases}`, c.vivo, c.guardado, c.hoy, fases, c.conSemanaCero);
        if (r.cambios.length > 0) conReprogramacion++;
        if (pins(r).length > 0) conPin++;
      }
    }
    // Que el generador de verdad ejercite lo que cuida (si no, las invariantes pasarían en vacío).
    expect(conReprogramacion, "casi ningún cronograma al azar se reprograma").toBeGreaterThanOrEqual(30);
    expect(conPin, "ningún cronograma al azar lleva pin").toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Los casos ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const tarea = (id: string, weekIndex: number, status = "PENDING", extra: Partial<TareaDelVivo> = {}): TareaDelVivo => ({
  id,
  title: `Tarea ${id}`,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status,
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  ...extra,
});
const fase = (id: string, name: string, durationWeeks: number, startWeek: number | null, status: string, tareas: TareaDelVivo[]): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek,
  sessionCount: null,
  notes: null,
  activityType: null,
  status,
  tareas,
});
/** Wherex: el arranque y el `hoy` del fixture (S18). */
const conVivo = (fases: FaseViva[]): Vivo => ({ ancla: fx.ancla, fases });

describe("M4 P4a · los casos", () => {
  it("⭐ la Semana 0: en un Desarrollo (sin Semana 0) la primera fase atrasada se reprograma; con Semana 0, no", () => {
    /* La edición que la pone en rojo: elegir la Semana 0 con `elegirFaseDeSemanaCero` (sin mirar el pipeline): en
       Desarrollo y Web la primera fase es trabajo real. */
    const vivo = conVivo([
      fase("r", "Relevamiento técnico", 2, null, "PENDING", [tarea("r1", 0), tarea("r2", 1)]),
      fase("d", "Desarrollo", 20, null, "PENDING", [tarea("d1", 3)]),
    ]);
    const desarrollo = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo, HOY, false);
    expect(casillas(desarrollo).map(comoTexto)).toEqual(["r:startWeek:null→18"]);
    const conSemanaCero = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo, HOY, true);
    expect(conSemanaCero.cambios).toEqual([]);
    // Y «Desarrollo» está en curso (S2–S21) con su semana 3 ya pasada: se nombra, no se mueve.
    expect(conSemanaCero.sinHacer).toEqual([
      { faseId: "r", motivo: "semana-0" },
      { faseId: "d", motivo: "en-curso" },
    ]);
  });

  it("⭐ casi terminada: empezada, 1 abierta de 12 y la ventana cerrada → no se estira, se nombra", () => {
    /* La edición que la pone en rojo: estirarla (quitar el umbral de «casi terminada»): Almotec «Capacitación Service»
       pasaba de 6 a 13 semanas por 1 pendiente de 12. */
    const hechas = Array.from({ length: 11 }, (_, i) => tarea(`c${i}`, i % 6, "DONE"));
    const vivo = conVivo([
      fase("s0", "Semana 0", 2, null, "DONE", [tarea("k", 0, "DONE")]),
      fase("c", "Capacitación Service", 6, 2, "IN_PROGRESS", [...hechas, tarea("c11", 5)]),
      fase("x", "Soporte", 20, 2, "IN_PROGRESS", [tarea("x1", 17, "DONE"), tarea("x2", 19)]),
    ]);
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo);
    expect(r.cambios).toEqual([]);
    expect(r.tareas).toEqual([]);
    expect(r.sinHacer).toEqual([{ faseId: "c", motivo: "casi-terminada" }]);
    // Con 3 abiertas ya no está «casi terminada»: se estira.
    const conTres = conVivo([vivo.fases[0], { ...vivo.fases[1], tareas: [...hechas.slice(0, 9), tarea("a", 3), tarea("b", 4), tarea("c", 5)] }]);
    expect(casillas(reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", conTres)).map(comoTexto)).toEqual(["c:durationWeeks:6→19"]);
  });

  it("⭐ un proyecto al día: sin fases vencidas, sin cambios ni pins (y sin observaciones)", () => {
    /* La edición que la pone en rojo: reprogramar un proyecto al día (dar por atrasada una fase cuya ventana todavía
       incluye hoy, `inicio + dur < H` en vez de `≤`, o dejar el pin sin ninguna casilla). */
    const alDia = new Date("2026-06-03T12:00:00-06:00"); // S2 del fixture: ninguna fase cerró sin terminarse
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", VIVO, alDia);
    expect(r.semana).toBe(2);
    expect(r.cambios).toEqual([]);
    expect(r.tareas).toEqual([]);
    expect(r.observaciones).toEqual([]);
    // En el borde: en su última semana (S5) una fase de S2 a S5 (dur 4) no está atrasada; la semana siguiente, sí.
    const vivo = conVivo([fase("s0", "Semana 0", 1, null, "DONE", []), fase("a", "Fase A", 4, 2, "IN_PROGRESS", [tarea("a0", 0, "DONE"), tarea("a1", 3)])]);
    const enLaS5 = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo, new Date("2026-06-25T12:00:00-06:00"));
    expect([enLaS5.semana, enLaS5.cambios.length]).toEqual([5, 0]);
    const enLaS6 = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo, new Date("2026-07-01T12:00:00-06:00"));
    expect(enLaS6.semana).toBe(6);
    expect(casillas(enLaS6).map(comoTexto)).toEqual(["a:durationWeeks:4→5"]);
    // Al día y con un cambio de la IA que correría una contigua empezada: sin nada que reprogramar, tampoco hay pin (lo de
    // la IA lo cuida el armador del paso 1, que no deja correr lo empezado).
    const conContigua = conVivo([
      fase("s0", "Semana 0", 2, null, "DONE", [tarea("k", 0, "DONE")]),
      fase("a", "Fase A", 4, null, "PENDING", [tarea("a1", 1)]),
      fase("b", "Fase B", 4, null, "IN_PROGRESS", [tarea("b0", 0, "DONE"), tarea("b1", 2)]),
    ]);
    const deLaIA = SIN_LA_IA();
    deLaIA.cambios = [{ tipo: "fase-cambia", clave: "fase:a:durationWeeks", faseId: "a", fase: "Fase A", campo: "durationWeeks", desde: 4, a: 5 }];
    const r2 = reprogramar(deLaIA, "en-el-orden-del-plan", conContigua, new Date("2026-06-10T12:00:00-06:00"));
    expect([r2.semana, r2.cambios.length], "un pin sin ninguna casilla").toEqual([3, 0]);
  });

  it("⭐ la IA: su duración en una empezada atrasada se reemplaza, viaja en `deLaIA` y se dice; en una sin empezar se queda", () => {
    /* La edición que la pone en rojo: perder lo de la IA (no guardar `deLaIA`, o no listarla en `reemplazadas`: el
       borrador quedaba con dos cambios con la misma clave). */
    const guardado = SIN_LA_IA();
    guardado.cambios = [
      { tipo: "fase-cambia", clave: "fase:f02:durationWeeks", faseId: "f02", fase: "Fase A", campo: "durationWeeks", desde: 4, a: 6, motivo: "Tus instrucciones la alargan." },
      { tipo: "fase-cambia", clave: "fase:f05:durationWeeks", faseId: "f05", fase: "Fase D", campo: "durationWeeks", desde: 4, a: 3, motivo: "Casi terminada." },
    ];
    const r = reprogramar(guardado, "en-el-orden-del-plan");
    expect(r.reemplazadas).toEqual(["fase:f02:durationWeeks"]);
    const a = r.cambios.find((c) => c.clave === "fase:f02:durationWeeks")!;
    // Lo que falta, con la duración de la IA (6), arranca hoy: (18 − 2) + 6.
    expect([a.desde, a.a, a.deLaIA]).toEqual([4, 22, { a: 6, motivo: "Tus instrucciones la alargan." }]);
    expect(r.observaciones).toContain(OBSERVACIONES_DE_LA_REPROGRAMACION.duracionDeLaIA("Fase A"));
    expect(r.cambios.some((c) => c.clave === "fase:f05:durationWeeks"), "la de la IA en una sin empezar").toBe(false);
    const d = r.cambios.find((c) => c.clave === "fase:f05:startWeek")!;
    expect(d.deLaIA).toBeUndefined();
    const con = leer(conLaReprogramacion(guardado, r));
    expect(con.cambios.filter((c) => c.clave === "fase:f02:durationWeeks")).toHaveLength(1);
    expect(con.cambios.find((c) => c.clave === "fase:f05:durationWeeks"), "se perdió la de la IA en la sin empezar").toBeDefined();
  });

  it("⭐ lo que no se corre: una abierta con fecha fijada o que tocó el chat; sin otra movible, la fase no se estira y se dice", () => {
    /* La edición que la pone en rojo: correr lo que tiene fecha fijada o lo que el chat ya cambió (D6). */
    const vivo = conVivo([
      fase("s0", "Semana 0", 2, null, "DONE", [tarea("k", 0, "DONE")]),
      fase("a", "Fase A", 3, 2, "IN_PROGRESS", [tarea("a0", 0, "DONE"), tarea("a1", 1, "PENDING", { finFijado: "2026-06-10" })]),
      fase("b", "Fase B", 3, 2, "IN_PROGRESS", [tarea("b0", 0, "DONE"), tarea("b1", 1), tarea("b2", 2)]),
      fase("c", "Fase C", 20, 2, "IN_PROGRESS", [tarea("c0", 0, "DONE")]),
    ]);
    const guardado = SIN_LA_IA();
    const b1 = vivo.fases[2].tareas![1];
    guardado.cambios = [
      { tipo: "tarea-cambia", clave: "tarea:b1:cambia", tareaId: "b1", faseId: "b", desde: { title: b1.title, weekIndex: 1, notes: null, party: "SMARTEAM", type: "TASK", inicioFijado: null, finFijado: null }, a: { title: "Otra" }, porChat: true },
    ];
    const r = reprogramar(guardado, "en-el-orden-del-plan", vivo);
    expect(casillas(r).map(comoTexto)).toEqual(["b:durationWeeks:3→17"]);
    expect(r.tareas.map((t) => t.tareaId), "corrió la fijada o la del chat").toEqual(["b2"]);
    expect(r.observaciones).toEqual([OBSERVACIONES_DE_LA_REPROGRAMACION.fechaFijada("Fase A")]);
  });
});

describe("M4 · los casos borde de §5.10", () => {
  /* 2026-09-27, P4h: lo que la tabla de casos borde de la spec pedía y no tenía un caso propio. «Fase A» empezó en la S2 y
     quedó atrasada (se estira desde hoy); «En paralelo» y «Paralela empezada» arrancaron antes de que «Fase A» termine
     (no son sus sucesoras) y su ventana incluye hoy; «Hecha» y «Suspendida» cerraron su ventana con algo abierto; «Después»
     arrancaba en la S20, cuando «Fase A» ya había terminado en el plan. */
  const vivo = conVivo([
    fase("s0", "Semana 0", 2, null, "DONE", [tarea("k", 0, "DONE")]),
    fase("a", "Fase A", 4, 2, "IN_PROGRESS", [tarea("a0", 0, "DONE"), tarea("a1", 1), tarea("a2", 3)]),
    fase("p", "En paralelo", 20, 4, "PENDING", [tarea("p1", 5)]),
    fase("q", "Paralela empezada", 20, 3, "IN_PROGRESS", [tarea("q0", 0, "DONE"), tarea("q1", 2)]),
    fase("h", "Hecha", 2, 2, "DONE", [tarea("h0", 0, "DONE"), tarea("h1", 1)]),
    fase("su", "Suspendida", 3, 2, "SUSPENDED", [tarea("su0", 0, "SUSPENDED"), tarea("su1", 1)]),
    fase("x", "Después", 2, 20, "PENDING", [tarea("x1", 0)]),
  ]);

  it("⭐ las fases en paralelo no atrasadas quedan quietas, salvo (en el orden del plan) la que iba después de la que se estira", () => {
    /* Las ediciones que la ponen en rojo: dar por antecesora a una fase en paralelo (una que arrancó antes de que la otra
       terminara: «En paralelo» esperaba a «Fase A» y se corría a la S21), o no correr la que iba después en el plan. */
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo);
    expect(casillas(r).map(comoTexto)).toEqual(["a:durationWeeks:4→19", "x:startWeek:20→21"]);
    expect(pins(r)).toEqual([]);
    // Con «todo desde hoy» no hay «va después»: «Después» no estaba atrasada y se queda.
    expect(casillas(reprogramar(SIN_LA_IA(), "todo-desde-hoy", vivo)).map(comoTexto)).toEqual(["a:durationWeeks:4→19"]);
  });

  it("⭐ una fase hecha o suspendida con la ventana cerrada y algo abierto queda quieta, y nada con avance cambia de semana", () => {
    /* Las ediciones que la ponen en rojo: estirar una fase hecha o suspendida (mirar solo sus tareas abiertas y no su
       estado), o correr su abierta. Las invariantes (1)–(6) de §5.11, sobre este cronograma. */
    for (const politicaDeFases of ["en-el-orden-del-plan", "todo-desde-hoy"] as const) {
      const r = comprobarInvariantes(`casos borde · ${politicaDeFases}`, vivo, SIN_LA_IA(), HOY, politicaDeFases, true);
      expect(r.cambios.filter((c) => ["h", "su", "p", "q"].includes(c.faseId)), politicaDeFases).toEqual([]);
      expect(r.tareas.map((t) => t.tareaId), politicaDeFases).toEqual(["a1", "a2"]);
    }
  });
});

describe("M4 P4a · sobre lo guardado: conLaReprogramacion y sinReprogramacion", () => {
  it("⭐ con la casilla de la IA desmarcada, la del sistema nace MARCADA y se dice; al quitarla, vuelve la de la IA desmarcada", () => {
    /* La edición que la pone en rojo: heredar la casilla desmarcada (no sacar lo reemplazado de `excluidos`): el CSE
       había desmarcado la duración de la IA y la reprogramación de lo atrasado quedaba desmarcada sin que nadie lo pidiera. */
    const g = SIN_LA_IA();
    g.cambios = [
      { tipo: "fase-cambia", clave: "fase:f02:durationWeeks", faseId: "f02", fase: "Fase A", campo: "durationWeeks", desde: 4, a: 6, motivo: "Tus instrucciones la alargan." },
    ];
    g.excluidos = ["fase:f02:durationWeeks"];
    const r = reprogramar(g, "en-el-orden-del-plan");
    const con = conLaReprogramacion(g, r);
    expect(con.excluidos, "nació desmarcada").toEqual([]);
    expect(con.observaciones).toContain(OBSERVACIONES_DE_LA_REPROGRAMACION.duracionDesmarcada("Fase A"));
    expect(con.hoy).toEqual(r.reloj);
    expect(con.version, "la versión la sube quien escribe").toBe(g.version);
    const leido = leer(con);
    expect(leido.cambios.find((c) => c.clave === "fase:f02:durationWeeks")).toMatchObject({ desdeHoy: true, a: 22, deLaIA: { a: 6, desmarcada: true } });
    // La vuelta: la de la IA, en su lugar y desmarcada otra vez.
    expect(sinReprogramacion(con)).toEqual(g);
  });

  it("⭐ la vuelta atrás es exacta: sin(con(g, r)) = g, con la IA restaurada, en las tres opciones", () => {
    /* La edición que la pone en rojo: no restaurar lo de la IA (`deLaIA`), dejar el reloj o las observaciones, o dejar en
       `excluidos` una casilla que ya no existe. */
    for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy", "avisar"] as const) {
      for (const g of [SIN_LA_IA(), guardadoDelPaso1()]) {
        const con = conLaReprogramacion(g, reprogramar(g, fases));
        expect(sinReprogramacion(con), fases).toEqual(g);
      }
    }
    // Y con un cambio de la IA reemplazado y una fase de cierre que nace desmarcada.
    const g = guardadoDelPaso1();
    g.cambios = [
      ...(g.cambios as unknown[]),
      { tipo: "fase-cambia", clave: "fase:f04:durationWeeks", faseId: "f04", fase: "Fase C", campo: "durationWeeks", desde: 2, a: 3 },
    ];
    const conCierre: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "f08" ? { ...f, name: "Cierre y entrega" } : f)) };
    const r = reprogramarDesdeHoy({ vivo: conCierre, borrador: leer(g), hoy: HOY, politica: politica("todo-desde-hoy"), conSemanaCero: true })!;
    expect(r.reemplazadas).toEqual(["fase:f04:durationWeeks"]);
    expect(r.nacenDesmarcadas).toEqual(["fase:f08:startWeek"]);
    expect(sinReprogramacion(conLaReprogramacion(g, r))).toEqual(g);
    // Sobre algo sin reprogramación, solo quita el reloj.
    expect(sinReprogramacion({ ...g, hoy: r.reloj })).toEqual(g);
  });

  it("⭐ leerBorrador conserva lo del sistema (desdeHoy, fijaInicio, deLaIA) y la huella no lo mira", () => {
    /* La edición que la pone en rojo: no leerlos en `leerCambio`: el chat y la fusión reescriben `cambios` desde lo leído,
       y lo del sistema pasaba a ser un cambio más de la IA (un reintento reprogramaba encima). */
    const g = guardadoDelPaso1();
    g.cambios = [
      ...(g.cambios as unknown[]),
      { tipo: "fase-cambia", clave: "fase:f02:durationWeeks", faseId: "f02", fase: "Fase A", campo: "durationWeeks", desde: 4, a: 6 },
    ];
    const con = conLaReprogramacion(g, reprogramar(g, "en-el-orden-del-plan"));
    const releido = JSON.parse(JSON.stringify({ ...con, cambios: leer(con).cambios }));
    expect(releido.cambios, "leerCambio perdió lo del sistema").toEqual(con.cambios);
    expect(sinReprogramacion(releido)).toEqual(g);
    // La huella del plan no mira las marcas: los mismos cambios sin ellas dan la misma (una pestaña vieja sigue aplicando).
    const sinMarcas = (con.cambios as Array<Record<string, unknown>>).map(({ desdeHoy: _d, fijaInicio: _f, deLaIA: _i, ...resto }) => {
      void _d;
      void _f;
      void _i;
      return resto;
    });
    expect(planDeAplicacion(VIVO, leer({ ...con, cambios: sinMarcas })).huella).toBe(planDeAplicacion(VIVO, leer(con)).huella);
    // Mal formado, `deLaIA` se ignora sin invalidar el cambio.
    const malo = { ...(con.cambios as Array<Record<string, unknown>>).find((c) => c.clave === "fase:f02:durationWeeks")!, deLaIA: { a: "seis" } };
    const leidoMalo = leer({ ...con, cambios: [malo] });
    expect(leidoMalo.desconocidos).toBeUndefined();
    expect(leidoMalo.cambios[0]).toMatchObject({ desdeHoy: true });
    expect(leidoMalo.cambios[0]).not.toHaveProperty("deLaIA");
  });

  it("las observaciones de la reprogramación se reconocen por su plantilla; las del paso 1, no", () => {
    for (const p of Object.values(OBSERVACIONES_DE_LA_REPROGRAMACION)) expect(esObservacionDeLaReprogramacion(p("Fase «rara» 2"))).toBe(true);
    for (const o of (fx.borrador as { observaciones: string[] }).observaciones) expect(esObservacionDeLaReprogramacion(o)).toBe(false);
  });
});

describe("M4 P4a · el tope de la semana de cada arrastrada", () => {
  it("una abierta más allá de la duración (p ≥ duración) queda desde hoy, dentro de la fase estirada", () => {
    const vivo = conVivo([
      fase("s0", "Semana 0", 2, null, "DONE", [tarea("k", 0, "DONE")]),
      fase("a", "Fase A", 2, 2, "IN_PROGRESS", [tarea("a0", 0, "DONE"), tarea("a1", 3), tarea("a2", 5)]),
    ]);
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo);
    // p = min(3, 2 − 1) = 1; resto = 1; duración (18 − 2) + 1 = 17; Δ = 18 − 3 = 15.
    expect(casillas(r).map(comoTexto)).toEqual(["a:durationWeeks:2→17"]);
    const abs = semanas(vivo, conLaReprogramacion(SIN_LA_IA(), r), []);
    expect([abs.tarea.get("a1"), abs.tarea.get("a2")]).toEqual([18, 18]);
    expect(acotarSemana(3 + 15, 17)).toBe(16);
  });
});
