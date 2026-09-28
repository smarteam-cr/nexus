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
  claveDeTareaQueCambia,
  leerBorrador,
  planDeAplicacion,
  proyectar,
  resumir,
  type Borrador,
  type CambioFaseCambia,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  POLITICA_DE_ATRASOS,
  type PoliticaDeAtrasos,
  type PoliticaDeFasesVencidas,
  type PoliticaDePendientesDelPasado,
} from "./politica-de-atrasos";
import {
  conLaReprogramacion,
  esObservacionDeLaReprogramacion,
  OBSERVACIONES_DE_LA_REPROGRAMACION,
  reprogramarDesdeHoy,
  sinReprogramacion,
  type ReprogramacionDesdeHoy,
} from "./reprogramar-desde-hoy";
import { computePhaseRanges, timelineSpan } from "./weeks";
import { esFaseDeHito } from "./hitos";
import { medirM3yM4 } from "./medicion-de-la-propuesta";
import { mensajeDeLaPropuesta } from "./mensaje-de-la-propuesta";

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
function comprobarInvariantes(
  nombre: string,
  vivo: Vivo,
  guardado: Record<string, unknown>,
  hoy: Date,
  fases: PoliticaDeFasesVencidas,
  conSemanaCero: boolean,
  // M5 (2026-09-27): la opción de lo pendiente del pasado; con «traer-a-hoy» se mira también (4b).
  pendientesDelPasado: PoliticaDePendientesDelPasado = "avisar",
) {
  const b = leer(guardado);
  const conPolitica = { ...politica(fases), pendientesDelPasado };
  const r = reprogramarDesdeHoy({ vivo, borrador: b, hoy, politica: conPolitica, conSemanaCero });
  if (!r) throw new Error(`${nombre}: sin semana de hoy`);
  // (6) determinista.
  expect(reprogramarDesdeHoy({ vivo, borrador: leer(guardado), hoy, politica: conPolitica, conSemanaCero }), `${nombre}: no es determinista`).toEqual(r);
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
  /* (4b) M5: cada traída a hoy queda EN la semana de hoy, es una abierta sin fecha fijada, no es de la Semana 0 ni de una
     fase hecha o suspendida, y no es a la vez una arrastrada. */
  const viva = new Map(vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, { t, f }] as const)));
  const arrastradas = new Set(r.tareas.map((t) => t.tareaId));
  for (const t of r.traidas) {
    const v = viva.get(t.tareaId)!;
    expect(todo.tarea.get(t.tareaId), `${nombre} · ${t.tareaId} traída no quedó en la semana de hoy`).toBe(H);
    expect(["PENDING", "IN_PROGRESS"], `${nombre} · ${t.tareaId} traída con avance`).toContain(v.t.status);
    expect(v.t.inicioFijado ?? v.t.finFijado, `${nombre} · ${t.tareaId} traída con fecha fijada`).toBeNull();
    expect(t.faseId === cero || v.f.status === "DONE" || v.f.status === "SUSPENDED", `${nombre} · ${t.tareaId} traída de una fase quieta`).toBe(false);
    expect(arrastradas.has(t.tareaId), `${nombre} · ${t.tareaId} traída y arrastrada`).toBe(false);
    expect(t.conCambio, `${nombre} · ${t.tareaId} traída colgada de un cambio de fase`).toBeUndefined();
  }
  if (pendientesDelPasado === "avisar") expect(r.traidas, `${nombre} · trajo algo con «avisar»`).toEqual([]);
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

/**
 * Revisión de M1–M5 (2026-09-27, hallazgos 1, 2 y 8): las invariantes (1) y (2) sobre un vivo que marca hechas DESPUÉS de
 * calcular la propuesta, entre la propuesta y «Aplicar» (el Gantt se sigue editando con «Ver como estaba antes»). La
 * propuesta se calcula con `vivo`; se proyecta con `despues`. Hasta la revisión, las invariantes miraban solo el vivo del
 * cálculo y D13 cubría solo las arrastradas: una fase que se movía entera o de rebote se llevaba lo que marcaron hecho.
 * Devuelve cuántas veces actuó la protección (con todo marcado): choques por «empezó después» y fijadas al aplicar.
 */
function comprobarLoEmpezadoDespues(
  nombre: string,
  vivo: Vivo,
  guardado: Record<string, unknown>,
  hoy: Date,
  fases: PoliticaDeFasesVencidas,
  conSemanaCero: boolean,
  hechasDespues: ReadonlySet<string>,
): number {
  const r = reprogramarDesdeHoy({ vivo, borrador: leer(guardado), hoy, politica: politica(fases), conSemanaCero });
  if (!r) throw new Error(`${nombre}: sin semana de hoy`);
  const con = conLaReprogramacion(guardado, r);
  const despues: Vivo = {
    ...vivo,
    fases: vivo.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (hechasDespues.has(t.id) ? { ...t, status: "DONE" } : t)) })),
  };
  const antes = semanas(despues, guardado, []);
  const empezadas = despues.fases.filter((f) => f.status !== "PENDING" || (f.tareas ?? []).some((t) => t.status !== "PENDING"));
  const conAvance = despues.fases.flatMap((f) => (f.tareas ?? []).filter((t) => t.status === "DONE" || t.status === "SUSPENDED"));
  const deFase = leer(con).cambios.filter((c) => c.tipo === "fase-cambia" || c.tipo === "fase-nueva");
  const conCasilla = deFase.filter((c) => !(c.tipo === "fase-cambia" && c.fijaInicio)).map((c) => c.clave);
  const delPin = deFase.filter((c) => c.tipo === "fase-cambia" && c.fijaInicio).map((c) => c.clave);
  for (let m = 0; m < 1 << conCasilla.length; m++) {
    const sin = conCasilla.filter((_, j) => !(m & (1 << j)));
    const d = semanas(despues, con, [...sin, ...delPin]);
    const combinacion = `${nombre} · marcadas: ${conCasilla.filter((_, j) => m & (1 << j)).join(", ") || "ninguna"}`;
    for (const f of empezadas) expect(d.inicio.get(f.id), `${combinacion} · movió el inicio de ${f.id}, que empezó`).toBe(antes.inicio.get(f.id));
    for (const t of conAvance) expect(d.tarea.get(t.id), `${combinacion} · movió ${t.id} (${t.status})`).toBe(antes.tarea.get(t.id));
  }
  /* Revisión 2 de M1–M5 (hallazgo 1), con todo marcado: lo que venía DETRÁS de una fase que se queda (por su choque o
     porque se fija al aplicar) no vuelve a su lugar viejo. (a) Ninguna fase sin empezar que la propuesta corrió termina en
     una semana que ya pasó, si en la propuesta no terminaba ahí. (b) En el orden del plan, el cierre (la fase de cierre o
     la última: `esFaseDeHito`) sin empezar no arranca antes de que termine lo que lo precedía, como en (5). Solo si se
     aplica algo: con todo en choque no se escribe nada (ni el pin ni las seguidoras) y el cronograma queda como está. */
  const plan = planDeAplicacion(despues, leer(con));
  const H = r.semana;
  const propuesta = semanas(vivo, con, []);
  const aplicado = semanas(despues, con, []);
  const fin = (s: ReturnType<typeof semanas>, clave: string) => s.inicio.get(clave)! + s.duracion.get(clave)!;
  const idsEmpezadas = new Set(empezadas.map((f) => f.id));
  const sinEmpezar = [...propuesta.inicio.keys()].filter((clave) => !idsEmpezadas.has(clave) && aplicado.inicio.has(clave));
  for (const clave of plan.marcadas > 0 ? sinEmpezar : []) {
    const laCorrio = propuesta.inicio.get(clave) !== antes.inicio.get(clave) || propuesta.duracion.get(clave) !== antes.duracion.get(clave);
    if (!laCorrio || fin(propuesta, clave) <= H) continue;
    expect(fin(aplicado, clave), `${nombre} · ${clave}, sin empezar y reprogramada, vuelve a semanas que ya pasaron`).toBeGreaterThan(H);
  }
  if (plan.marcadas > 0 && fases === "en-el-orden-del-plan") {
    const e = proyectar(vivo, leer(guardado)).fases;
    const r0 = computePhaseRanges(e);
    const cero = conSemanaCero ? vivo.fases[0]?.id : undefined;
    e.forEach((f, i) => {
      if (idsEmpezadas.has(f.clave) || !aplicado.inicio.has(f.clave) || !esFaseDeHito(f.name, i === e.length - 1)) return;
      for (let j = 0; j < i; j++) {
        if (e[j].clave === cero || r0[j].end > r0[i].start || !aplicado.inicio.has(e[j].clave)) continue;
        expect(aplicado.inicio.get(f.clave)!, `${nombre} · el cierre ${f.clave} arranca antes de que termine ${e[j].clave}`).toBeGreaterThanOrEqual(
          fin(aplicado, e[j].clave),
        );
      }
    });
  }
  return plan.items.filter((it) => it.choque === "Empezó después de la propuesta: no se mueve.").length + plan.fijadasAlAplicar.length;
}

describe("Revisión de M1–M5 · las invariantes cuando marcan hecha una tarea DESPUÉS de la propuesta", { timeout: 30_000 }, () => {
  /** La primera pendiente de la fase, dentro de su duración (el validador no deja una hecha fuera de su fase). */
  const primeraPendiente = (vivo: Vivo, id: string) => {
    const f = vivo.fases.find((x) => x.id === id)!;
    return f.tareas!.find((t) => t.status === "PENDING" && t.weekIndex < f.durationWeeks)!.id;
  };

  it("⭐ sobre el fixture: una de cada fase que se mueve entera («Fase D», «E», «G», «J») o de rebote («Fase H», «K»)", () => {
    /* Las ediciones que la ponen en rojo: quitar el choque de `evaluar` (el inicio del sistema sobre una fase que hoy está
       empezada: «Fase D» pasaba de S5 a S20 con su hecha) o quitar el paso 10 de `planDeAplicacion` (la contigua que empezó
       después se corría de rebote: «Fase K» de S18 a S30, «Fase H» de S12 a S25). */
    let actuo = 0;
    for (const grupo of [["f05", "f09", "f12"], ["f06", "f08", "f11"]]) {
      const hechas = new Set(grupo.map((id) => primeraPendiente(VIVO, id)));
      actuo += comprobarLoEmpezadoDespues(`fixture sin la IA · ${grupo}`, VIVO, SIN_LA_IA(), HOY, "en-el-orden-del-plan", true, hechas);
      actuo += comprobarLoEmpezadoDespues(`fixture con la IA · ${grupo}`, VIVO, guardadoDelPaso1(), HOY, "en-el-orden-del-plan", true, hechas);
    }
    const todas = new Set(["f05", "f06", "f08", "f09", "f11", "f12"].map((id) => primeraPendiente(VIVO, id)));
    actuo += comprobarLoEmpezadoDespues("fixture · todo desde hoy", VIVO, SIN_LA_IA(), HOY, "todo-desde-hoy", true, todas);
    expect(actuo, "la protección no actuó: el fixture no ejercita el caso").toBeGreaterThanOrEqual(12);
  });

  it("⭐ sobre 50 cronogramas al azar (semilla fija): una pendiente al azar de una fase sin empezar, marcada hecha después", () => {
    let actuo = 0;
    for (let semilla = 1; semilla <= 50; semilla++) {
      const c = cronogramaAlAzar(semilla);
      const r = azar(semilla + 1000);
      const candidatas = c.vivo.fases.flatMap((f) =>
        f.status === "PENDING" && !(f.tareas ?? []).some((t) => t.status !== "PENDING")
          ? (f.tareas ?? []).filter((t) => t.weekIndex < f.durationWeeks).map((t) => t.id)
          : [],
      );
      if (candidatas.length === 0) continue;
      const hechas = new Set([r.uno(candidatas)]);
      for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy"] as const) {
        actuo += comprobarLoEmpezadoDespues(`al azar ${semilla} · ${fases}`, c.vivo, c.guardado, c.hoy, fases, c.conSemanaCero, hechas);
      }
    }
    // Que el generador de verdad ejercite lo que cuida (si no, las invariantes pasarían en vacío).
    expect(actuo, "casi nunca actuó la protección en los cronogramas al azar").toBeGreaterThanOrEqual(20);
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

/**
 * Revisión 2 de M1–M5 (2026-09-27, hallazgo 1): la revisión dejó quieta la fase que empezó después de la propuesta, pero
 * lo que venía DETRÁS de ella sin empezar, corrido de rebote y sin casilla, volvía a su lugar viejo: pendientes en semanas
 * que ya pasaron, sin línea, y un cierre antes del trabajo que el mismo «Aplicar» estira. Ahora se queda donde lo puso la
 * propuesta (`seguidorasAlAplicar`). Las ediciones que la ponen en rojo: quitar las seguidoras del paso 10 de
 * `planDeAplicacion` (o seguir el cursor sin mirar dónde las ponía la propuesta).
 */
describe("Revisión 2 de M1–M5 · lo que venía detrás de una fase que se queda al aplicar", { timeout: 30_000 }, () => {
  const marcarHechas = (vivo: Vivo, hechas: ReadonlySet<string>): Vivo => ({
    ...vivo,
    fases: vivo.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (hechas.has(t.id) ? { ...t, status: "DONE" } : t)) })),
  });

  it("⭐ la sonda p1: marcas hecha una tarea de «Integración»; se queda en S11, y «Capacitación» y el cierre siguen en S30 y S33", () => {
    // Hoy es la S20. «Configuración» (empezada) se estira hasta la S25 y lo demás iba de rebote detrás.
    const hoy = new Date("2026-09-27T12:00:00-06:00");
    const vivo: Vivo = {
      ancla: new Date(hoy.getTime() - (20 * 7 + 2) * 86_400_000).toISOString(),
      fases: [
        fase("S0", "Semana 0", 1, null, "DONE", [tarea("s0", 0, "DONE")]),
        fase("W", "Configuración", 10, null, "IN_PROGRESS", [tarea("w0", 0, "DONE"), tarea("w1", 2, "DONE"), tarea("w2", 4), tarea("w3", 8)]),
        fase("X", "Integración", 4, null, "PENDING", [tarea("x0", 0), tarea("x1", 2)]),
        fase("Y", "Capacitación", 3, null, "PENDING", [tarea("y0", 0), tarea("y1", 2)]),
        fase("C", "Cierre", 1, null, "PENDING", [tarea("c0", 0, "PENDING", { title: "Reunión de cierre" })]),
      ],
    };
    const hechas = new Set(["x0"]);
    for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy"] as const) {
      expect(comprobarLoEmpezadoDespues(`p1 · ${fases}`, vivo, SIN_LA_IA(), hoy, fases, true, hechas), fases).toBe(1);
    }
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo, hoy);
    expect(r.semana).toBe(20);
    const con = conLaReprogramacion(SIN_LA_IA(), r);
    const inicios = (v: Vivo) => Object.fromEntries(semanas(v, con, []).inicio);
    expect(inicios(vivo), "la propuesta").toEqual({ S0: 0, W: 1, X: 26, Y: 30, C: 33 });
    const despues = marcarHechas(vivo, hechas);
    expect(inicios(despues), "al aplicar").toEqual({ S0: 0, W: 1, X: 11, Y: 30, C: 33 });
    const plan = planDeAplicacion(despues, leer(con));
    expect(plan.fijadasAlAplicar).toEqual([{ faseId: "X", semana: 11 }]);
    expect(plan.seguidorasAlAplicar).toEqual([{ fase: "Y", semana: 30 }]);
    expect(plan.escrituras.fases.find((f) => f.id === "Y")?.campos, "no se escribe su inicio").toEqual({ startWeek: 30 });
    expect(plan.escrituras.fases.some((f) => f.id === "C"), "el cierre va contiguo detrás").toBe(false);
  });

  it("⭐ Wherex: marcas hecha una tarea de «Cierre y entrega» («Fase G»): su casilla choca y «Configuración Marketing Hub» («Fase H») sigue en S25", () => {
    const g = VIVO.fases.find((f) => f.id === "f08")!;
    const hechas = new Set([g.tareas!.find((t) => t.status === "PENDING" && t.weekIndex < g.durationWeeks)!.id]);
    let actuo = 0;
    actuo += comprobarLoEmpezadoDespues("fixture sin la IA · f08", VIVO, SIN_LA_IA(), HOY, "en-el-orden-del-plan", true, hechas);
    actuo += comprobarLoEmpezadoDespues("fixture con la IA · f08", VIVO, guardadoDelPaso1(), HOY, "en-el-orden-del-plan", true, hechas);
    actuo += comprobarLoEmpezadoDespues("fixture · todo desde hoy · f08", VIVO, SIN_LA_IA(), HOY, "todo-desde-hoy", true, hechas);
    expect(actuo, "el choque de «Fase G» no actuó").toBe(3);
    const con = conLaReprogramacion(SIN_LA_IA(), reprogramar(SIN_LA_IA(), "en-el-orden-del-plan"));
    const despues = marcarHechas(VIVO, hechas);
    const s = semanas(despues, con, []);
    expect([s.inicio.get("f08"), s.inicio.get("f09")], "«Fase G» se queda en S11 y «Fase H» sigue en S25").toEqual([11, 25]);
    expect(planDeAplicacion(despues, leer(con)).seguidorasAlAplicar).toEqual([{ fase: "f09", semana: 25 }]);
  });
});

/**
 * Revisión 3 de M1–M5 (2026-09-27): la seguidora se fija SOLO CUANDO HACE FALTA. La revisión 2 la fijaba siempre que
 * quedaría antes que en un segundo cursor que da por hecho que la fase que se queda empezó después de la propuesta; con
 * una que ya estaba empezada y que corre algo que el CSE cambió luego (acá, una casilla que desmarca) la corría más tarde
 * que en pantalla y escribía su inicio. Y aunque algo haya empezado después, una seguidora que pegada no queda en el
 * pasado sigue contigua, como antes de la revisión 2 (el cierre, si arrancaría antes del trabajo que lo precede, no).
 */
describe("Revisión 3 de M1–M5 · la seguidora se fija solo cuando hace falta", { timeout: 30_000 }, () => {
  it("⭐ la sonda C, solo casillas: desmarcas el acortamiento de la IA en «Fase 0» y «Fase 2» sigue en S8, sin escribirse", () => {
    /* La edición que la pone en rojo: volver a la regla de la revisión 2 (la fijada al aplicar corre el segundo cursor
       aunque la propuesta como se calculó no la moviera, y toda seguidora que quedaría antes se fija). «Fase 2» pasaba a
       S10 «como en la propuesta», solapada entera con «Fase 3», y se escribía su inicio. */
    const vivo: Vivo = {
      ancla: "2026-05-04T00:00:00.000Z",
      fases: [
        fase("f0", "Fase 0", 4, null, "PENDING", [tarea("a0", 4), tarea("a1", 2), tarea("a2", 3)]),
        fase("f1", "Fase 1", 2, null, "DONE", [tarea("b0", 0, "DONE")]),
        fase("f2", "Fase 2", 4, null, "PENDING", [tarea("c0", 3), tarea("c1", 3)]),
        fase("f3", "Fase 3", 4, null, "DONE", [tarea("d0", 2, "DONE"), tarea("d1", 0, "DONE")]),
      ],
    };
    const hoy = new Date("2026-05-18T12:00:00.000Z");
    const deLaIA = (id: string, desde: number, a: number) => ({
      tipo: "fase-cambia",
      clave: claveDeCampo(id, "durationWeeks"),
      faseId: id,
      fase: `Fase ${id.slice(1)}`,
      campo: "durationWeeks",
      desde,
      a,
      motivo: "IA",
    });
    const guardado = { ...SIN_LA_IA(), cambios: [deLaIA("f0", 4, 2), deLaIA("f1", 2, 4)] };
    const r = reprogramar(guardado, "en-el-orden-del-plan", vivo, hoy, false);
    expect(r.semana).toBe(2);
    const con = conLaReprogramacion(guardado, r);
    const inicios = (sin: string[]) => Object.fromEntries(semanas(vivo, con, sin).inicio);
    expect(inicios([]), "todo marcado").toEqual({ f0: 2, f1: 4, f2: 8, f3: 10 });
    const SIN = [claveDeCampo("f0", "durationWeeks")];
    const plan = planDeAplicacion(vivo, leer(con), SIN);
    expect(plan.fijadasAlAplicar, "«Fase 1» ya estaba hecha al calcular").toEqual([{ faseId: "f1", semana: 4 }]);
    expect(plan.seguidorasAlAplicar).toEqual([]);
    expect(inicios(SIN), "«Fase 2» sigue pegada a «Fase 1»").toEqual({ f0: 2, f1: 4, f2: 8, f3: 10 });
    expect(plan.escrituras.fases.map((f) => f.id), "no se escribe su inicio").not.toContain("f2");
  });

  it("⭐ la sonda p1 con hoy en la S16: «Capacitación» pegada no queda en el pasado y sigue contigua; el cierre sí se queda en S29", () => {
    /* Las ediciones que la ponen en rojo: fijar toda seguidora que quedaría antes que en la propuesta (sin «terminaría
       vencida»: «Capacitación» se escribía en S26), o quitar la excepción del cierre (volvía a S18, antes de que termine
       «Configuración», estirada hasta la S21). */
    const hoy = new Date("2026-09-27T12:00:00-06:00");
    const vivo: Vivo = {
      ancla: new Date(hoy.getTime() - (16 * 7 + 2) * 86_400_000).toISOString(),
      fases: [
        fase("S0", "Semana 0", 1, null, "DONE", [tarea("s0", 0, "DONE")]),
        fase("W", "Configuración", 10, null, "IN_PROGRESS", [tarea("w0", 0, "DONE"), tarea("w1", 2, "DONE"), tarea("w2", 4), tarea("w3", 8)]),
        fase("X", "Integración", 4, null, "PENDING", [tarea("x0", 0), tarea("x1", 2)]),
        fase("Y", "Capacitación", 3, null, "PENDING", [tarea("y0", 0), tarea("y1", 2)]),
        fase("C", "Cierre", 1, null, "PENDING", [tarea("c0", 0, "PENDING", { title: "Reunión de cierre" })]),
      ],
    };
    const hechas = new Set(["x0"]);
    for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy"] as const) {
      expect(comprobarLoEmpezadoDespues(`p1 en S16 · ${fases}`, vivo, SIN_LA_IA(), hoy, fases, true, hechas), fases).toBe(1);
    }
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", vivo, hoy);
    expect(r.semana).toBe(16);
    const con = conLaReprogramacion(SIN_LA_IA(), r);
    const inicios = (v: Vivo) => Object.fromEntries(semanas(v, con, []).inicio);
    expect(inicios(vivo), "la propuesta").toEqual({ S0: 0, W: 1, X: 22, Y: 26, C: 29 });
    const despues: Vivo = {
      ...vivo,
      fases: vivo.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (hechas.has(t.id) ? { ...t, status: "DONE" } : t)) })),
    };
    expect(inicios(despues), "al aplicar").toEqual({ S0: 0, W: 1, X: 11, Y: 15, C: 29 });
    const plan = planDeAplicacion(despues, leer(con));
    expect(plan.fijadasAlAplicar).toEqual([{ faseId: "X", semana: 11 }]);
    expect(plan.seguidorasAlAplicar).toEqual([{ fase: "C", semana: 29 }]);
    expect(plan.escrituras.fases.map((f) => f.id), "no se escribe el inicio de «Capacitación»").not.toContain("Y");
  });
});

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

  it("⭐ la Semana 0 por su nombre: en un Desarrollo o un Web cuya primera fase se llama «Semana 0», queda quieta y se avisa", () => {
    /* Revisión de M1–M5 (2026-09-27, hallazgo 3). La edición que la pone en rojo: volver a `faseDeSemanaCero` sola (null
       siempre sin Semana 0 en el pipeline): JUDESUR estiraba su «Semana 0» de 1 a 10 semanas y corría a hoy sus 10
       pendientes, incluidas las de arranque; RC Inmobiliaria DocuSign le ponía inicio a una «Semana 0» vacía. */
    const pendientes = Array.from({ length: 10 }, (_, k) => tarea(`s${k}`, 0));
    const judesur = conVivo([
      fase("s0", "Semana 0", 1, null, "IN_PROGRESS", [tarea("k", 0, "DONE"), ...pendientes]),
      fase("r", "Relevamiento técnico", 2, null, "PENDING", [tarea("r1", 0), tarea("r2", 1)]),
      fase("d", "Desarrollo", 20, null, "PENDING", [tarea("d1", 3)]),
    ]);
    const r = reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", judesur, HOY, false);
    expect(r.cambios.some((c) => c.faseId === "s0"), "se reprogramó la Semana 0").toBe(false);
    expect(r.tareas.some((t) => t.faseId === "s0"), "se corrieron las pendientes de la Semana 0").toBe(false);
    expect(r.sinHacer).toContainEqual({ faseId: "s0", motivo: "semana-0" });
    // Lo que sigue es trabajo y se reprograma como siempre (espera a nada: la Semana 0 no es antecesora).
    expect(casillas(r).map(comoTexto)).toEqual(["r:startWeek:null→18"]);
    // «Semana cero», sin tildes ni mayúsculas, también; una «Semana 0» vacía (RC Inmobiliaria DocuSign) no recibe inicio.
    const web = conVivo([fase("s0", "SEMANA CERO · arranque", 1, null, "PENDING", []), fase("w", "Diseño web", 2, null, "PENDING", [tarea("w1", 0)])]);
    expect(reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", web, HOY, false).cambios.map(comoTexto)).toEqual(["w:startWeek:null→18"]);
    // Solo la PRIMERA fase y solo por el nombre: una «Semana 0» que no es la primera se reprograma como cualquiera.
    const segunda = conVivo([fase("r", "Relevamiento técnico", 2, null, "PENDING", [tarea("r1", 0)]), fase("s0", "Semana 0", 1, 3, "PENDING", [tarea("x", 0)])]);
    expect(casillas(reprogramar(SIN_LA_IA(), "en-el-orden-del-plan", segunda, HOY, false)).map((c) => c.faseId)).toEqual(["r", "s0"]);
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

// ─────────────────────────────────────────────────────────────────────────────
// ── M5 · «traer a hoy» (implementada y APAGADA: lo vigente es «avisar») ───────
// ─────────────────────────────────────────────────────────────────────────────

/* M5 (spec del replanteo §6, 2026-09-27). Decisión de Elías: lo pendiente del pasado se AVISA (lo vigente); «traer a
   hoy» queda hecha y probada en el interruptor. Con ella, en una fase EN CURSO (no la Semana 0, ni hecha, suspendida o
   casi terminada), cada abierta movible de una semana vencida pasa a la semana de hoy de su fase, con su casilla. */
const conLasDos = (fasesVencidas: PoliticaDeFasesVencidas, pendientesDelPasado: PoliticaDePendientesDelPasado): PoliticaDeAtrasos => ({
  ...POLITICA_DE_ATRASOS,
  fasesVencidas,
  pendientesDelPasado,
});
const reprogramarCon = (
  guardado: Record<string, unknown>,
  fasesVencidas: PoliticaDeFasesVencidas,
  pendientesDelPasado: PoliticaDePendientesDelPasado,
  vivo: Vivo = VIVO,
  hoy = HOY,
  conSemanaCero = true,
) => reprogramarDesdeHoy({ vivo, borrador: leer(guardado), hoy, politica: conLasDos(fasesVencidas, pendientesDelPasado), conSemanaCero })!;

/** La línea 5 del mensaje de la propuesta reprogramada, con lo marcado por defecto. */
function lineaCinco(vivo: Vivo, guardado: Record<string, unknown>, hoy: Date): string | null {
  const b = leer(guardado);
  const L = { tareas: "listas" as const };
  const m = mensajeDeLaPropuesta({
    vivo,
    borrador: b,
    r: resumir(vivo, b, b.excluidos ?? [], L),
    entera: resumir(vivo, b, [], L),
    referencias: null,
    atrasos: [],
    cierreFijado: null,
    hoy,
  });
  return m.lineas.find((l) => /sin hacer|pasan? a esta semana|caen? en semanas/.test(l)) ?? null;
}

/** La S5 del fixture: «Fase A» (S2–S5, empezada) está EN CURSO con 8 pendientes de S2 y S3; «Fase C» (S2–S3) venció. */
const EN_LA_S5 = new Date("2026-06-24T12:00:00-06:00");
const SIN_HACER_13 = "⚠ Quedaron sin hacer 13 tareas de semanas que ya pasaron, en «Semana 0» y «Fase A»: la propuesta no las mueve (están en «Más»).";
const SIN_HACER_5_Y_8 = "⚠ Quedaron sin hacer 5 tareas de semanas que ya pasaron, en «Semana 0»: la propuesta no las mueve; 8 más pasan a esta semana.";

describe("M5 · las 6 combinaciones del interruptor sobre el fixture", () => {
  it("⭐ en la S5: casillas, pins, arrastradas, traídas y la línea 5 de cada una", () => {
    /* La edición que la pone en rojo: implementar una sola rama (ignorar `pendientesDelPasado`: las tres de «traer-a-hoy»
       daban 0 traídas y la línea de «avisar»), o traer también lo de una fase atrasada que el sistema no reprograma
       («avisar» en las fases vencidas: «Fase C» es de (b), no de (a)). */
    const esperado: Array<[PoliticaDeFasesVencidas, PoliticaDePendientesDelPasado, number, number, number, number, string]> = [
      ["en-el-orden-del-plan", "avisar", 3, 0, 9, 0, SIN_HACER_13],
      ["en-el-orden-del-plan", "traer-a-hoy", 3, 0, 9, 8, SIN_HACER_5_Y_8],
      ["todo-desde-hoy", "avisar", 1, 0, 9, 0, SIN_HACER_13],
      ["todo-desde-hoy", "traer-a-hoy", 1, 0, 9, 8, SIN_HACER_5_Y_8],
      [
        "avisar",
        "avisar",
        0,
        0,
        0,
        0,
        "⚠ Quedaron sin hacer 22 tareas de semanas que ya pasaron, en «Semana 0», «Fase A» y 1 fase más: la propuesta no las mueve (están en «Más»).",
      ],
      [
        "avisar",
        "traer-a-hoy",
        0,
        0,
        0,
        8,
        "⚠ Quedaron sin hacer 14 tareas de semanas que ya pasaron, en «Semana 0» y «Fase C»: la propuesta no las mueve; 8 más pasan a esta semana.",
      ],
    ];
    const visto = esperado.map(([f, p]) => {
      const g = SIN_LA_IA();
      const r = reprogramarCon(g, f, p, VIVO, EN_LA_S5);
      expect(r.semana).toBe(5);
      return [f, p, casillas(r).length, pins(r).length, r.tareas.length, r.traidas.length, lineaCinco(VIVO, conLaReprogramacion(g, r), EN_LA_S5)];
    });
    expect(visto).toEqual(esperado);
    for (const l of esperado.map((x) => x[6])) expect(l.length).toBeLessThanOrEqual(140);
    // Las 8 traídas son las pendientes de S2 y S3 de «Fase A»: pasan a su semana 3 (la S5), cada una con su casilla.
    const r = reprogramarCon(SIN_LA_IA(), "en-el-orden-del-plan", "traer-a-hoy", VIVO, EN_LA_S5);
    expect(r.traidas.map((t) => `${t.tareaId}:${t.desde.weekIndex}→${t.a.weekIndex}`)).toEqual([
      "t021:0→3",
      "t022:0→3",
      "t023:0→3",
      "t027:1→3",
      "t028:1→3",
      "t029:1→3",
      "t030:1→3",
      "t031:1→3",
    ]);
    for (const t of r.traidas) {
      expect(t).toMatchObject({ tipo: "tarea-cambia", faseId: "f02", desdeHoy: true, clave: claveDeTareaQueCambia(t.tareaId) });
      expect(t.conCambio, "una traída colgada de un cambio de fase (no tendría casilla)").toBeUndefined();
    }
    expect(r.sinHacer, "lo que se trae ya no se nombra; la Semana 0, sí").toEqual([{ faseId: "f01", motivo: "semana-0" }]);
  });

  it("⭐ en la S18 (Wherex), «traer a hoy» no cambia nada: la Semana 0 avisa y la única fase en curso no tiene nada vencido", () => {
    /* La edición que la pone en rojo: traer lo de una fase que el sistema reprogramó (sus abiertas ya se corrieron) o lo
       de la Semana 0. Los números de M4 (8 casillas, 1 pin y 25 arrastradas) no se mueven con la otra opción de (a). */
    for (const f of ["en-el-orden-del-plan", "todo-desde-hoy", "avisar"] as const) {
      const g = SIN_LA_IA();
      const avisando = reprogramarCon(g, f, "avisar");
      const trayendo = reprogramarCon(g, f, "traer-a-hoy");
      expect(trayendo.traidas, f).toEqual([]);
      expect({ ...trayendo, reloj: null }, f).toEqual({ ...avisando, reloj: null });
      expect(lineaCinco(VIVO, conLaReprogramacion(g, trayendo), HOY), f).toBe(lineaCinco(VIVO, conLaReprogramacion(g, avisando), HOY));
    }
    expect(lineaCinco(VIVO, conLaReprogramacion(SIN_LA_IA(), reprogramarCon(SIN_LA_IA(), "en-el-orden-del-plan", "traer-a-hoy")), HOY)).toBe(
      "⚠ Quedaron sin hacer 5 tareas de semanas que ya pasaron, en «Semana 0»: la propuesta no las mueve (están en «Más»).",
    );
  });
});

describe("M5 · lo que «traer a hoy» no toca", () => {
  it("⭐ la Semana 0 sigue quieta aunque esté en curso; en un Desarrollo (sin Semana 0) la primera fase sí se trae", () => {
    /* La edición que la pone en rojo: traer también la Semana 0 (quitar `!esCero`): Elías pidió «revisar solamente que no
       haya quedado algo importante sin hacer» (D1). */
    const enLaS1 = new Date("2026-05-28T12:00:00-06:00");
    const r = reprogramarCon(SIN_LA_IA(), "en-el-orden-del-plan", "traer-a-hoy", VIVO, enLaS1);
    expect(r.semana).toBe(1);
    expect(r.traidas, "trajo lo de la Semana 0").toEqual([]);
    expect(r.sinHacer).toEqual([{ faseId: "f01", motivo: "semana-0" }]);
    /* El mismo cronograma en un Desarrollo: su primera fase es trabajo real, en curso, y lo vencido se trae.
       2026-09-27, revisión de M1–M5 (hallazgo 3): la primera fase del fixture se llama «Semana 0», y desde la revisión una
       primera fase con ese nombre es la Semana 0 también en Desarrollo y Web (se queda quieta). Para seguir probando que la
       primera fase de un Desarrollo es trabajo real, acá se llama «Relevamiento técnico», como en la cartera. */
    const vivoDeDesarrollo: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "f01" ? { ...f, name: "Relevamiento técnico" } : f)) };
    const desarrollo = reprogramarCon(SIN_LA_IA(), "en-el-orden-del-plan", "traer-a-hoy", vivoDeDesarrollo, enLaS1, false);
    expect(desarrollo.traidas.map((t) => t.faseId)).toEqual(["f01", "f01", "f01"]);
    expect(desarrollo.traidas.every((t) => t.a.weekIndex === 1)).toBe(true);
    // Con su nombre de siempre («Semana 0»), el Desarrollo también la deja quieta.
    expect(reprogramarCon(SIN_LA_IA(), "en-el-orden-del-plan", "traer-a-hoy", VIVO, enLaS1, false).traidas).toEqual([]);
  });

  it("⭐ no se trae lo que tiene fecha fijada ni lo que tocó el chat (se nombra), ni nada de una fase hecha o suspendida", () => {
    /* Las ediciones que la ponen en rojo: traer lo que tiene fecha fijada o lo que el chat ya cambió (D6), o mirar solo
       las tareas y no el estado de la fase. */
    const vivo = conVivo([
      fase("s0", "Semana 0", 2, null, "DONE", [tarea("k", 0, "DONE")]),
      fase("a", "Fase A", 20, 2, "IN_PROGRESS", [
        tarea("a0", 0, "DONE"),
        tarea("a1", 1),
        tarea("a2", 2, "IN_PROGRESS"),
        tarea("a3", 3, "PENDING", { inicioFijado: "2026-06-15" }),
        tarea("a4", 4),
        tarea("a5", 16),
      ]),
      fase("h", "Hecha", 20, 2, "DONE", [tarea("h0", 0, "DONE"), tarea("h1", 1)]),
      fase("su", "Suspendida", 20, 2, "SUSPENDED", [tarea("su1", 1)]),
    ]);
    const guardado = SIN_LA_IA();
    const a4 = vivo.fases[1].tareas![4];
    guardado.cambios = [
      {
        tipo: "tarea-cambia",
        clave: claveDeTareaQueCambia("a4"),
        tareaId: "a4",
        faseId: "a",
        desde: { title: a4.title, weekIndex: 4, notes: null, party: "SMARTEAM", type: "TASK", inicioFijado: null, finFijado: null },
        a: { title: "Otra" },
        porChat: true,
      },
    ];
    const r = reprogramarCon(guardado, "en-el-orden-del-plan", "traer-a-hoy", vivo);
    // Hoy es la S18: «Fase A» (S2–S21) está en curso; a1 (S3) y a2 (S4) se traen a su semana 16; a5 ya es de esta semana.
    expect(r.traidas.map((t) => `${t.tareaId}→${t.a.weekIndex}`)).toEqual(["a1→16", "a2→16"]);
    expect(r.sinHacer, "lo que no se mueve sigue nombrado").toEqual([{ faseId: "a", motivo: "en-curso" }]);
    expect(r.cambios).toEqual([]);
    expect(r.tareas).toEqual([]);
  });
});

describe("M5 · las invariantes con «traer a hoy»", { timeout: 30_000 }, () => {
  it("⭐ sobre el fixture en la S5 y la S18, y sobre 150 cronogramas al azar: cada traída queda en la semana de hoy y nada con avance se mueve", () => {
    /* Las ediciones que la ponen en rojo: traerla a `hoy − inicio − 1` (queda vencida), traer una con fecha fijada o de
       una fase quieta, o colgarla del cambio de su fase (`conCambio`: perdería su casilla). */
    for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy", "avisar"] as const) {
      comprobarInvariantes(`fixture S5 · ${fases} · traer`, VIVO, SIN_LA_IA(), EN_LA_S5, fases, true, "traer-a-hoy");
    }
    comprobarInvariantes("fixture S18 · con la IA · traer", VIVO, guardadoDelPaso1(), HOY, "en-el-orden-del-plan", true, "traer-a-hoy");
    /* 150 semillas (no 50): con fases de 1 a 4 semanas, una fase EN CURSO con algo vencido es rara (con 50 salían 6). */
    let conTraidas = 0;
    for (let semilla = 1; semilla <= 150; semilla++) {
      const c = cronogramaAlAzar(semilla);
      for (const fases of ["en-el-orden-del-plan", "avisar"] as const) {
        const r = comprobarInvariantes(`al azar ${semilla} · ${fases} · traer`, c.vivo, c.guardado, c.hoy, fases, c.conSemanaCero, "traer-a-hoy");
        if (r.traidas.length > 0) conTraidas++;
      }
    }
    expect(conTraidas, "casi ningún cronograma al azar trae algo a hoy").toBeGreaterThanOrEqual(10);
  });

  it("⭐ la vuelta atrás es exacta con las traídas: sin(con(g, r)) = g", () => {
    /* La edición que la pone en rojo: no quitar las traídas en `sinReprogramacion` (un reintento en otra semana las
       sumaba dos veces, con dos cambios con la misma clave). */
    for (const fases of ["en-el-orden-del-plan", "todo-desde-hoy", "avisar"] as const) {
      for (const g of [SIN_LA_IA(), guardadoDelPaso1()]) {
        const r = reprogramarCon(g, fases, "traer-a-hoy", VIVO, EN_LA_S5);
        expect(r.traidas.length, fases).toBe(8);
        const con = conLaReprogramacion(g, r);
        expect((con.cambios as unknown[]).slice(-8), "las traídas van al final").toEqual(r.traidas);
        expect(sinReprogramacion(con), fases).toEqual(g);
      }
    }
  });
});

describe("M5 · las traídas en el plan", () => {
  const g = SIN_LA_IA();
  const r = reprogramarCon(g, "avisar", "traer-a-hoy", VIVO, EN_LA_S5);
  const b = leer(conLaReprogramacion(g, r));

  it("⭐ cada traída tiene su casilla: cuenta en «Aplicas N de M», se desmarca sola y la marcan hecha antes de aplicar → «ya está»", () => {
    /* Las ediciones que la ponen en rojo: tratarlas como arrastradas (`vaSinCasilla`: no contaban y no se podían
       desmarcar), o no mirar su estado al aplicar (D13: se movía una tarea que alguien marcó hecha entre la propuesta y
       «Aplicar»). */
    const plan = planDeAplicacion(VIVO, b);
    expect([plan.marcadas, plan.aplicables, plan.arrastradas.aplican, plan.fijadas]).toEqual([8, 8, 0, 0]);
    const una = r.traidas[0];
    const sinUna = planDeAplicacion(VIVO, b, [una.clave]);
    expect(sinUna.marcadas).toBe(7);
    expect(sinUna.items.find((it) => it.cambio.clave === una.clave)!.estado).toBe("excluido");
    const hecha: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) => (f.id === una.faseId ? { ...f, tareas: f.tareas!.map((t) => (t.id === una.tareaId ? { ...t, status: "DONE" } : t)) } : f)),
    };
    expect(planDeAplicacion(hecha, b).items.find((it) => it.cambio.clave === una.clave)!.estado, "se movía una hecha").toBe("ya-esta");
  });

  it("⭐ la medición (condición 6) compara las traídas: si falta una, NO PASA", () => {
    /* La edición que la pone en rojo: no comparar las traídas en `medirM3yM4` (una fusión que perdiera una pasaba). */
    const guardado = conLaReprogramacion(g, r);
    const seis = (x: Record<string, unknown>) =>
      medirM3yM4({ vivo: VIVO, guardado: x, borrador: leer(x), conSemanaCero: true }).find((c) => c.numero === 6)!;
    expect(seis(guardado)).toMatchObject({ pasa: true });
    expect(seis(guardado).detalle).toContain("8 pendientes pasan a esta semana");
    const sinUna = { ...guardado, cambios: (guardado.cambios as Array<{ clave: string }>).filter((c) => c.clave !== r.traidas[0].clave) };
    expect(seis(sinUna), "se perdió una traída y la medición no lo vio").toMatchObject({ pasa: false });
    expect(seis(sinUna).detalle).toContain("faltan");
  });
});
