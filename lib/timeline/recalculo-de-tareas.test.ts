/**
 * lib/timeline/recalculo-de-tareas.test.ts — E2c P1: el núcleo puro del recálculo de las tareas de una
 * fase DESFASADA. Puro: sin base, sin modelo.
 *
 * Correr: `npx vitest run lib/timeline/recalculo-de-tareas.test.ts --project unit`.
 *
 * Si el CSE quita un cambio de fase, las tareas de esa fase quedaron armadas para otra forma: la fase
 * está desfasada y sus tareas se recalculan. Lo que cuida (spec de E2c, §2 y §5 P1):
 *   1. la lectura: la forma armada con sesiones y Semana 0, y el `recalculo` guardado;
 *   2. P3 es el INTERRUPTOR: sus tareas esperan el recálculo (sin `dependeDe`, con su casilla) y
 *      aplicar espera; la huella no cambia de fórmula (hasta P3, P1 era inerte);
 *   3. qué fase está desfasada (y qué es una edición a mano, que sigue chocando);
 *   4. «Aplicar de todos modos» (`forzar`);
 *   5. la estructura supuesta con lo desmarcado y la forma de una fase en ella;
 *   6-7. la mezcla de las tareas recalculadas en el borrador;
 *   8. el aviso al terminar la corrida del recálculo;
 *   9. la espera antes de lanzarlo;
 *  10. lo que se ve: la línea, el grupo, los textos y el resumen.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  avisoDeTareasRecalculadas,
  bloqueoPorDesfasadas,
  claveDeTareaQueSeVa,
  desenlaceDelSeguimiento,
  estructuraHipotetica,
  FORMATO_BORRADOR,
  formaEnLaEstructura,
  fotoDeTarea,
  leerBorrador,
  mensajeDeRecalculoAlAplicar,
  mismaForma,
  nombresEnTexto,
  planDeAplicacion,
  resumir,
  ETIQUETA_POR_RECALCULAR,
  textoDelBotonDeAplicar,
  textoDelFalloDelRecalculo,
  type Borrador,
  type Cambio,
  type CambioDeOrden,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type FaseDesfasada,
  type FaseViva,
  type RecalculoEnElCable,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  ACCION_APLICAR_DE_TODOS_MODOS,
  ACCION_RECALCULAR,
  alVencer,
  claveDeDesfasadas,
  corridasDeLaPropuesta,
  ESPERA_DEL_RECALCULO_MS,
  formasDeDesfasadas,
  hayFormasSinLanzar,
  leerRecalculoDelCable,
  puedeLanzarElRecalculo,
  tareasDelGet,
  recalculoEnPantalla,
  textoDeAplicarDeTodosModos,
  textoDelGrupoDesfasado,
  textoDelRecalculo,
  trasLaMarca,
  type RecalculoEnPantalla,
} from "./recalculo-de-tareas";
import { fusionarRecalculo, mezclarTareasDeFases } from "./tareas-del-detalle";

// ── El fixture de borrador-tareas.test.ts ────────────────────────────────────

const tarea = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}): TareaDelVivo => ({
  id,
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  ...extra,
});
const fase = (id: string, name: string, durationWeeks: number, tareas: TareaDelVivo[], extra: Partial<FaseViva> = {}): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tareas,
  ...extra,
});

const A1 = tarea("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN" });
const B1 = tarea("b1", "Mapear procesos", 0);
const B2 = tarea("b2", "Definir pipeline", 1);
const B3 = tarea("b3", "Validar con el cliente", 1, { status: "DONE" });
const C1 = tarea("c1", "Probar flujos", 2);
const VIVO: Vivo = {
  ancla: "2026-10-05",
  fases: [fase("a", "Kick-off", 1, [A1]), fase("b", "Diseño", 2, [B1, B2, B3]), fase("c", "Pruebas", 3, [C1])],
};
const conFase = (id: string, cambio: (f: FaseViva) => FaseViva, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => (f.id === id ? cambio(f) : f)),
});

const DUR_C: CambioFaseCambia = {
  tipo: "fase-cambia",
  clave: "fase:c:durationWeeks",
  faseId: "c",
  fase: "Pruebas",
  campo: "durationWeeks",
  desde: 3,
  a: 4,
};
const PILOTO: CambioFaseNueva = {
  tipo: "fase-nueva",
  clave: "n:0000abcd",
  fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
  despuesDe: "c",
};
const ARMADAS: Borrador["tareasArmadasPara"] = {
  a: { nombre: "Kick-off", semanas: 1 },
  b: { nombre: "Diseño", semanas: 2 },
  c: { nombre: "Pruebas", semanas: 4 },
  [PILOTO.clave]: { nombre: "Piloto", semanas: 2 },
};

const nueva = (clave: string, faseClave: string, title: string, weekIndex: number): CambioTareaNueva => ({
  tipo: "tarea-nueva",
  clave,
  fase: faseClave,
  tarea: { title, weekIndex, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
});
const seVa = (t: TareaDelVivo, faseId: string): CambioTareaSeVa => ({
  tipo: "tarea-se-va",
  clave: claveDeTareaQueSeVa(t.id),
  tareaId: t.id,
  faseId,
  desde: fotoDeTarea(t),
});
const v1 = (cambios: Cambio[], extra: Partial<Borrador> = {}): Borrador => ({
  formato: FORMATO_BORRADOR,
  version: 2,
  origen: "contexto",
  observaciones: [],
  cambios,
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: true },
  tareasArmadasPara: ARMADAS,
  ...extra,
});

/** Lo típico de «Regenerar todo»: una fase más larga, una fase nueva, y las tareas de tres fases. */
const BORRADOR = v1([
  DUR_C,
  PILOTO,
  seVa(B1, "b"),
  seVa(B2, "b"),
  nueva("t:b-1", "b", "Mapear procesos de venta", 0),
  seVa(C1, "c"),
  nueva("t:c-1", "c", "Pruebas de aceptación", 3),
  nueva("t:p-1", PILOTO.clave, "Piloto con un equipo", 0),
  nueva("t:p-2", PILOTO.clave, "Medir el piloto", 1),
]);
const TAREAS_DE_C = ["tarea:c1:se-va", "t:c-1"];

const estadoDe = (plan: ReturnType<typeof planDeAplicacion>, clave: string) => plan.items.find((it) => it.cambio.clave === clave)!;
const fasesDesfasadas = (plan: { desfasadas: FaseDesfasada[] }) => plan.desfasadas.map((d) => d.fase);
const ida = (b: Borrador) => leerBorrador(JSON.parse(JSON.stringify(b)))!;

describe("1 · la lectura: la forma armada y el recálculo guardado", () => {
  it("⭐ `sesiones` y `semanaCero` hacen la ida y vuelta; si no vienen, no se inventan", () => {
    /* La edición que la pone en rojo: EXIGIR los campos nuevos (un borrador de E2a, sin ellos,
       perdería su forma armada y todas sus tareas chocarían), o inventarlos al leer. */
    const b = v1([DUR_C], {
      tareasArmadasPara: {
        a: { nombre: "Kick-off", semanas: 1, sesiones: null, semanaCero: true },
        b: { nombre: "Diseño", semanas: 2, sesiones: 3, semanaCero: false },
        c: { nombre: "Pruebas", semanas: 4 },
      },
    });
    const leido = ida(b);
    expect(leido).toEqual(b);
    expect("sesiones" in leido.tareasArmadasPara.c, "se inventó `sesiones`").toBe(false);
    expect("semanaCero" in leido.tareasArmadasPara.c, "se inventó `semanaCero`").toBe(false);
    // El borrador de E2a (sin los campos) se sigue aplicando igual: sus tareas no chocan.
    const deE2a = ida(BORRADOR);
    expect(deE2a.tareasArmadasPara).toEqual(ARMADAS);
    expect(TAREAS_DE_C.map((k) => estadoDe(planDeAplicacion(VIVO, deE2a), k).estado)).toEqual(["aplica", "aplica"]);
  });

  it("una forma armada con `sesiones` o `semanaCero` mal formados no vale (sus tareas chocan: lo seguro)", () => {
    for (const mala of [{ sesiones: -1 }, { sesiones: 1.5 }, { sesiones: "8" }, { semanaCero: "sí" }, { semanaCero: null }]) {
      const guardado = JSON.parse(JSON.stringify(v1([], { tareasArmadasPara: {} })));
      guardado.tareasArmadasPara = { c: { nombre: "Pruebas", semanas: 4, ...mala } };
      expect(leerBorrador(guardado)!.tareasArmadasPara, JSON.stringify(mala)).toEqual({});
    }
  });

  it("⭐ `recalculo` hace la ida y vuelta, con y sin motivo", () => {
    /* La edición que la pone en rojo: no leerlo (el servidor perdería qué fases recalcula y qué
       estaba desmarcado al pedirlo), o perder un campo al leer. */
    const recalculo = { corrida: "run-9", fases: [{ id: "c", nombre: "Pruebas" }], sin: ["fase:c:durationWeeks"] };
    for (const r of [recalculo, { ...recalculo, motivo: null }, { ...recalculo, motivo: "la respuesta de la IA quedó cortada" }]) {
      const b = v1([DUR_C], { recalculo: r });
      expect(ida(b), JSON.stringify(r)).toEqual(b);
    }
  });

  it("⭐ un `recalculo` mal formado queda ausente y NO cuenta en `desconocidos` (no bloquea)", () => {
    /* Es metadata del servidor, no un cambio que se deje de aplicar. La edición que la pone en rojo:
       contarlo en `desconocidos` (el CSE quedaría con «recarga la página» sin salida). */
    const bien = { corrida: "run-9", fases: [{ id: "c", nombre: "Pruebas" }], sin: [] as string[] };
    const malos: unknown[] = [
      "run-9",
      { ...bien, corrida: "" },
      { ...bien, corrida: "x".repeat(201) },
      { ...bien, fases: [] },
      { ...bien, fases: Array.from({ length: 201 }, (_, i) => ({ id: `f${i}`, nombre: "F" })) },
      { ...bien, fases: [{ id: "", nombre: "Pruebas" }] },
      { ...bien, fases: [{ id: "c", nombre: 3 }] },
      { ...bien, sin: "fase:c:durationWeeks" },
      { ...bien, sin: Array.from({ length: 2001 }, (_, i) => `k${i}`) },
      { ...bien, sin: [""] },
      { ...bien, sin: ["x".repeat(301)] },
      { ...bien, motivo: 3 },
    ];
    for (const malo of malos) {
      const guardado = { ...JSON.parse(JSON.stringify(v1([DUR_C]))), recalculo: malo };
      const leido = leerBorrador(guardado)!;
      expect(leido.recalculo, JSON.stringify(malo).slice(0, 80)).toBeUndefined();
      expect(leido.desconocidos).toBeUndefined();
      expect(planDeAplicacion(VIVO, leido).bloqueo).toBeNull();
    }
    // En el borde, vale.
    const borde = { corrida: "x".repeat(200), fases: [{ id: "y".repeat(200), nombre: "" }], sin: Array.from({ length: 2000 }, () => "z".repeat(300)) };
    expect(leerBorrador({ ...JSON.parse(JSON.stringify(v1([]))), recalculo: borde })!.recalculo).toEqual(borde);
  });
});

describe("2 · P3, el interruptor: las tareas de la fase desfasada esperan su recálculo, y aplicar espera", () => {
  it("⭐ con el cambio de semanas de «Pruebas» desmarcado: en espera SIN `dependeDe`, marcadas `recalcula`, con bloqueo y la huella de siempre", () => {
    /* ⚠ REESCRITA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus
       tareas fuera: se recalculan. En P1 (inerte) pedía el `dependeDe` del cambio y ningún bloqueo; P3
       quita el `dependeDe` (la casilla sigue en manos del CSE) y prende el bloqueo, detrás del de las
       tareas «armando». Las ediciones que la ponen en rojo: dejar el `dependeDe` (sin casilla), no
       bloquear (se aplicarían sin recalcular), o que `recalcula` entre en la huella. La huella es la de
       HEAD 78f45ca6 con esta entrada: el estado de cada cambio no cambió, solo su `dependeDe`, que la
       huella no cubre. */
    const plan = planDeAplicacion(VIVO, BORRADOR, ["fase:c:durationWeeks"], { tareas: "listas" });
    for (const k of TAREAS_DE_C) {
      expect(estadoDe(plan, k), k).toMatchObject({ estado: "excluido", recalcula: true });
      expect(estadoDe(plan, k).dependeDe, `${k} sigue colgada del cambio`).toBeUndefined();
    }
    expect(plan.bloqueo).toBe(bloqueoPorDesfasadas(["Pruebas"]));
    expect(plan.bloqueoPorDesfasadas).toBe(true);
    expect(plan.huella, "la huella cambió").toBe("17069a204d3e48");
    expect(plan.desfasadas).toEqual([
      {
        fase: "c",
        nombre: "Pruebas",
        forma: { nombre: "Pruebas", semanas: 3, sesiones: null, semanaCero: false },
        armada: { nombre: "Pruebas", semanas: 4 },
      },
    ]);
    expect(plan.forzadas).toEqual([]);
    // Solo las tareas de «Pruebas» se marcan: las demás no.
    expect(plan.items.filter((it) => it.recalcula).map((it) => it.cambio.clave)).toEqual(TAREAS_DE_C);
    // Con todo marcado, nada está desfasado.
    expect(planDeAplicacion(VIVO, BORRADOR, [], { tareas: "listas" }).desfasadas).toEqual([]);
  });

  it("solo bloquea una fase desfasada: ninguna otra casilla, ni todas juntas", () => {
    /* ⚠ REESCRITA en E2c P3 (2026-09-25), con esta razón: la misma de arriba. Pedía que ninguna
       combinación bloqueara (P1 inerte); ahora bloquea solo el cambio de semanas de «Pruebas», que la
       deja desfasada. La edición que la pone en rojo: bloquear sin desfasadas. */
    const claves = BORRADOR.cambios.map((c) => c.clave);
    for (const k of claves) {
      const plan = planDeAplicacion(VIVO, BORRADOR, [k], { tareas: "listas" });
      expect([plan.bloqueo, plan.bloqueoPorDesfasadas], k).toEqual(
        k === "fase:c:durationWeeks" ? [bloqueoPorDesfasadas(["Pruebas"]), true] : [null, false],
      );
    }
    // Todo desmarcado (también las tareas de «Pruebas»): nada que recalcular.
    expect(planDeAplicacion(VIVO, BORRADOR, claves, { tareas: "listas" }).bloqueo).toBeNull();
    // Forzada, tampoco.
    expect(planDeAplicacion(VIVO, BORRADOR, ["fase:c:durationWeeks"], { tareas: "listas", forzar: ["c"] }).bloqueo).toBeNull();
  });
});

describe("3 · qué fase está desfasada, y qué sigue siendo una edición a mano", () => {
  it("⭐ con TODAS sus tareas desmarcadas no hay nada que recalcular", () => {
    /* La edición que la pone en rojo: contar la fase aunque el CSE ya no quiera ninguna de sus tareas
       (se pagaría una corrida para nada). */
    const plan = planDeAplicacion(VIVO, BORRADOR, ["fase:c:durationWeeks", ...TAREAS_DE_C]);
    expect(plan.desfasadas).toEqual([]);
    // Con una sola desmarcada, sí.
    expect(fasesDesfasadas(planDeAplicacion(VIVO, BORRADOR, ["fase:c:durationWeeks", "t:c-1"]))).toEqual(["c"]);
  });

  it("⛔ una fase nueva desmarcada NO está desfasada: sus tareas se van con ella (heredadas)", () => {
    /* La edición que la pone en rojo: incluir la fase nueva excluida (se pagaría un recálculo para una
       fase que no va a existir). */
    const plan = planDeAplicacion(VIVO, BORRADOR, [PILOTO.clave]);
    for (const k of ["t:p-1", "t:p-2"]) {
      expect(estadoDe(plan, k)).toMatchObject({ estado: "excluido", dependeDe: PILOTO.clave });
      expect(estadoDe(plan, k).recalcula, `${k} quedó para recalcular`).toBeUndefined();
    }
    expect(plan.desfasadas).toEqual([]);
  });

  it("⛔ acortada o renombrada a mano: CHOCA (no se recalcula lo que editó una persona)", () => {
    /* La edición que la pone en rojo: tratar una edición a mano como desfasada (las casillas no la
       explican: el CSE la hizo a propósito, y el recálculo la pisaría). */
    for (const [nombre, vivo] of [
      ["acortada", conFase("b", (f) => ({ ...f, durationWeeks: 1 }))],
      ["renombrada", conFase("b", (f) => ({ ...f, name: "Diseño técnico" }))],
    ] as const) {
      const plan = planDeAplicacion(vivo, BORRADOR);
      for (const k of ["tarea:b1:se-va", "tarea:b2:se-va", "t:b-1"]) {
        expect(estadoDe(plan, k).estado, `${nombre}: ${k}`).toBe("choque");
        expect(estadoDe(plan, k).recalcula).toBeUndefined();
      }
      expect(plan.desfasadas, nombre).toEqual([]);
    }
    // Con el cambio de semanas desmarcado pero la fase puesta a mano en 5: el cambio choca, y sus tareas también.
    const aMano = planDeAplicacion(conFase("c", (f) => ({ ...f, durationWeeks: 5 })), BORRADOR, ["fase:c:durationWeeks"]);
    expect(TAREAS_DE_C.map((k) => estadoDe(aMano, k).estado)).toEqual(["choque", "choque"]);
    expect(aMano.desfasadas).toEqual([]);
  });

  it("⭐ tareas de un recálculo (armadas para 3 semanas) con el cambio vuelto a marcar: desfasada otra vez", () => {
    /* D2: el recálculo REEMPLAZA las tareas; volver a marcar el cambio las deja armadas para la forma
       vieja y hay que recalcular de nuevo. La edición que la pone en rojo: aceptar una forma armada que
       solo explica lo vivo con el cambio marcado (se aplicarían tareas para 3 semanas en una de 4). */
    const recalculado = v1(BORRADOR.cambios, { tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 3 } } });
    const plan = planDeAplicacion(VIVO, recalculado);
    for (const k of TAREAS_DE_C) {
      expect(estadoDe(plan, k), k).toMatchObject({ estado: "excluido", recalcula: true });
      expect(estadoDe(plan, k).dependeDe, "no hay cambio excluido del que dependa").toBeUndefined();
    }
    expect(plan.desfasadas).toMatchObject([{ fase: "c", forma: { semanas: 4 }, armada: { semanas: 3 } }]);
    // Desmarcarlo otra vez: calzan y se aplican.
    const otraVez = planDeAplicacion(VIVO, recalculado, ["fase:c:durationWeeks"]);
    expect(TAREAS_DE_C.map((k) => estadoDe(otraVez, k).estado)).toEqual(["aplica", "aplica"]);
    expect(otraVez.desfasadas).toEqual([]);
  });

  describe("la Semana 0: la fase que pasa a ser primera", () => {
    const INICIO: CambioFaseNueva = {
      tipo: "fase-nueva",
      clave: "n:00000001",
      fase: { name: "Preparación", durationWeeks: 1, startWeek: null, sessionCount: null, notes: null, activityType: null },
      despuesDe: null,
    };
    const conSemanaCero = (primera: string, extra: Record<string, { nombre: string; semanas: number }> = {}) =>
      Object.fromEntries(
        Object.entries({ ...ARMADAS, ...extra }).map(([k, a]) => [k, { ...a, semanaCero: k === primera }]),
      ) as Borrador["tareasArmadasPara"];

    it("⭐ una fase nueva al principio, desmarcada: la que vuelve a ser primera queda desfasada (y con la nueva marcada, no)", () => {
      /* La propuesta suma una fase al principio y el CSE la quita: «Kick-off» vuelve a ser la primera y
         sus tareas se armaron sin las fijas del arranque. La edición que la pone en rojo: no comparar
         la Semana 0 (se aplicarían sin Kickoff ni Accesos), o recalcular la nueva que se va. */
      const b = v1([INICIO, nueva("t:a-1", "a", "Revisar el alcance", 0), nueva("t:0-1", INICIO.clave, "Kickoff", 0)], {
        tareasArmadasPara: conSemanaCero(INICIO.clave, { [INICIO.clave]: { nombre: "Preparación", semanas: 1 } }),
      });
      const sinLaNueva = planDeAplicacion(VIVO, b, [INICIO.clave]);
      expect(sinLaNueva.desfasadas).toMatchObject([{ fase: "a", forma: { semanaCero: true }, armada: { semanaCero: false } }]);
      expect(estadoDe(sinLaNueva, "t:a-1")).toMatchObject({ estado: "excluido", recalcula: true });
      expect(estadoDe(sinLaNueva, "t:0-1"), "la nueva que se va").toMatchObject({ estado: "excluido", dependeDe: INICIO.clave });
      const conLaNueva = planDeAplicacion(VIVO, b);
      expect(conLaNueva.desfasadas).toEqual([]);
      expect(["t:a-1", "t:0-1"].map((k) => estadoDe(conLaNueva, k).estado)).toEqual(["aplica", "aplica"]);
    });

    it("⭐ una fase nueva marcada cuya ancla (otra nueva) se desmarca: pasa a primera y queda desfasada", () => {
      const ACCESOS: CambioFaseNueva = { ...INICIO, clave: "n:00000002", fase: { ...INICIO.fase, name: "Accesos" }, despuesDe: INICIO.clave };
      const b = v1([INICIO, ACCESOS, nueva("t:acc-1", ACCESOS.clave, "Pedir los accesos", 0)], {
        tareasArmadasPara: conSemanaCero(INICIO.clave, {
          [INICIO.clave]: { nombre: "Preparación", semanas: 1 },
          [ACCESOS.clave]: { nombre: "Accesos", semanas: 1 },
        }),
      });
      expect(fasesDesfasadas(planDeAplicacion(VIVO, b, [INICIO.clave]))).toEqual([ACCESOS.clave]);
      expect(planDeAplicacion(VIVO, b).desfasadas).toEqual([]);
    });

    it("un cambio de orden desmarcado que devuelve otra fase al principio: desfasadas las dos que se mueven", () => {
      const ORDEN: CambioDeOrden = { tipo: "orden", clave: "orden", desde: ["a", "b", "c"], a: ["b", "a", "c"] };
      const b = v1([ORDEN, nueva("t:a-1", "a", "Revisar el alcance", 0), nueva("t:b-9", "b", "Diseñar", 0)], {
        tareasArmadasPara: conSemanaCero("b"),
      });
      expect(fasesDesfasadas(planDeAplicacion(VIVO, b, ["orden"]))).toEqual(["a", "b"]);
      expect(planDeAplicacion(VIVO, b).desfasadas).toEqual([]);
    });

    it("⛔ un reorden A MANO, sin ningún cambio que mueva la primera: choca", () => {
      /* La edición que la pone en rojo: aceptar la Semana 0 sin exigir un cambio de orden o una fase
         nueva que la explique (un reorden a mano se recalcularía encima). */
      const b = v1([nueva("t:a-1", "a", "Revisar el alcance", 0), nueva("t:b-9", "b", "Diseñar", 0)], {
        tareasArmadasPara: conSemanaCero("a"),
      });
      const reordenado: Vivo = { ...VIVO, fases: [VIVO.fases[1], VIVO.fases[0], VIVO.fases[2]] };
      const plan = planDeAplicacion(reordenado, b);
      expect(["t:a-1", "t:b-9"].map((k) => estadoDe(plan, k).estado)).toEqual(["choque", "choque"]);
      expect(plan.desfasadas).toEqual([]);
      expect(planDeAplicacion(VIVO, b).desfasadas, "sin reordenar, todo calza").toEqual([]);
    });
  });

  it("⭐ las sesiones: un cambio de sesiones desmarcado desfasa si la forma armada las trae; si no, no", () => {
    /* El agente lee «N sesiones». La edición que la pone en rojo: no comparar las sesiones (se
       aplicarían tareas armadas para 8 sesiones en una fase de ninguna), o compararlas en un borrador
       que no las guarda (uno de E2a quedaría desfasado sin razón). */
    const SES_C: CambioFaseCambia = { ...DUR_C, clave: "fase:c:sessionCount", campo: "sessionCount", desde: null, a: 8 };
    const cambios = [SES_C, seVa(C1, "c"), nueva("t:c-1", "c", "Pruebas de aceptación", 2)];
    const conSesiones = v1(cambios, { tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 3, sesiones: 8 } } });
    expect(planDeAplicacion(VIVO, conSesiones).desfasadas).toEqual([]);
    const plan = planDeAplicacion(VIVO, conSesiones, [SES_C.clave]);
    expect(plan.desfasadas).toMatchObject([{ fase: "c", forma: { sesiones: null }, armada: { sesiones: 8 } }]);
    const sinElCampo = v1(cambios, { tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 3 } } });
    expect(planDeAplicacion(VIVO, sinElCampo, [SES_C.clave]).desfasadas).toEqual([]);
    expect(estadoDe(planDeAplicacion(VIVO, sinElCampo, [SES_C.clave]), "t:c-1").estado).toBe("aplica");
    // Las sesiones cambiadas A MANO (sin el cambio): chocan.
    const aMano = planDeAplicacion(conFase("c", (f) => ({ ...f, sessionCount: 5 })), conSesiones, [SES_C.clave]);
    expect(estadoDe(aMano, "t:c-1").estado).toBe("choque");
  });
});

describe("4 · «Aplicar de todos modos»: `forzar`", () => {
  it("⭐ forzar la fase: sus tareas aplican tal cual, la fase pasa a `forzadas`, la huella cambia y quedan en la última semana", () => {
    /* La edición que la pone en rojo: ignorar `forzar` (el botón no haría nada), o forzar sin cambiar
       la huella (el servidor aplicaría otra lista que la que confirmó el CSE). */
    const sin = ["fase:c:durationWeeks"];
    const plan = planDeAplicacion(VIVO, BORRADOR, sin, { tareas: "listas", forzar: ["c"] });
    for (const k of TAREAS_DE_C) {
      expect(estadoDe(plan, k).estado, k).toBe("aplica");
      expect(estadoDe(plan, k).recalcula).toBeUndefined();
      expect(estadoDe(plan, k).dependeDe).toBeUndefined();
    }
    expect(plan.forzadas.map((f) => f.fase)).toEqual(["c"]);
    expect(plan.desfasadas).toEqual([]);
    expect(plan.huella).not.toBe(planDeAplicacion(VIVO, BORRADOR, sin, { tareas: "listas" }).huella);
    // La nueva, armada para la semana 4 de 4, cae en la última de las 3 que quedan.
    const r = resumir(VIVO, BORRADOR, sin, { tareas: "listas", forzar: ["c"] });
    const pruebas = r.proyeccion.fases.find((f) => f.id === "c")!;
    expect(pruebas.durationWeeks).toBe(3);
    expect(pruebas.tareas.map((t) => [t.clave, t.weekIndex])).toEqual([["t:c-1", 2]]);
    expect(r.forzadas.map((f) => f.fase)).toEqual(["c"]);
    // Una tarea desmarcada de la fase forzada sigue fuera.
    const conUnaFuera = planDeAplicacion(VIVO, BORRADOR, [...sin, "t:c-1"], { forzar: ["c"] });
    expect(TAREAS_DE_C.map((k) => estadoDe(conUnaFuera, k).estado)).toEqual(["aplica", "excluido"]);
  });

  it("forzar una fase que no está desfasada no hace nada (tampoco una que choca)", () => {
    const base = planDeAplicacion(VIVO, BORRADOR, [], { tareas: "listas" });
    const forzandoB = planDeAplicacion(VIVO, BORRADOR, [], { tareas: "listas", forzar: ["b", "zz"] });
    expect(forzandoB.huella).toBe(base.huella);
    expect(forzandoB.forzadas).toEqual([]);
    const aMano = conFase("c", (f) => ({ ...f, durationWeeks: 5 }));
    const choca = planDeAplicacion(aMano, BORRADOR, ["fase:c:durationWeeks"], { forzar: ["c"] });
    expect(TAREAS_DE_C.map((k) => estadoDe(choca, k).estado)).toEqual(["choque", "choque"]);
    expect(choca.forzadas).toEqual([]);
  });
});

describe("5 · la estructura supuesta con lo desmarcado, y la forma de una fase en ella", () => {
  it("⭐ con el cambio de semanas en `sin`, la fase queda con sus semanas vivas; sin `sin`, como antes", () => {
    /* La edición que la pone en rojo: ignorar `sin` (el recálculo armaría otra vez para 4 semanas). */
    const b = v1([DUR_C, PILOTO]);
    expect(estructuraHipotetica(VIVO, b, ["fase:c:durationWeeks"]).fases.find((f) => f.id === "c")!.durationWeeks).toBe(3);
    expect(estructuraHipotetica(VIVO, b).fases.find((f) => f.id === "c")!.durationWeeks).toBe(4);
    expect(estructuraHipotetica(VIVO, b, [PILOTO.clave]).fases.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("⭐ formaEnLaEstructura marca la primera (la de la Semana 0); mismaForma compara los cuatro campos", () => {
    const INICIO: CambioFaseNueva = { ...PILOTO, clave: "n:00000001", despuesDe: null, fase: { ...PILOTO.fase, name: "Preparación", sessionCount: 2 } };
    const e = estructuraHipotetica(VIVO, v1([INICIO, DUR_C]));
    expect(formaEnLaEstructura(e, INICIO.clave)).toEqual({ nombre: "Preparación", semanas: 2, sesiones: 2, semanaCero: true });
    expect(formaEnLaEstructura(e, "a")).toEqual({ nombre: "Kick-off", semanas: 1, sesiones: null, semanaCero: false });
    expect(formaEnLaEstructura(e, "zz")).toBeNull();
    const sinLaNueva = estructuraHipotetica(VIVO, v1([INICIO, DUR_C]), [INICIO.clave]);
    expect(formaEnLaEstructura(sinLaNueva, "a")?.semanaCero).toBe(true);

    const f = { nombre: "Pruebas", semanas: 3, sesiones: null, semanaCero: false };
    expect(mismaForma(f, { ...f, nombre: " pruebas " })).toBe(true);
    for (const otra of [{ nombre: "Pruebas finales" }, { semanas: 4 }, { sesiones: 2 }, { semanaCero: true }]) {
      expect(mismaForma(f, { ...f, ...otra }), JSON.stringify(otra)).toBe(false);
    }
    expect(mismaForma(f, null)).toBe(false);
    expect(mismaForma(null, null)).toBe(false);
  });
});

describe("6 · mezclarTareasDeFases: las recalculadas van EN EL LUGAR de las originales", () => {
  it("⭐ en el lugar de la primera original; las demás fases no se tocan; sin originales, al final", () => {
    /* El grupo de la fase conserva su número en la barra. La edición que la pone en rojo: agregarlas
       siempre al final (el grupo saltaría de lugar), o tocar las tareas de otra fase. */
    const recalculadas = [nueva("t:c-9", "c", "Pruebas cortas", 2), seVa(C1, "c")];
    const out = mezclarTareasDeFases(BORRADOR.cambios, recalculadas, new Set(["c"]));
    expect(out.map((c) => c.clave)).toEqual([
      "fase:c:durationWeeks",
      PILOTO.clave,
      "tarea:b1:se-va",
      "tarea:b2:se-va",
      "t:b-1",
      "t:c-9",
      "tarea:c1:se-va",
      "t:p-1",
      "t:p-2",
    ]);
    // Lo demás, intacto (el mismo objeto).
    for (const c of BORRADOR.cambios.filter((c) => !TAREAS_DE_C.includes(c.clave))) expect(out).toContain(c);
    // Los grupos siguen en el mismo orden.
    const grupos = (cambios: Cambio[]) => resumir(VIVO, v1(cambios)).grupos.map((g) => [g.numero, g.fase]);
    expect(grupos(out)).toEqual(grupos(BORRADOR.cambios));
    // Una fase sin originales: al final. Y una tarea de una fase fuera del alcance no entra.
    const sinOriginales = mezclarTareasDeFases(BORRADOR.cambios, [nueva("t:a-9", "a", "Revisar", 0), nueva("t:b-9", "b", "Otra", 0)], new Set(["a"]));
    expect(sinOriginales.map((c) => c.clave)).toEqual([...BORRADOR.cambios.map((c) => c.clave), "t:a-9"]);
    // Sin tareas nuevas para una fase del alcance: sus originales se van (ya calzaba, no hay nada que cambiar).
    expect(mezclarTareasDeFases(BORRADOR.cambios, [], new Set(["c"])).map((c) => c.clave)).not.toContain("t:c-1");
  });
});

describe("7 · fusionarRecalculo: solo cambian las fases escritas", () => {
  const RECALCULO = {
    corrida: "run-9",
    fases: [
      { id: "c", nombre: "Pruebas" },
      { id: "b", nombre: "Diseño" },
    ],
    sin: ["fase:c:durationWeeks"],
  };
  const B = v1(BORRADOR.cambios, { recalculo: RECALCULO, observaciones: ["Ya estaba."], soloFase: "c" });
  const nuevasDeC = [nueva("t:c-9", "c", "Pruebas cortas", 2), seVa(C1, "c")];

  it("⭐ conserva la estructura, las tareas de otras fases, `tareas`, `soloFase` y `pedido`; la versión sube", () => {
    /* La edición que la pone en rojo: tocar `tareas` (un fallo se leería como «faltan todas» y
       «Volver a intentar» armaría todas las fases), o reemplazar las tareas de una fase que no se
       escribió (se perderían las de «Diseño», que falló y conserva las suyas). */
    const out = fusionarRecalculo(B, {
      tareas: [...nuevasDeC, nueva("t:b-9", "b", "No va", 0)],
      armadas: { c: { nombre: "Pruebas", semanas: 3, sesiones: null, semanaCero: false }, b: { nombre: "Diseño", semanas: 5 } },
      escritas: ["c"],
      fallidas: [{ id: "b", nombre: "Diseño" }],
      motivo: "la respuesta de la IA quedó cortada",
      observaciones: ["Ya estaba.", "Pruebas quedó en 3 semanas."],
    });
    expect(out.version).toBe(B.version + 1);
    expect(out.cambios.filter((c) => c.tipo === "fase-cambia" || c.tipo === "fase-nueva")).toEqual([DUR_C, PILOTO]);
    const deLaFase = (cambios: readonly Cambio[], f: string) =>
      cambios.filter((c) => (c.tipo === "tarea-nueva" ? c.fase : c.tipo === "tarea-se-va" ? c.faseId : null) === f);
    expect(deLaFase(out.cambios, "b"), "se tocaron las tareas de «Diseño», que falló").toEqual(deLaFase(BORRADOR.cambios, "b"));
    expect(deLaFase(out.cambios, PILOTO.clave)).toEqual(deLaFase(BORRADOR.cambios, PILOTO.clave));
    expect(out.cambios.map((c) => c.clave)).toContain("t:c-9");
    expect(out.cambios.map((c) => c.clave)).not.toContain("t:c-1");
    expect([out.tareas, out.pedido, out.origen, out.soloFase]).toEqual([B.tareas, B.pedido, B.origen, "c"]);
    expect(out.tareasArmadasPara).toEqual({ ...ARMADAS, c: { nombre: "Pruebas", semanas: 3, sesiones: null, semanaCero: false } });
    expect(out.recalculo).toEqual({ ...RECALCULO, fases: [{ id: "b", nombre: "Diseño" }], motivo: "la respuesta de la IA quedó cortada" });
    expect(out.observaciones).toEqual(["Ya estaba.", "Pruebas quedó en 3 semanas."]);
    // Se guarda y se lee igual.
    expect(ida(out)).toEqual(out);
    // El original no se tocó.
    expect(B.cambios).toEqual(BORRADOR.cambios);
  });

  it("⭐ sin fallidas, el recálculo termina: `recalculo` queda ausente", () => {
    const out = fusionarRecalculo(B, {
      tareas: nuevasDeC,
      armadas: { c: { nombre: "Pruebas", semanas: 3 } },
      escritas: ["c", "b"],
      fallidas: [],
      motivo: null,
      observaciones: [],
    });
    expect("recalculo" in out).toBe(false);
    // «Diseño» se escribió sin tareas nuevas: sus originales se van (ya calzaba); su forma, igual que antes.
    expect(out.tareasArmadasPara.b).toEqual(ARMADAS.b);
  });
});

describe("8 · el aviso al terminar la corrida de un recálculo", () => {
  const cable = (corrida: string, estado: "armando" | "fallo", motivo: string | null = null): RecalculoEnElCable => ({
    estado,
    corrida,
    fases: ["c"],
    nombres: ["Pruebas"],
    fase: null,
    motivo,
  });
  // Las tareas del borrador siguen «listas» con la corrida original mientras se recalcula.
  const lectura = (recalculo: RecalculoEnElCable | null, hayPropuesta = true) => ({
    hayPropuesta,
    tareas: { corrida: "run-2", estado: "listas" as const, motivo: null },
    recalculo,
  });
  const seguir = (estado: "DONE" | "ERROR" | "TIMEOUT", l: ReturnType<typeof lectura>) =>
    desenlaceDelSeguimiento({ corrida: "r9", estado, lectura: l, recalculo: ["Pruebas"] });

  it("⭐ armando → sigue; falló → error con los nombres y el motivo; otra corrida → calla", () => {
    expect(seguir("TIMEOUT", lectura(cable("r9", "armando")))).toEqual({ que: "seguir" });
    expect(seguir("DONE", lectura(cable("r9", "fallo", "la IA no devolvió sus tareas.")))).toEqual({
      que: "avisar",
      ok: false,
      tono: "error",
      texto: "No se pudieron recalcular las tareas de «Pruebas»: la IA no devolvió sus tareas.",
    });
    expect(seguir("DONE", lectura(cable("r10", "armando")))).toEqual({ que: "callar" });
  });

  it("⭐ terminó y ya no hay recálculo: con la propuesta y DONE avisa que llegaron; si no, calla", () => {
    /* La edición que la pone en rojo: no tener la rama del recálculo — las tareas del borrador son de
       otra corrida y caía en «otra propuesta → callar»: el recálculo terminaba mudo. */
    expect(seguir("DONE", lectura(null))).toEqual({
      que: "avisar",
      ok: true,
      tono: "exito",
      texto: "Listas las tareas recalculadas de «Pruebas».",
    });
    expect(seguir("DONE", lectura(null, false)), "se descartó").toEqual({ que: "callar" });
    expect(seguir("ERROR", lectura(null))).toEqual({ que: "callar" });
    // Un GET fallido no dice nada: se sigue.
    expect(desenlaceDelSeguimiento({ corrida: "r9", estado: "DONE", lectura: null, recalculo: ["Pruebas"] })).toEqual({ que: "seguir" });
    // Sin `recalculo` en la entrada, lo de siempre (las tareas son de otra corrida: calla).
    expect(desenlaceDelSeguimiento({ corrida: "r9", estado: "DONE", lectura: lectura(null) })).toEqual({ que: "callar" });
  });
});

describe("9 · la espera antes de lanzar el recálculo", () => {
  /* ⚠ REESCRITAS en la revisión de E2c (2026-09-25), con esta razón: lo lanzado se recuerda POR FASE (la
     última forma de cada una), no como el texto del conjunto entero. Con el conjunto, «Pruebas|Diseño»
     que fallaron juntas y después solo «Diseño» (desmarcaste las tareas de «Pruebas») daba una clave
     «nueva» y se volvía a pagar la forma que acababa de fallar. Las funciones reciben las formas
     (`formasDeDesfasadas`) y lo lanzado; `alVencer` también decide si es a mano, si hay un pedido en vuelo
     y si esperar sirve, y devuelve si el lanzamiento es automático. */
  const formas = (...pares: Array<[string, string]>) => new Map(pares);
  const NADA = formas();

  it("⭐ trasLaMarca: arranca con algo nuevo que recalcular, vuelve a empezar si ya esperaba, y nada sin permiso ni sin clave", () => {
    /* La edición que la pone en rojo: arrancar la espera con la misma clave sin estar esperando (una
       casilla que no cambia nada lanzaría otra corrida pagada), o sin permiso. */
    expect(ESPERA_DEL_RECALCULO_MS).toBe(4000);
    const i = { antes: "", formas: formas(["c", "f3"]), lanzadas: NADA, esperando: false, puedePedir: true };
    expect(trasLaMarca(i)).toBe(true);
    expect(trasLaMarca({ ...i, antes: "c:f3", formas: formas(["c", "f3"], ["b", "f2"]) })).toBe(true);
    expect(trasLaMarca({ ...i, antes: "c:f3" })).toBe(false);
    expect(trasLaMarca({ ...i, antes: "c:f3", esperando: true }), "la espera cuenta desde la última casilla").toBe(true);
    expect(trasLaMarca({ ...i, antes: "c:f3", formas: NADA, esperando: true })).toBe(false);
    expect(trasLaMarca({ ...i, puedePedir: false })).toBe(false);
  });

  it("⭐ trasLaMarca: lo que ya se lanzó no arranca la espera (tras un fallo, marcar y desmarcar el mismo cambio)", () => {
    /* Revisión de E2c: la línea decía «Recalculando…» 4 s y al vencer no se lanzaba nada (la misma forma).
       La edición que la pone en rojo: arrancar la espera sin mirar lo lanzado. */
    const i = { antes: "", formas: formas(["c", "f3"]), lanzadas: formas(["c", "f3"]), esperando: false, puedePedir: true };
    expect(trasLaMarca(i), "arranca con una forma que ya se lanzó").toBe(false);
    expect(trasLaMarca({ ...i, lanzadas: formas(["c", "f4"]) }), "otra forma de la misma fase es nueva").toBe(true);
    expect(trasLaMarca({ ...i, formas: formas(["c", "f3"], ["b", "f2"]) }), "una fase nueva junto a una lanzada").toBe(true);
  });

  it("⭐ alVencer: los casos, y la misma forma no se relanza sola", () => {
    /* La edición que la pone en rojo: relanzar la misma forma tras un fallo (pagaría en bucle), lanzar sin
       poder (con otra corrida, aplicando o guardando), o que el botón no pueda relanzar. */
    const i = { formas: formas(["c", "f3"]), lanzadas: NADA, aMano: false, enVuelo: false, puedePedir: true, puedeLanzar: true, puedeEsperar: true };
    expect(alVencer({ ...i, puedePedir: false })).toEqual({ que: "nada" });
    expect(alVencer({ ...i, formas: NADA })).toEqual({ que: "nada" });
    expect(alVencer({ ...i, lanzadas: formas(["c", "f3"]) }), "la misma forma se relanzó sola").toEqual({ que: "nada" });
    expect(alVencer({ ...i, puedeLanzar: false })).toEqual({ que: "esperar" });
    expect(alVencer({ ...i, enVuelo: true }), "dos pedidos a la vez").toEqual({ que: "esperar" });
    expect(alVencer(i)).toEqual({ que: "lanzar", automatico: true });
    expect(alVencer({ ...i, lanzadas: formas(["c", "f4"]) })).toEqual({ que: "lanzar", automatico: true });
    // «Volver a intentar»: a mano sí relanza la misma forma, y no es automático (avisa sus errores).
    expect(alVencer({ ...i, lanzadas: formas(["c", "f3"]), aMano: true }), "el botón no relanza").toEqual({ que: "lanzar", automatico: false });
    expect(alVencer({ ...i, aMano: true, puedePedir: false })).toEqual({ que: "nada" });
  });

  it("⭐ alVencer: con «P|Q» ya lanzadas (y fallidas), solo «Q» da «nada»; con una fase nueva, lanza", () => {
    /* Revisión de E2c (hallazgo de costo): «Pruebas» y «Diseño» fallaron juntas; desmarcas las tareas de
       «Pruebas» y queda solo «Diseño». Con la clave del conjunto era «nueva» y a los 4 s salía sola otra
       corrida pagada para la forma que acababa de fallar. La edición que la pone en rojo: volver a comparar
       el conjunto entero contra lo último lanzado. */
    const lanzadas = formas(["p", "f6"], ["q", "f2"]);
    const i = { lanzadas, aMano: false, enVuelo: false, puedePedir: true, puedeLanzar: true, puedeEsperar: true };
    expect(hayFormasSinLanzar(formas(["q", "f2"]), lanzadas)).toBe(false);
    expect(alVencer({ ...i, formas: formas(["q", "f2"]) }), "se relanzó sola una forma que ya falló").toEqual({ que: "nada" });
    expect(alVencer({ ...i, formas: formas(["q", "f2"], ["r", "f1"]) })).toEqual({ que: "lanzar", automatico: true });
    // Las formas salen de las desfasadas, fase por fase, con la misma identidad que la clave.
    const d: FaseDesfasada = {
      fase: "c",
      nombre: "Pruebas",
      forma: { nombre: " Pruebas ", semanas: 3, sesiones: null, semanaCero: false },
      armada: { nombre: "Pruebas", semanas: 4 },
    };
    expect([...formasDeDesfasadas([d])]).toEqual([["c", "pruebas:3::0"]]);
  });

  it("⭐ alVencer: si no se puede lanzar y esperar no sirve (sin tareas en pantalla), corta en vez de esperar para siempre", () => {
    /* Revisión de E2c: con la propuesta resuelta en otra pestaña (el GET sin tareas), la vuelta «esperar»
       no terminaba nunca y la línea decía «Recalculando…» sin que corriera nada. La edición que la pone en
       rojo: esperar sin mirar `puedeEsperar`. */
    const i = { formas: formas(["c", "f3"]), lanzadas: NADA, aMano: false, enVuelo: false, puedePedir: true, puedeLanzar: false, puedeEsperar: false };
    expect(alVencer(i)).toEqual({ que: "nada" });
    expect(alVencer({ ...i, aMano: true })).toEqual({ que: "nada" });
    // Con un pedido en vuelo sí se espera: termina solo.
    expect(alVencer({ ...i, enVuelo: true })).toEqual({ que: "esperar" });
  });

  it("⭐ puedeLanzarElRecalculo: cada freno apaga el lanzamiento; esperar sirve solo con tareas en pantalla", () => {
    /* Revisión de E2c: la guarda del Canvas fijaba solo el final de la condición. Las ediciones que la
       ponen en rojo: quitar un freno (lanzaría con otro pedido, aplicando o descartando: el servidor
       rechaza o la corrida queda sin dueño) o esperar sin tareas. */
    const listas = { estado: "listas" as const, recalculo: null };
    const i = { puedeEditar: true, hayBorrador: true, armando: false, aplicando: false, descartando: false, tareas: listas };
    expect(puedeLanzarElRecalculo(i)).toEqual({ puedeLanzar: true, puedeEsperar: true });
    const corriendo: RecalculoEnElCable = { estado: "armando", corrida: "r", fases: [], nombres: [], fase: null, motivo: null };
    const frenos: Array<[string, Partial<Parameters<typeof puedeLanzarElRecalculo>[0]>]> = [
      ["sin permiso", { puedeEditar: false }],
      ["sin propuesta", { hayBorrador: false }],
      // Se retiró «Pedir cambio con IA» (E4): sin su vista previa, su freno salió de la función y de esta tabla.
      ["pidiendo otra propuesta", { armando: true }],
      ["aplicando", { aplicando: true }],
      ["descartando", { descartando: true }],
      ["las tareas armándose", { tareas: { estado: "armando", recalculo: null } }],
      ["otro recálculo corriendo", { tareas: { estado: "listas", recalculo: corriendo } }],
    ];
    for (const [freno, cambio] of frenos) {
      expect(puedeLanzarElRecalculo({ ...i, ...cambio }), freno).toEqual({ puedeLanzar: false, puedeEsperar: true });
    }
    expect(puedeLanzarElRecalculo({ ...i, tareas: null })).toEqual({ puedeLanzar: false, puedeEsperar: false });
  });

  it("claveDeDesfasadas: la fase con su forma, sin importar el orden; vacía sin ninguna", () => {
    const d = (fase: string, forma: Partial<FaseDesfasada["forma"]> = {}): FaseDesfasada => ({
      fase,
      nombre: "X",
      forma: { nombre: " Pruebas ", semanas: 3, sesiones: null, semanaCero: false, ...forma },
      armada: { nombre: "Pruebas", semanas: 4 },
    });
    expect(claveDeDesfasadas([])).toBe("");
    expect(claveDeDesfasadas([d("c")])).toBe("c:pruebas:3::0");
    expect(claveDeDesfasadas([d("c"), d("b", { sesiones: 2, semanaCero: true })])).toBe("b:pruebas:3:2:1|c:pruebas:3::0");
    expect(claveDeDesfasadas([d("b"), d("c")])).toBe(claveDeDesfasadas([d("c"), d("b")]));
    expect(claveDeDesfasadas([d("c", { semanas: 4 })])).not.toBe(claveDeDesfasadas([d("c")]));
  });
});

describe("10 · lo que se ve: la línea, el grupo, los textos y el resumen", () => {
  const desf = (fase: string, nombre: string, armada = 4, forma = 3): FaseDesfasada => ({
    fase,
    nombre,
    forma: { nombre, semanas: forma, sesiones: null, semanaCero: false },
    armada: { nombre, semanas: armada },
  });
  const D = [desf("c", "Pruebas"), desf("b", "Diseño")];
  const servidor = (estado: "armando" | "fallo", fases: string[], motivo: string | null = null): RecalculoEnElCable => ({
    estado,
    corrida: "r9",
    fases,
    nombres: fases,
    fase: null,
    motivo,
  });

  it("⭐ recalculoEnPantalla: armando (con las que siguen después) → esperando → fallo solo si cubre todas → pendiente", () => {
    /* La edición que la pone en rojo: mostrar «fallo» (con «Aplicar de todos modos») cuando falló solo
       una parte de las desfasadas: forzaría también las que nunca se pidieron. */
    const en = (i: Partial<Parameters<typeof recalculoEnPantalla>[0]>) =>
      recalculoEnPantalla({ desfasadas: D, esperando: false, servidor: null, faseDeLaCorrida: null, ...i });
    expect(en({ servidor: servidor("armando", ["c"]), esperando: true, faseDeLaCorrida: "Leyendo las reuniones" })).toEqual({
      que: "armando",
      fases: [{ id: "c", nombre: "Pruebas" }],
      despues: [{ id: "b", nombre: "Diseño" }],
      fase: "Leyendo las reuniones",
      motivo: null,
    });
    expect(en({ esperando: true, servidor: servidor("fallo", ["c", "b"]) })?.que).toBe("esperando");
    expect(en({ servidor: servidor("fallo", ["c", "b"], "se cortó") })).toMatchObject({ que: "fallo", motivo: "se cortó" });
    expect(en({ servidor: servidor("fallo", ["c"]) })?.que, "falló solo una parte").toBe("pendiente");
    expect(en({})?.que).toBe("pendiente");
    /* Revisión de E2c: «después, «Diseño»» solo con una espera viva, que es la que la lanza al terminar. Sin
       ella (recargaste a mitad de camino, o no puedes pedir) nadie la lanza: no se promete. La edición que
       la pone en rojo: armar `despues` sin mirar la espera. */
    expect(en({ servidor: servidor("armando", ["c"]) })).toEqual({
      que: "armando",
      fases: [{ id: "c", nombre: "Pruebas" }],
      despues: [],
      fase: null,
      motivo: null,
    });
    expect(recalculoEnPantalla({ desfasadas: [], esperando: true, servidor: servidor("armando", ["c"]), faseDeLaCorrida: null })).toBeNull();
  });

  it("⭐ textoDelRecalculo en los cuatro estados, con y sin permiso", () => {
    /* La edición que la pone en rojo: ofrecer botones sin permiso, o no decirle la salida que sí tiene
       (desmarcar las tareas). */
    const e = (que: RecalculoEnPantalla["que"], o: Partial<RecalculoEnPantalla> = {}): RecalculoEnPantalla => ({
      que,
      fases: [{ id: "c", nombre: "Pruebas" }],
      despues: [],
      fase: null,
      motivo: null,
      ...o,
    });
    const con = { puedePedir: true };
    const sin = { puedePedir: false };
    expect(textoDelRecalculo(e("esperando"), con)).toEqual({
      texto: "Recalculando las tareas de «Pruebas»… · alrededor de un minuto",
      accion: null,
      secundaria: null,
      enCurso: true,
    });
    expect(textoDelRecalculo(e("armando", { fase: "Leyendo las reuniones" }), sin).texto).toBe(
      "Recalculando las tareas de «Pruebas»… · Leyendo las reuniones",
    );
    expect(textoDelRecalculo(e("armando", { despues: [{ id: "b", nombre: "Diseño" }] }), con).texto).toBe(
      "Recalculando las tareas de «Pruebas»… · después, «Diseño»",
    );
    expect(textoDelRecalculo(e("armando", { fases: [], despues: [{ id: "b", nombre: "Diseño" }] }), con)).toEqual({
      texto: "Recalculando otras tareas… · después, «Diseño»",
      accion: null,
      secundaria: null,
      enCurso: true,
    });
    expect(textoDelRecalculo(e("pendiente"), con)).toEqual({
      texto: "Las tareas de «Pruebas» no calzan con lo que marcaste.",
      accion: ACCION_RECALCULAR,
      secundaria: null,
      enCurso: false,
    });
    expect(textoDelRecalculo(e("pendiente"), sin)).toEqual({
      texto: "Las tareas de «Pruebas» no calzan con lo que marcaste. Desmárcalas para aplicar sin ellas.",
      accion: null,
      secundaria: null,
      enCurso: false,
    });
    expect(textoDelRecalculo(e("fallo", { motivo: "la IA no devolvió sus tareas" }), con)).toEqual({
      texto: "No se pudieron recalcular las tareas de «Pruebas»: la IA no devolvió sus tareas.",
      accion: "Volver a intentar",
      secundaria: ACCION_APLICAR_DE_TODOS_MODOS,
      enCurso: false,
    });
    expect(textoDelRecalculo(e("fallo"), sin)).toEqual({
      texto: "No se pudieron recalcular las tareas de «Pruebas». Desmárcalas para aplicar sin ellas.",
      accion: null,
      secundaria: null,
      enCurso: false,
    });
  });

  it("textoDelGrupoDesfasado, fase por fase; con una sola desfasada, nada (lo dice la línea)", () => {
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: recibe cuántas fases desfasadas hay.
       Con una sola, la línea y el grupo decían lo mismo con dos spinners. La edición que la pone en rojo:
       volver a repetir en el grupo lo que ya dice la línea. */
    const r = (que: RecalculoEnPantalla["que"]): RecalculoEnPantalla => ({
      que,
      fases: [{ id: "c", nombre: "Pruebas" }],
      despues: [{ id: "b", nombre: "Diseño" }],
      fase: null,
      motivo: null,
    });
    expect(textoDelGrupoDesfasado("c", r("esperando"), 2)).toEqual({ texto: "recalculando…", enCurso: true });
    expect(textoDelGrupoDesfasado("c", r("armando"), 2)).toEqual({ texto: "recalculando…", enCurso: true });
    expect(textoDelGrupoDesfasado("c", r("fallo"), 2)).toEqual({ texto: "no se pudieron recalcular", enCurso: false });
    expect(textoDelGrupoDesfasado("b", r("armando"), 2)).toEqual({ texto: "sigue después", enCurso: false });
    expect(textoDelGrupoDesfasado("c", r("pendiente"), 2)).toEqual({ texto: "falta recalcularlas", enCurso: false });
    expect(textoDelGrupoDesfasado("a", r("armando"), 2)).toEqual({ texto: "falta recalcularlas", enCurso: false });
    expect(textoDelGrupoDesfasado("c", null, 2)).toEqual({ texto: "falta recalcularlas", enCurso: false });
    for (const que of ["esperando", "armando", "fallo", "pendiente"] as const) {
      expect(textoDelGrupoDesfasado("c", r(que), 1), `${que}: el grupo repite la línea`).toBeNull();
    }
    // Sin línea a la vista, el grupo lo dice aunque sea una sola.
    expect(textoDelGrupoDesfasado("c", null, 1)).toEqual({ texto: "falta recalcularlas", enCurso: false });
  });

  it("⭐ los textos del núcleo: nombres con 1, 2 y 3; el bloqueo, el 409 viejo, el fallo y el aviso", () => {
    expect(nombresEnTexto(["Pruebas"])).toBe("«Pruebas»");
    expect(nombresEnTexto(["Pruebas", "Diseño"])).toBe("«Pruebas» y «Diseño»");
    expect(nombresEnTexto(["Pruebas", "Diseño", "Piloto"])).toBe("«Pruebas» y 2 fases más");
    expect(nombresEnTexto([])).toBe("una fase");
    expect(bloqueoPorDesfasadas(["Pruebas"])).toBe(
      "Las tareas de «Pruebas» no calzan con lo que marcaste: recalcúlalas o desmárcalas para aplicar sin ellas.",
    );
    expect(mensajeDeRecalculoAlAplicar(["Pruebas", "Diseño"])).toBe(
      "Las tareas de «Pruebas» y «Diseño» no calzan con lo que marcaste: recarga la página para recalcularlas o desmarcarlas.",
    );
    expect(textoDelFalloDelRecalculo(["Pruebas"], null)).toBe("No se pudieron recalcular las tareas de «Pruebas».");
    expect(textoDelFalloDelRecalculo(["Pruebas"], " se cortó. ")).toBe("No se pudieron recalcular las tareas de «Pruebas»: se cortó.");
    expect(avisoDeTareasRecalculadas(["Pruebas"])).toBe("Listas las tareas recalculadas de «Pruebas».");
  });

  it("textoDeAplicarDeTodosModos: un renglón por fase, con la semana donde caen", () => {
    expect(textoDeAplicarDeTodosModos([desf("c", "Pruebas", 6, 4), desf("b", "Diseño", 2, 3)])).toEqual([
      "Las tareas de «Pruebas» se armaron para 6 semanas: las que caían después pasan a la semana 4.",
      "Las tareas de «Diseño» se armaron para otra versión de la fase: revísalas después de aplicar.",
    ]);
    expect(textoDeAplicarDeTodosModos([])).toEqual([]);
  });

  it("leerRecalculoDelCable: lo válido tal cual; lo que no, null", () => {
    const bien = { estado: "fallo", corrida: "r9", fases: ["c"], nombres: ["Pruebas"], fase: null, motivo: "se cortó" };
    expect(leerRecalculoDelCable(bien)).toEqual(bien);
    for (const malo of [null, [], "r9", { ...bien, estado: "listas" }, { ...bien, corrida: "" }, { ...bien, fases: ["c", "b"] }, { ...bien, nombres: [3] }, { ...bien, fase: 1 }, { ...bien, motivo: undefined }]) {
      expect(leerRecalculoDelCable(malo), JSON.stringify(malo)).toBeNull();
    }
  });

  it("⭐ resumir: `enEspera` en las tareas que no desmarcaste, `desfasada` en el grupo y el nombre que queda", () => {
    /* La edición que la pone en rojo: pintar `enEspera` en una tarea que el CSE desmarcó, o nombrar el
       grupo con el nombre para el que se armaron sus tareas cuando ese cambio de nombre se desmarcó. */
    const r = resumir(VIVO, BORRADOR, ["fase:c:durationWeeks", "t:c-1"], { tareas: "listas" });
    const c = r.grupos.find((g) => g.fase === "c")!;
    expect(c.desfasada).toBe(true);
    expect(c.tareas.map((t) => [t.clave, t.enEspera ?? false])).toEqual([
      ["tarea:c1:se-va", true],
      ["t:c-1", false],
    ]);
    expect(r.grupos.filter((g) => g.fase !== "c").every((g) => !g.desfasada && g.tareas.every((t) => !t.enEspera))).toBe(true);
    expect(r.desfasadas.map((d) => d.fase)).toEqual(["c"]);
    // ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: la de «2 · P3»: con una desfasada, aplicar espera.
    expect([r.forzadas, r.bloqueoPorDesfasadas]).toEqual([[], true]);

    const NOMBRE_C: CambioFaseCambia = { ...DUR_C, clave: "fase:c:name", campo: "name", desde: "Pruebas", a: "Pruebas finales" };
    const b = v1([NOMBRE_C, seVa(C1, "c"), nueva("t:c-1", "c", "Pruebas de aceptación", 2)], {
      tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas finales", semanas: 3 } },
    });
    expect(resumir(VIVO, b, [NOMBRE_C.clave]).grupos[0]).toMatchObject({ fase: "c", nombre: "Pruebas", desfasada: true });
    expect(resumir(VIVO, b).grupos[0]).toMatchObject({ fase: "c", nombre: "Pruebas finales", desfasada: false });
  });

  it("⭐ las tareas en espera no cuentan todavía: el botón no dice «N de M» y «Ver la propuesta» marca la fase", () => {
    /* Revisión de E2c: se ven marcadas, pero su estado es «excluido» hasta que lleguen las recalculadas. El
       botón decía «Aplicar 0 de 10» y «Ver la propuesta» mostraba «Pruebas» sin sus tareas: parecía que el
       CSE las había quitado. Las ediciones que la ponen en rojo: volver a contarlas en el botón mientras
       esperan, o no marcar la fase en la vista. */
    const sin = ["fase:c:durationWeeks"];
    const r = resumir(VIVO, BORRADOR, sin, { tareas: "listas" });
    expect(r.desfasadas.map((d) => d.fase)).toEqual(["c"]);
    expect(r.marcadas, "el caso ya no tiene tareas en espera fuera de la cuenta").toBeLessThan(r.aplicables);
    expect(textoDelBotonDeAplicar(r), "el botón cuenta como quitadas las que esperan").toBe("Aplicar");
    const pruebas = r.proyeccion.fases.find((f) => f.id === "c")!;
    expect(pruebas.marca?.etiquetas ?? [], "la fase se ve sin sus tareas y sin decir por qué").toContain(ETIQUETA_POR_RECALCULAR);
    expect(ETIQUETA_POR_RECALCULAR).toBe("tareas por recalcular");
    // Las demás fases, no.
    expect(r.proyeccion.fases.filter((f) => f.id !== "c").every((f) => !f.marca?.etiquetas.includes(ETIQUETA_POR_RECALCULAR))).toBe(true);
    // Forzada, cuenta como siempre y la vista la muestra con sus tareas.
    const forzada = resumir(VIVO, BORRADOR, sin, { tareas: "listas", forzar: ["c"] });
    expect(textoDelBotonDeAplicar(forzada)).toBe(`Aplicar ${forzada.marcadas} de ${forzada.aplicables}`);
    expect(forzada.proyeccion.fases.find((f) => f.id === "c")!.marca?.etiquetas ?? []).not.toContain(ETIQUETA_POR_RECALCULAR);
    // Sin desfasadas, el texto de siempre.
    const todo = resumir(VIVO, BORRADOR, [], { tareas: "listas" });
    expect(textoDelBotonDeAplicar(todo)).toBe("Aplicar todo");
  });

  it("⭐ corridasDeLaPropuesta: la del armado y la del recálculo (las dos se dan por avisadas al descartar)", () => {
    /* Revisión de E2c: descartar mientras recalculaba daba por avisada solo la del armado; si en ese minuto
       entraba otra propuesta, la del recálculo avisaba «Listas las tareas recalculadas…» sobre la otra. La
       edición que la pone en rojo: dejar afuera la corrida del recálculo. */
    const recalculo: RecalculoEnElCable = { estado: "armando", corrida: "run-r", fases: ["c"], nombres: ["Pruebas"], fase: null, motivo: null };
    expect(corridasDeLaPropuesta({ corrida: "run-2", recalculo })).toEqual(["run-2", "run-r"]);
    expect(corridasDeLaPropuesta({ corrida: null, recalculo })).toEqual(["run-r"]);
    expect(corridasDeLaPropuesta({ corrida: "run-2", recalculo: null })).toEqual(["run-2"]);
    expect(corridasDeLaPropuesta({ corrida: "run-2" })).toEqual(["run-2"]);
    expect(corridasDeLaPropuesta(null)).toEqual([]);
  });

  it("⭐ tareasDelGet: el recálculo del GET llega a la pantalla (también el de un GET sin él)", () => {
    /* Revisión de E2c (hallazgo «alta» de guardas): con `recalculo: null` al leer el GET, la línea nunca
       decía «Recalculando…» ni «No se pudieron recalcular», «Aplicar de todos modos» no aparecía y la
       corrida del recálculo no se seguía; ninguna guarda caía. La edición que la pone en rojo: no leer el
       recálculo, o leerlo sin validar. */
    const recalculo = { estado: "fallo", corrida: "run-r", fases: ["c"], nombres: ["Pruebas"], fase: null, motivo: "se cortó" };
    const guardado = JSON.parse(JSON.stringify(BORRADOR));
    const data = {
      tareasDelBorrador: { estado: "listas", fase: null, motivo: null, recalculo },
      pendingProposal: guardado,
      pendingProposalRunId: "tok-1",
    };
    expect(tareasDelGet(data)).toEqual({ estado: "listas", fase: null, motivo: null, token: "tok-1", corrida: "run-2", recalculo });
    expect(tareasDelGet({ ...data, tareasDelBorrador: { estado: "armando", fase: "Leyendo", motivo: null } })).toEqual({
      estado: "armando",
      fase: "Leyendo",
      motivo: null,
      token: "tok-1",
      corrida: "run-2",
      recalculo: null,
    });
    expect(tareasDelGet({ ...data, tareasDelBorrador: { ...data.tareasDelBorrador, recalculo: { ...recalculo, estado: "listas" } } })?.recalculo).toBeNull();
    expect(tareasDelGet({ ...data, tareasDelBorrador: { estado: "otra" } })).toBeNull();
    expect(tareasDelGet({})).toBeNull();
  });
});
