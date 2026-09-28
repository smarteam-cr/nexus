/**
 * lib/timeline/tareas-del-detalle.test.ts — el paso 2 de «Regenerar todo» convertido en cambios del
 * borrador (E2a, P1). Puro: sin base, sin modelo.
 *
 * Correr: `npx vitest run lib/timeline/tareas-del-detalle.test.ts --project unit`.
 *
 * Lo que cuida (las reglas R1-R11 de lib/timeline/tareas-del-detalle.ts): qué se va y qué es nuevo,
 * que nada con avance ni escrito a mano se vaya, que las tareas se armen sobre la estructura que VIO
 * el agente (no la de ahora), las fijas de la Semana 0 sin vaivén, los pares idénticos, el tipo de
 * actividad solo-si-null, la salida cortada, y la fusión en el borrador. Desde E2b: el `desde` es lo
 * que VIO el agente (D10) y el alcance de «Regenerar» de una fase (`soloFases`). Desde L5: la fase
 * terminada no se toca en «Regenerar todo» (R12) y la tarea que vuelve no sale como «se va + nueva» (R4c),
 * medido sobre la propuesta grande anonimizada (__fixtures__/propuesta-grande.json).
 * Desde M2 (2026-09-27, bloque 9): con `hitos`, un kickoff por proyecto, el cierre y la entrega sin duplicados
 * nuevos (R15) y la IA que no repite lo que se queda (R14). Sin `hitos`, los bloques 1-8 quedan como estaban.
 * Desde M3 (2026-09-27, bloque 10): con `pasado`, lo que ya pasó no se reescribe (R13). Sin `pasado`, todo igual.
 * Desde M4 P4c (2026-09-27, bloque 11): lo que el sistema corrió desde hoy (las movidas) no lo reescribe la IA.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import {
  borradorDelFixture,
  FASE_TERMINADA,
  leerFixtureGrande,
  vivoDelFixture,
} from "./__fixtures__/propuesta-grande";
import {
  borradorVacio,
  claveDeCampo,
  claveDeTareaQueCambia,
  estructuraHipotetica,
  faseDeLaTarea,
  FORMATO_BORRADOR,
  fotoDeTarea,
  leerBorrador,
  planDeAplicacion,
  proyectar,
  resumir,
  type Borrador,
  type Cambio,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { MOTIVO_DEL_KICKOFF_QUE_FALTA, OBSERVACION_SIN_KICKOFF, TAREA_DE_KICKOFF } from "./hitos";
import { POLITICA_DE_ATRASOS } from "./politica-de-atrasos";
import { conLaReprogramacion, reprogramarDesdeHoy } from "./reprogramar-desde-hoy";
import {
  activityTypePropuesto,
  cambiosDeTareasDelDetalle,
  DETAIL_ACTIVITY_TYPES,
  fusionarDetalle,
  fusionarRecalculo,
  huellaCompleta,
  mezclarTareasDeFases,
  tareasPropuestasDelDetalle,
  type CambiosDelDetalle,
} from "./tareas-del-detalle";
import { semanaVencida } from "./vista-de-la-propuesta";
import { computePhaseRanges } from "./weeks";

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

/** Kick-off (Semana 0) con una reunión escrita a mano y una hecha; Diseño con dos reemplazables;
 *  Pruebas con una reemplazable y una MODIFIED pendiente. */
const A1 = tarea("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN" });
const A2 = tarea("a2", "Firmar el acta", 0, { status: "DONE" });
const B1 = tarea("b1", "Mapear procesos", 0);
const B2 = tarea("b2", "Definir pipeline", 1);
const C1 = tarea("c1", "Probar flujos", 2);
const C2 = tarea("c2", "Probar reportes", 1, { source: "MODIFIED" });
const VIVO: Vivo = {
  ancla: null,
  fases: [
    fase("a", "Kick-off", 1, [A1, A2], { activityType: "EXPLORACION" }),
    fase("b", "Diseño", 2, [B1, B2]),
    fase("c", "Pruebas", 3, [C1, C2]),
  ],
};
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
/** El borrador del paso 1 (fases) esperando las tareas del paso 2. */
const BASE: Borrador = {
  formato: FORMATO_BORRADOR,
  version: 1,
  origen: "contexto",
  observaciones: ["En el kick-off se habló de un piloto."],
  cambios: [DUR_C, PILOTO],
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: false },
  tareasArmadasPara: {},
};
const ESTRUCTURA = estructuraHipotetica(VIVO, BASE);

type TareaCruda = { title: string; weekIndex?: number; party?: string; type?: string; notes?: string; porValidar?: boolean };
const salida = (fases: Array<{ id: string; tasks: TareaCruda[]; activityType?: string }>) => ({ timelineDetail: { phases: fases } });

let contador = 0;
const nuevaClave = () => `id-${++contador}`;

/**
 * El recorrido entero: lo que devolvió el agente → los cambios de tareas. `visto`: el cronograma que
 * LEYÓ el agente (por defecto VIVO); `vivo`: el de AL FUSIONAR (por defecto, el mismo). Desde E2b
 * (D10) no son lo mismo: el `desde` sale de lo visto y el vivo dice qué sigue en la fase.
 */
function cambios(
  analysisJson: unknown,
  opciones: {
    vivo?: Vivo;
    visto?: Vivo;
    tags?: string[];
    cortado?: boolean;
    borrador?: Borrador;
    huellas?: ReturnType<typeof huellasDeFrontera> | null;
    soloFases?: ReadonlySet<string> | null;
    /** L5 (R12): como la fusión, «Regenerar todo» respeta las terminadas y «Regenerar» de una fase no. */
    respetarTerminadas?: boolean;
  } = {},
) {
  const estructura = opciones.visto ? estructuraHipotetica(opciones.visto, opciones.borrador ?? BASE) : ESTRUCTURA;
  const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({
    estructura,
    analysisJson,
    huellas: opciones.huellas ?? null,
    cortado: opciones.cortado ?? false,
  });
  return cambiosDeTareasDelDetalle({
    estructura,
    vivo: opciones.vivo ?? VIVO,
    propuestas,
    borrador: opciones.borrador ?? BASE,
    tags: opciones.tags ?? [],
    nuevaClave,
    idsDesconocidos,
    soloFases: opciones.soloFases,
    respetarTerminadas: opciones.respetarTerminadas ?? !opciones.soloFases,
  });
}
/* ⚠ ACTUALIZADA en L5, con esta razón: desde R4c la IA también produce `tarea-cambia` (una tarea que vuelve en
   otra semana o con otro dueño o tipo). Se escribe «~id» con lo que cambia; antes caía en «-id» y se leía como
   una que se va. */
const resumen = (r: ReturnType<typeof cambios>, faseId?: string) =>
  r.tareas
    .filter((c) => faseId === undefined || (c.tipo === "tarea-nueva" ? c.fase : c.faseId) === faseId)
    .map((c) =>
      c.tipo === "tarea-nueva"
        ? `+${c.tarea.title}@${c.tarea.weekIndex}`
        : c.tipo === "tarea-cambia"
          ? `~${c.tareaId}${JSON.stringify(c.a)}`
          : `-${c.tareaId}`,
    );

describe("1 · qué se va y qué es nuevo", () => {
  it("⭐ una fase con solo tareas hechas o escritas a mano y propuesta del agente → 0 se van, N nuevas", () => {
    /* La edición que la pone en rojo: quitar las vivas sin mirar `isKept` (se iría trabajo hecho). */
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }, { title: "Acordar la agenda", weekIndex: 0 }] }]));
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0", "+Acordar la agenda@0"]);
  });

  it("⭐ una fase sin propuesta del agente, con reemplazables → 0 cambios (sin propuesta no es «borra todo»)", () => {
    /* La edición que la pone en rojo: sacar R1 — el agente que deja en paz una fase resuelta la vaciaba. */
    const r = cambios(salida([{ id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] }]));
    expect(resumen(r, "b")).toEqual([]);
    expect(r.tareas.every((c) => (c.tipo === "tarea-nueva" ? c.fase : c.faseId) !== "b")).toBe(true);
  });

  it("una MODIFIED pendiente se va (no tiene avance ni la escribió una persona); las que se van primero, por semana", () => {
    const r = cambios(salida([{ id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] }]));
    expect(resumen(r, "c")).toEqual(["-c2", "-c1", "+Pruebas de aceptación@3"]);
    const seVaC1 = r.tareas.find((c) => c.tipo === "tarea-se-va" && c.tareaId === "c1")!;
    expect(seVaC1).toMatchObject({ clave: "tarea:c1:se-va", faseId: "c", desde: { title: "Probar flujos", weekIndex: 2 } });
    expect(r.tareas.find((c) => c.tipo === "tarea-nueva")!.clave).toMatch(/^t:id-\d+$/);
  });

  it("⭐ el título «⚠ [por validar]:» sale saneado y marcado; la semana se acota a la duración que VIO el agente", () => {
    /* La edición que la pone en rojo: calcular con la duración VIVA (3) en vez de la hipotética (4):
       la tarea de la semana 4 de una fase que la propuesta alarga caía en la 3. */
    const r = cambios(
      salida([{ id: "c", tasks: [{ title: "⚠ [por validar]: Validar el flujo de bajas", weekIndex: 9, porValidar: true }] }]),
    );
    const n = r.tareas.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva")!;
    expect(n.tarea).toMatchObject({ title: "Validar el flujo de bajas", needsValidation: true, motivoPorValidar: null, weekIndex: 3 });
  });

  it("DEV en una fase que no es técnica cae al tipo de la fase; las fugas salen marcadas", () => {
    const r = cambios(
      salida([
        {
          id: "c",
          activityType: "CONFIGURACION",
          tasks: [
            { title: "Conectar la API", party: "DEV" },
            { title: "Cobrar $5.000 del piloto", notes: "Cierre el 15 de octubre" },
          ],
        },
      ]),
      { huellas: huellasDeFrontera(["Reunión con el cliente sobre el piloto"]) },
    );
    const [dev, conFuga] = r.tareas.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva").map((c) => c.tarea);
    expect(dev.party).toBe("SMARTEAM");
    expect(dev.fuga).toBeNull();
    expect(conFuga.fuga).toEqual({ campo: "titulo", motivo: "trae un monto", motivoDeLaNota: "trae una fecha" });
  });

  it("una fase nueva (`n:…`) recibe sus tareas; un id que no está en la estructura se ignora y se avisa", () => {
    const r = cambios(
      salida([
        { id: PILOTO.clave, tasks: [{ title: "Piloto con un equipo" }, { title: "Medir el piloto", weekIndex: 1 }] },
        { id: "fase-que-no-existe", tasks: [{ title: "Algo" }] },
        { id: "nueva:3", tasks: [{ title: "Algo más" }] },
      ]),
    );
    expect(resumen(r, PILOTO.clave)).toEqual(["+Piloto con un equipo@0", "+Medir el piloto@1"]);
    expect(r.observaciones).toContain("La IA devolvió tareas para 2 fases que no reconoció: se ignoraron.");
    expect(resumen(r).some((x) => x.includes("Algo"))).toBe(false);
  });

  it("una fase nueva sin tareas del agente se avisa; `tareasArmadasPara` va para TODAS las fases de la estructura", () => {
    const r = cambios(salida([]));
    expect(r.tareas).toEqual([]);
    expect(r.observaciones).toEqual(["La IA no armó tareas para la fase nueva «Piloto»."]);
    /* ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan. Para saber
       cuándo una fase quedó desfasada, R8 guarda la forma COMPLETA con que se armaron sus tareas: también
       las sesiones y si es la primera (la de la Semana 0). La edición que la pone en rojo: volver a
       guardar solo nombre y semanas (quitar una fase nueva que iba primera dejaría a la que pasa a ser
       primera sin sus tareas del arranque, y un cambio de sesiones quitado no se notaría). */
    expect(r.tareasArmadasPara).toEqual({
      a: { nombre: "Kick-off", semanas: 1, sesiones: null, semanaCero: true },
      b: { nombre: "Diseño", semanas: 2, sesiones: null, semanaCero: false },
      c: { nombre: "Pruebas", semanas: 4, sesiones: null, semanaCero: false },
      [PILOTO.clave]: { nombre: "Piloto", semanas: 2, sesiones: null, semanaCero: false },
    });
    // Las sesiones salen de la estructura que vio el agente.
    const conSesiones: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "b" ? { ...f, sessionCount: 3 } : f)) };
    expect(cambios(salida([]), { visto: conSesiones, vivo: conSesiones }).tareasArmadasPara.b).toEqual({
      nombre: "Diseño",
      semanas: 2,
      sesiones: 3,
      semanaCero: false,
    });
  });
});

describe("2 · R4b: lo idéntico no se borra y se recrea", () => {
  it("⭐ un par idéntico no emite nada; el mismo título en otra semana CAMBIA de semana (R4c)", () => {
    /* La edición que la pone en rojo: emparejar solo por título (se perdía el cambio de semana) o no
       emparejar (cada regeneración borraba y recreaba la misma tarea con otro id).
       ⚠ ACTUALIZADA en L5, con esta razón (decisión 4 de Elías: conservar lo que sirve): «Definir pipeline»
       vuelve en la semana 0. Antes salía «se va + nueva» (otro id, y se perdía su historia); desde R4c es la
       misma tarea que cambia de semana: un solo cambio, «~b2», con su id. */
    const r = cambios(
      salida([
        {
          id: "b",
          tasks: [
            { title: "  mapear PROCESOS ", weekIndex: 0, party: "SMARTEAM", type: "TASK" },
            { title: "Definir pipeline", weekIndex: 0, party: "SMARTEAM", type: "TASK" },
          ],
        },
      ]),
    );
    expect(resumen(r, "b")).toEqual(['~b2{"weekIndex":0}']);
  });

  it("con otras notas, otro dueño o «por validar», R4b no las junta; R4c sí, y solo cambia el dueño", () => {
    /* ⚠ ACTUALIZADA en L5, con esta razón (decisión 4 de Elías: conservar lo que sirve): pedía «-b1 +Mapear
       procesos» en los tres casos, o sea borrar y recrear la misma tarea. Desde R4c vuelve la MISMA: con otra
       nota o con «por validar» no se toca (la nota de hoy se conserva y se cuenta, D12); con otro dueño, un
       solo cambio de la IA con lo que difiere. La edición que la pone en rojo: volver a «se va + nueva». */
    const casos: Array<[TareaCruda, string[]]> = [
      [{ title: "Mapear procesos", weekIndex: 0, notes: "con ventas" }, ["-b2"]],
      [{ title: "Mapear procesos", weekIndex: 0, party: "CLIENTE" }, ["-b2", '~b1{"party":"CLIENTE"}']],
      [{ title: "Mapear procesos", weekIndex: 0, porValidar: true }, ["-b2"]],
    ];
    for (const [cruda, esperado] of casos) {
      const r = cambios(salida([{ id: "b", tasks: [cruda] }]));
      expect(resumen(r, "b"), JSON.stringify(cruda)).toEqual(esperado);
    }
    const conNota = cambios(salida([{ id: "b", tasks: [casos[0][0]] }]));
    expect(conNota.observaciones).toContain("1 tarea vuelve con otra nota: se conserva la nota de hoy.");
  });
});

describe("2b · L5: la IA deja quieto lo terminado y no reescribe por reescribir (R12, R4c)", () => {
  /** La propuesta grande (anonimizada): su paso 2 fusionado otra vez con el código de hoy. */
  const fusionDelFixture = (respetarTerminadas: boolean) => {
    const fx = leerFixtureGrande();
    const vivo = vivoDelFixture(fx);
    const borrador = borradorDelFixture(fx);
    const estructura = estructuraHipotetica(vivo, borrador);
    const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({ estructura, analysisJson: fx.paso2, huellas: null, cortado: false });
    let k = 0;
    const r = cambiosDeTareasDelDetalle({
      estructura,
      vivo,
      propuestas,
      borrador,
      tags: [],
      nuevaClave: () => `fx-${++k}`,
      idsDesconocidos,
      respetarTerminadas,
    });
    return { vivo, r, fusionado: fusionarDetalle(borrador, r, "r-paso2") };
  };
  const deLaFase = (r: CambiosDelDetalle, fase: string) => r.tareas.filter((c) => faseDeLaTarea(c) === fase);

  it("⭐ R12 · en «Regenerar todo», la fase terminada no recibe ni pierde tareas, y se dice", () => {
    /* La edición que la pone en rojo: leer `respetarTerminadas` al revés (o no mirarlo): la fase terminada
       recibía 8 tareas nuevas en la propuesta de Wherex. */
    const { r } = fusionDelFixture(true);
    expect(deLaFase(r, FASE_TERMINADA), "la fase terminada recibe o pierde tareas").toEqual([]);
    expect(r.observaciones).toContain("«Fase B» está terminada: la IA no le propone tareas.");
    // Sin R12 («Regenerar» de una fase, el recálculo), sus 8 nuevas vuelven.
    const sin = fusionDelFixture(false).r;
    expect(deLaFase(sin, FASE_TERMINADA).map((c) => c.tipo)).toEqual(Array(8).fill("tarea-nueva"));
    expect(sin.observaciones.some((o) => o.includes("está terminada"))).toBe(false);
  });

  it("⭐ R4c · Wherex: 110 cambios de tareas (49 se van, 57 nuevas, 4 cambian), ningún par entre fases, y 8 con otra nota", () => {
    /* Las ediciones que la ponen en rojo: contar la nota distinta solo en los pares de la misma semana (dice
       4, no 8), o no emparejar en otra semana (salen 114, sin «~»). Los números salen de `resumir`, lo mismo
       que pinta el Gantt, sin lo «ya está». */
    const { vivo, fusionado } = fusionDelFixture(true);
    const r = resumir(vivo, fusionado, [], { tareas: "listas" });
    const signos: Record<string, number> = {};
    for (const g of r.grupos) for (const t of g.tareas) if (t.estado !== "ya-esta") signos[t.signo] = (signos[t.signo] ?? 0) + 1;
    expect(signos).toEqual({ "−": 49, "+": 57, "~": 4 });
    expect(r.grupos.filter((g) => g.cambian > 0).map((g) => [g.nombre, g.cambian])).toEqual([
      ["Fase D", 2],
      ["Fase K", 2],
    ]);
    const cambian = fusionado.cambios.filter((c): c is CambioTareaCambia => c.tipo === "tarea-cambia");
    expect(cambian.every((c) => c.a.fase === undefined && !c.porChat), "un par entre fases, o dictado por el chat").toBe(true);
    expect(fusionado.observaciones).toContain("8 tareas vuelven con otra nota: se conserva la nota de hoy.");
  });

  it("⭐ una sesión semanal: 3 pares en su semana y 1 que cambia; con dos sobrantes a cada lado, no se adivina", () => {
    /* La edición que la pone en rojo: pasar al paso 2 (otra semana) sin mirar que quede UNA de cada lado:
       con dos sobrantes, emparejaba la de la semana 0 con la 4 y la 1 con la 5. */
    const sesion = (id: string, w: number) => tarea(id, "Sesión de seguimiento", w, { type: "SESSION", notes: `Semana ${w}` });
    const conSesiones = (semanas: number[]): Vivo => ({
      ...VIVO,
      fases: VIVO.fases.map((f) => (f.id === "c" ? { ...f, durationWeeks: 6, tareas: semanas.map((w) => sesion(`s${w}`, w)) } : f)),
    });
    const nuevas = (semanas: number[]) =>
      salida([{ id: "c", tasks: semanas.map((w) => ({ title: "Sesión de seguimiento", weekIndex: w, type: "SESSION" })) }]);
    const seis: Borrador = { ...BASE, cambios: [] }; // «Pruebas» con sus 6 semanas de hoy
    // Se van las de las semanas 1 a 4 y llegan las de 2 a 5: 2, 3 y 4 vuelven en su semana; la 1 pasa a la 5.
    const uno = cambios(nuevas([2, 3, 4, 5]), { visto: conSesiones([1, 2, 3, 4]), vivo: conSesiones([1, 2, 3, 4]), borrador: seis });
    expect(resumen(uno, "c")).toEqual(['~s1{"weekIndex":5}']);
    expect(uno.observaciones).toContain("4 tareas vuelven con otra nota: se conserva la nota de hoy.");
    // Se van las de 0 a 3 y llegan las de 2 a 5: sobran dos de cada lado (0 y 1, 4 y 5). No se empareja nada más.
    const dos = cambios(nuevas([2, 3, 4, 5]), { visto: conSesiones([0, 1, 2, 3]), vivo: conSesiones([0, 1, 2, 3]), borrador: seis });
    expect(resumen(dos, "c")).toEqual([
      "-s0",
      "-s1",
      "+Sesión de seguimiento@4",
      "+Sesión de seguimiento@5",
    ]);
  });

  it("⛔ nunca con avance: una hecha con el mismo título que una nueva no se toca", () => {
    /* La edición que la pone en rojo: emparejar también las que tienen avance (`isKept`): la hecha «cambiaba
       de semana» y su nueva desaparecía. Una hecha nunca se mueve sin su casilla. */
    const conHecha: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) => (f.id === "b" ? { ...f, tareas: [...(f.tareas ?? []), tarea("b3", "Capacitar usuarios", 0, { status: "DONE" })] } : f)),
    };
    const r = cambios(
      salida([{ id: "b", tasks: [{ title: "Mapear procesos", weekIndex: 0 }, { title: "Capacitar usuarios", weekIndex: 1 }] }]),
      { visto: conHecha, vivo: conHecha },
    );
    expect(resumen(r, "b")).toEqual(["-b2", "+Capacitar usuarios@1"]);
  });

  it("⛔ título largo: «… para ventas» y «… para postventa» no son la misma tarea", () => {
    /* La edición que la pone en rojo: emparejar con la huella cortada a 60 caracteres (`fingerprintFromTitle`):
       las dos eran «la misma» y la de postventa no se creaba. */
    const largo: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "b" ? { ...f, tareas: [tarea("b1", "Configurar las propiedades personalizadas del objeto Negocios para ventas", 0)] } : f,
      ),
    };
    const r = cambios(
      salida([{ id: "b", tasks: [{ title: "Configurar las propiedades personalizadas del objeto Negocios para postventa", weekIndex: 1 }] }]),
      { visto: largo, vivo: largo },
    );
    expect(resumen(r, "b")).toEqual(["-b1", "+Configurar las propiedades personalizadas del objeto Negocios para postventa@1"]);
    expect(huellaCompleta("Configurar las propiedades personalizadas del objeto Negocios para ventas")).not.toBe(
      huellaCompleta("Configurar las propiedades personalizadas del objeto Negocios para postventa"),
    );
  });

  it("R9 · las que se van, después las que cambian y al final las nuevas; nunca un par entre fases", () => {
    /* La edición que la pone en rojo: emparejar con una nueva de OTRA fase («Probar flujos» vuelve en Diseño:
       es otra tarea, no una mudanza), o poner las que cambian después de las nuevas. */
    const r = cambios(
      salida([
        { id: "b", tasks: [{ title: "Probar flujos", weekIndex: 0 }] },
        { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 0 }, { title: "Probar flujos", weekIndex: 0 }] },
      ]),
    );
    expect(resumen(r, "b")).toEqual(["-b1", "-b2", "+Probar flujos@0"]);
    expect(resumen(r, "c")).toEqual(["-c2", '~c1{"weekIndex":0}', "+Pruebas de aceptación@0"]);
  });
});

describe("3 · R7: las fijas de la Semana 0 no van y vuelven", () => {
  const FIJAS = [
    "Entregar documentación de procesos involucrados",
    "Proporcionar bases de datos a importar",
    "Entregar listado de usuarios a ingresar al CRM",
    "Asignar la lista de reproducción de HubSpot Academy al cliente",
    "Proporcionar acceso al portal de HubSpot a Smarteam",
  ];

  it("⭐ una Semana 0 quieta (sin propuesta del agente) con fijas faltantes → solo nuevas", () => {
    const r = cambios(salida([]), { tags: ["implementacion"] });
    expect(resumen(r, "a")).toEqual(FIJAS.map((t) => `+${t}@0`));
    // Sin HubSpot, ninguna.
    expect(resumen(cambios(salida([])), "a")).toEqual([]);
  });

  it("⭐ con propuesta y fijas ya cargadas (de la IA): las fijas vivas no se van ni se vuelven a proponer", () => {
    /* La edición que la pone en rojo: tratar las fijas vivas como cualquier reemplazable: se iban y
       volvían en cada regeneración (con otro id), y el CSE revisaba 5 tareas que no cambiaron.
       ⚠ ACTUALIZADA en E2b P3 (2026-09-25), con esta razón: desde D10 solo se va lo que el agente VIO.
       Las fijas estaban en el vivo pero no en la estructura, así que ya no eran reemplazables y la guarda
       dejaba de probar R7. Ahora el agente las ve (`visto`), como pasa de verdad. */
    const conFijas: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), ...FIJAS.map((t, i) => tarea(`f${i}`, t, 0, { party: "CLIENTE" }))] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), {
      vivo: conFijas,
      visto: conFijas,
      tags: ["implementacion"],
    });
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0"]);
  });

  it("⛔ una fija creada mientras la IA armaba (el agente no la vio) no se vuelve a proponer", () => {
    /* E2b P3. La edición que la pone en rojo: contar para R7 solo lo que vio el agente (se proponía
       crear otra vez lo que alguien acababa de crear). */
    const conUnaFijaNueva: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), tarea("nueva", FIJAS[0], 0, { source: "HUMAN" })] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), { vivo: conUnaFijaNueva, tags: ["implementacion"] });
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0", ...FIJAS.slice(1).map((t) => `+${t}@0`)]);
  });

  it("la gemela: una viva «desde cero» en un proyecto que pasó a re-implementación no se va ni se duplica", () => {
    /* ⚠ ACTUALIZADA en E2b P3 (2026-09-25), con esta razón: la misma de arriba (D10); el agente ve la
       gemela (`visto`), así sigue siendo una reemplazable que R7 conserva. */
    const conGemela: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), tarea("g", "Proporcionar bases de datos a importar", 0)] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), {
      vivo: conGemela,
      visto: conGemela,
      tags: ["reimplementacion"],
    });
    const a = resumen(r, "a");
    expect(a).not.toContain("-g");
    expect(a.some((x) => x.includes("Revisar y limpiar la base de datos existente"))).toBe(false);
    expect(a).toEqual([
      "+Presentar el equipo@0",
      ...FIJAS.filter((t) => t !== "Proporcionar bases de datos a importar").map((t) => `+${t}@0`),
    ]);
  });

  it("la fija por validar (tipo sin definir) lleva su motivo; las fijas van al final de su fase", () => {
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), { tags: ["sales_hub"] });
    const deA = r.tareas.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.fase === "a");
    expect(deA[0].tarea.title).toBe("Presentar el equipo");
    const bd = deA.find((c) => c.tarea.title === "Proporcionar bases de datos a importar")!;
    expect(bd.tarea).toMatchObject({ needsValidation: true, party: "CLIENTE", type: "TASK", weekIndex: 0 });
    expect(bd.tarea.motivoPorValidar).toContain("no dice si es implementación");
  });
});

describe("4 · R6 el tipo de actividad, R10 la salida cortada", () => {
  it("⭐ el tipo propuesto solo entra si la fase no tiene uno (el elegido a mano manda)", () => {
    /* La edición que la pone en rojo: proponer el tipo aunque la fase ya tenga uno: le pisaba al CSE
       el tipo que eligió. */
    const r = cambios(
      salida([
        { id: "a", activityType: "ADOPCION", tasks: [{ title: "X" }] },
        { id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Y" }] },
        { id: PILOTO.clave, activityType: "SEGUIMIENTO", tasks: [{ title: "Z" }] },
        { id: "c", activityType: "INVENTADO", tasks: [{ title: "W" }] },
      ]),
    );
    expect(r.tipos).toEqual([
      { tipo: "fase-cambia", clave: "fase:b:activityType", faseId: "b", fase: "Diseño", campo: "activityType", desde: null, a: "PLANIFICACION" },
    ]);
    expect(r.tiposDeNuevas).toEqual({ [PILOTO.clave]: "SEGUIMIENTO" });
    // Si el borrador ya trae un cambio de tipo de esa fase, no se suma otro.
    const conTipo: Borrador = {
      ...BASE,
      cambios: [...BASE.cambios, { ...DUR_C, clave: "fase:b:activityType", faseId: "b", fase: "Diseño", campo: "activityType", desde: null, a: "ADOPCION" }],
    };
    expect(cambios(salida([{ id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Y" }] }]), { borrador: conTipo }).tipos).toEqual([]);
    expect(DETAIL_ACTIVITY_TYPES).toContain("PLANIFICACION");
    expect(activityTypePropuesto({ activityType: "INVENTADO" })).toBeNull();
    expect(activityTypePropuesto(undefined)).toBeNull();
  });

  it("⭐ con la salida cortada, la ÚLTIMA fase no genera nada y se avisa", () => {
    /* La edición que la pone en rojo: usar la última fase de un JSON reparado: sus tareas llegan a
       medias y las que faltan se irían como si el agente las hubiera sacado. */
    const json = salida([
      { id: "b", tasks: [{ title: "Mapear procesos de venta" }] },
      { id: "c", tasks: [{ title: "Pruebas de acep" }] },
    ]);
    const r = cambios(json, { cortado: true });
    expect(resumen(r, "c")).toEqual([]);
    expect(resumen(r, "b")).toEqual(["-b1", "-b2", "+Mapear procesos de venta@0"]);
    expect(r.observaciones).toContain(
      "La IA se cortó antes de terminar: las tareas de «Pruebas» y de las fases que no alcanzó a armar quedan como están.",
    );
    expect(resumen(cambios(json, { cortado: false }), "c")).toEqual(["-c2", "-c1", "+Pruebas de acep@0"]);
  });
});

describe("5 · la fusión en el borrador", () => {
  it("⭐ estructura + tipos + tareas, las tareas LISTAS con su corrida, la versión sube, y el plan aplica todo", () => {
    const json = salida([
      { id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Mapear procesos de venta" }] },
      { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
      { id: PILOTO.clave, activityType: "SEGUIMIENTO", tasks: [{ title: "Piloto con un equipo" }] },
    ]);
    // Un borrador que ya traía tareas de una fusión anterior: se reemplazan, no se suman.
    const conViejas: Borrador = {
      ...BASE,
      cambios: [...BASE.cambios, { tipo: "tarea-se-va", clave: "tarea:a1:se-va", tareaId: "a1", faseId: "a", desde: { title: "x", weekIndex: 0, notes: null, party: null, type: null, inicioFijado: null, finFijado: null } }],
    };
    const r = cambios(json);
    const b = fusionarDetalle(conViejas, r, "run-2");
    expect(b.version).toBe(2);
    expect(b.tareas).toEqual({ corrida: "run-2", listas: true });
    expect(b.pedido).toBe("regenerar");
    expect(b.cambios.slice(0, 3).map((c) => c.clave)).toEqual(["fase:c:durationWeeks", PILOTO.clave, "fase:b:activityType"]);
    expect(b.cambios.some((c) => c.clave === "tarea:a1:se-va")).toBe(false);
    expect((b.cambios[1] as CambioFaseNueva).fase.activityType, "el tipo va en la fase nueva").toBe("SEGUIMIENTO");
    expect(b.tareasArmadasPara).toEqual(r.tareasArmadasPara);
    expect(b.observaciones[0]).toBe("En el kick-off se habló de un piloto.");
    expect(b.desconocidos).toBeUndefined();

    // Sobre lo vivo de ahora, todo lo que se armó se puede aplicar tal cual.
    const plan = planDeAplicacion(VIVO, b, [], { tareas: "listas" });
    expect(plan.choques).toBe(0);
    expect(plan.items.every((it) => it.estado === "aplica")).toBe(true);
    expect(plan.escrituras.tareas.seVan).toEqual(["b1", "b2", "c1", "c2"]);
    expect(plan.escrituras.tareas.nuevas.map((n) => [n.fase, n.tarea.title])).toEqual([
      [{ tipo: "existente", id: "b" }, "Mapear procesos de venta"],
      [{ tipo: "existente", id: "c" }, "Pruebas de aceptación"],
      [{ tipo: "nueva", clave: PILOTO.clave }, "Piloto con un equipo"],
    ]);
  });

  it("⭐ D10 · el `desde` es lo que VIO el agente: una tarea editada mientras la IA armaba choca y queda fuera", () => {
    /* ⚠ REESCRITA en E2b P3 (2026-09-25), con esta razón: pedía que el `desde` fuera la foto AL FUSIONAR.
       El plan (§1.1) pide fijarlo «contra la misma foto que leyó quien lo produjo»: con la foto de al
       fusionar, una edición hecha mientras la IA armaba (1-4 min) no chocaba y «Aplicar todo» la
       borraba. E2b saca el bloqueo de la espera, así que editar en ese rato es lo normal.
       La edición que la pone en rojo: volver a tomar el `desde` (o lo que se va) de `viva?.tareas`. */
    const editado: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) => (f.id === "b" ? { ...f, tareas: [{ ...B1, notes: "nota nueva" }, B2] } : f)),
    };
    const r = cambios(salida([{ id: "b", tasks: [{ title: "Mapear procesos de venta" }] }]), { vivo: editado });
    const seVaB1 = r.tareas.find((c) => c.tipo === "tarea-se-va" && c.tareaId === "b1")!;
    expect(seVaB1.tipo === "tarea-se-va" && seVaB1.desde.notes, "el `desde` salió de lo vivo al fusionar").toBeNull();
    // Contra lo vivo, esa tarea choca (queda como la dejó el CSE); la otra se va.
    const plan = planDeAplicacion(editado, fusionarDetalle(BASE, r, "run-2"), [], { tareas: "listas" });
    const item = plan.items.find((it) => it.cambio.clave === "tarea:b1:se-va")!;
    expect(item.estado).toBe("choque");
    /* ⚠ ACTUALIZADA en la revisión de E2b (2026-09-25), con esta razón: decía «La editaste a mano
       después de la propuesta», y en este caso se editó mientras la IA armaba, cuando todavía no había
       propuesta en pantalla. El ⚠ cuenta lo que pasó en los dos casos. La edición que la pone en rojo:
       volver a un texto que ubique la edición «después de la propuesta». */
    expect(item.choque).toBe("Se editó a mano después de que la IA la leyó: queda como está.");
    expect(item.choque, "el ⚠ ubica la edición después de una propuesta que todavía no existía").not.toMatch(/después de la propuesta/);
    expect(plan.escrituras.tareas.seVan).toEqual(["b2"]);
  });

  it("⛔ D10 · iniciada, creada o mudada mientras la IA armaba: no se va", () => {
    /* E2b P3. Las ediciones que la ponen en rojo: mirar `isKept` en lo visto (una tarea iniciada en ese
       rato se iría), tomar lo que se va de lo vivo (se iría una recién creada) o de lo visto sin mirar
       si sigue en la fase (se iría una mudada). */
    const json = salida([
      { id: "b", tasks: [{ title: "Mapear procesos de venta" }] },
      { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
    ]);
    const B3 = tarea("b3", "Creada mientras la IA armaba", 1);
    const conCambios: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "b"
          ? { ...f, tareas: [{ ...B2, status: "IN_PROGRESS" }, B3] } // B2 iniciada, B3 creada, B1 se mudó a «Pruebas»
          : f.id === "c"
            ? { ...f, tareas: [C1, C2, B1] }
            : f,
      ),
    };
    const r = cambios(json, { vivo: conCambios });
    expect(resumen(r, "b")).toEqual(["+Mapear procesos de venta@0"]);
    expect(resumen(r, "c"), "la mudada se va desde su fase nueva (el agente no la vio ahí)").toEqual([
      "-c2",
      "-c1",
      "+Pruebas de aceptación@3",
    ]);
  });

  it("⛔ el vocabulario del tipo de actividad vive en UN lugar: analyze no lo redeclara", () => {
    /* La edición que la pone en rojo: volver a declarar la lista en la ruta (dos vocabularios que
       divergen en silencio entre la ruta y el borrador).
       ⚠ ACTUALIZADA en E2b P5a (2026-09-25), con esta razón: pedía también que analyze IMPORTARA
       `activityTypePropuesto`. Lo usaban solo las vistas previas, que se borraron: el tipo lo propone
       el borrador (R6), acá mismo. Lo que sigue valiendo es que la ruta no tenga un vocabulario propio. */
    const analyze = fs.readFileSync(path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"), "utf8");
    expect(analyze.length, "la guarda no está mirando la ruta").toBeGreaterThan(50_000);
    expect(analyze).not.toMatch(/const DETAIL_ACTIVITY_TYPES\s*=/);
    expect(analyze).not.toMatch(/function activityTypePropuesto\(/);
  });
});

describe("6 · el alcance de «Regenerar» de una fase (E2b, `soloFases`)", () => {
  /* El modelo recibe el ALCANCE en el prompt, pero puede no respetarlo: lo que devuelva para otras
     fases no entra. La edición que pone en rojo a todo el bloque: sacar el `continue` del alcance (o
     ponerlo después de R8, R6 o R7). */
  const TODO = salida([
    { id: "a", activityType: "ADOPCION", tasks: [{ title: "Presentar el equipo" }] },
    { id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Mapear procesos de venta" }] },
    { id: "c", activityType: "CONFIGURACION", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
    { id: PILOTO.clave, activityType: "SEGUIMIENTO", tasks: [] },
  ]);

  it("⭐ otra fase no emite nada: ni tareas, ni tipo, ni avisos", () => {
    const r = cambios(TODO, { soloFases: new Set(["c"]) });
    expect(resumen(r)).toEqual(["-c2", "-c1", "+Pruebas de aceptación@3"]);
    expect(r.observaciones, "avisó de una fase fuera del alcance").toEqual([]);
    expect(r.tiposDeNuevas).toEqual({});
  });

  it("⭐ R6: el tipo solo en la fase pedida", () => {
    expect(cambios(TODO, { soloFases: new Set(["c"]) }).tipos.map((t) => t.faseId)).toEqual(["c"]);
    expect(cambios(TODO, { soloFases: new Set(["b"]) }).tipos.map((t) => t.faseId)).toEqual(["b"]);
    // Sin alcance, las dos (control: el mismo JSON).
    expect(cambios(TODO).tipos.map((t) => t.faseId)).toEqual(["b", "c"]);
  });

  it("⭐ R7: las fijas de la Semana 0 solo si la pedida ES la del arranque", () => {
    const deOtra = cambios(TODO, { soloFases: new Set(["b"]), tags: ["implementacion"] });
    expect(resumen(deOtra, "a"), "sembró la Semana 0 al regenerar otra fase").toEqual([]);
    const delArranque = cambios(TODO, { soloFases: new Set(["a"]), tags: ["implementacion"] });
    expect(resumen(delArranque, "a")).toHaveLength(6);
    expect(resumen(delArranque).every((x) => resumen(delArranque, "a").includes(x))).toBe(true);
  });

  it("R8: `tareasArmadasPara` trae solo la fase pedida", () => {
    // ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan (R8 guarda la forma completa).
    expect(cambios(TODO, { soloFases: new Set(["c"]) }).tareasArmadasPara).toEqual({
      c: { nombre: "Pruebas", semanas: 4, sesiones: null, semanaCero: false },
    });
    // null o ausente = todo el cronograma, como siempre.
    expect(Object.keys(cambios(TODO, { soloFases: null }).tareasArmadasPara)).toEqual(["a", "b", "c", PILOTO.clave]);
  });

  it("la fusión conserva `soloFase`; sin él, no aparece", () => {
    const r = cambios(TODO, { soloFases: new Set(["c"]) });
    expect(fusionarDetalle({ ...BASE, soloFase: "c" }, r, "run-2").soloFase).toBe("c");
    expect("soloFase" in fusionarDetalle(BASE, r, "run-2")).toBe(false);
  });
});

describe("7 · E3: lo que dictó el chat sobrevive a las fusiones de la IA", () => {
  const DEL_CHAT_SE_VA: CambioTareaSeVa = {
    tipo: "tarea-se-va",
    clave: "tarea:b1:se-va",
    tareaId: "b1",
    faseId: "b",
    desde: fotoDeTarea(B1),
    porChat: true,
  };
  const DEL_CHAT_CAMBIA: CambioTareaCambia = {
    tipo: "tarea-cambia",
    clave: "tarea:c1:cambia",
    tareaId: "c1",
    faseId: "c",
    desde: fotoDeTarea(C1),
    a: { title: "Probar los flujos de venta" },
    porChat: true,
  };
  const DEL_CHAT_NUEVA: CambioTareaNueva = {
    tipo: "tarea-nueva",
    clave: "t:del-chat",
    fase: "c",
    tarea: { title: "Revisión conjunta", weekIndex: 1, notes: null, party: null, type: null, needsValidation: false, motivoPorValidar: null, fuga: null },
    porChat: true,
  };
  const DE_LA_IA_ANTES: CambioTareaNueva = { ...DEL_CHAT_NUEVA, clave: "t:ia-vieja", porChat: undefined };
  const CON_CHAT: Borrador = {
    ...BASE,
    cambios: [...BASE.cambios, DE_LA_IA_ANTES, DEL_CHAT_SE_VA, DEL_CHAT_CAMBIA, DEL_CHAT_NUEVA],
    excluidos: ["tarea:b2:se-va"],
    ajustadasPorElChat: { c: { nombre: "Pruebas", semanas: 5 }, otra: { nombre: "Otra", semanas: 1 } },
  };

  it("⭐ la fusión conserva lo del chat, no reemplaza las tareas que tocó y borra la forma ajustada de lo que rearma", () => {
    /* La edición que la pone en rojo: volver al `filter(!esCambioDeTarea)` (lo que dictó el chat se
       perdería con cada fusión), reemplazar una tarea que el chat quita o cambia (dos cambios de la misma
       tarea, con la misma clave), o dejar la forma ajustada de una fase que se volvió a armar (D9). */
    const r = cambios(
      salida([
        { id: "b", tasks: [{ title: "Mapear procesos de venta" }] },
        { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
      ]),
      { borrador: CON_CHAT },
    );
    // R2: la IA no propone quitar lo que el chat quita (b1) o cambia (c1); sí lo que no tocó.
    expect(r.tareas.filter((c) => c.tipo === "tarea-se-va").map((c) => (c as CambioTareaSeVa).tareaId)).toEqual(["b2", "c2"]);
    const b = fusionarDetalle(CON_CHAT, r, "run-2");
    const claves = b.cambios.map((c) => c.clave);
    expect(claves.slice(0, 5), "lo del chat no quedó detrás de la estructura").toEqual([
      "fase:c:durationWeeks",
      PILOTO.clave,
      "tarea:b1:se-va",
      "tarea:c1:cambia",
      "t:del-chat",
    ]);
    expect(claves, "sobrevivió una tarea de la IA de antes").not.toContain("t:ia-vieja");
    expect(new Set(claves).size, "dos cambios con la misma clave").toBe(claves.length);
    expect(b.excluidos).toEqual(["tarea:b2:se-va"]);
    expect(b.ajustadasPorElChat, "la fase rearmada conservó la forma del chat").toEqual({ otra: { nombre: "Otra", semanas: 1 } });
  });

  it("el recálculo reemplaza solo las tareas de la IA de sus fases, y la fase recalculada pierde su forma ajustada", () => {
    /* La edición que la pone en rojo: mezclar sin mirar `porChat` (el recálculo de «Pruebas» se llevaría
       lo que el chat dictó en ella). */
    const recalculadas: CambioTareaNueva[] = [{ ...DEL_CHAT_NUEVA, clave: "t:ia-nueva", porChat: undefined, tarea: { ...DEL_CHAT_NUEVA.tarea, title: "Pruebas guiadas" } }];
    const mezcla = mezclarTareasDeFases(CON_CHAT.cambios, recalculadas, new Set(["c"]));
    expect(mezcla.map((c) => c.clave)).toEqual([...BASE.cambios.map((c) => c.clave), "t:ia-nueva", "tarea:b1:se-va", "tarea:c1:cambia", "t:del-chat"]);
    const b = fusionarRecalculo(CON_CHAT, {
      tareas: recalculadas,
      armadas: { c: { nombre: "Pruebas", semanas: 3 } },
      escritas: ["c"],
      fallidas: [],
      motivo: null,
      observaciones: [],
    });
    expect(b.ajustadasPorElChat).toEqual({ otra: { nombre: "Otra", semanas: 1 } });
    expect(b.excluidos).toEqual(["tarea:b2:se-va"]);
  });

  it("⛔ lo que el chat retocó en una tarea nueva de la IA sobrevive a las dos fusiones, como lo del chat", () => {
    /* Revisión de E3 (#2). El chat le cambió el título (quedó `retocada`, no `porChat`) y dijo «quedó en la
       propuesta». La edición que la pone en rojo: conservar solo lo `porChat` (el recálculo de su fase, o
       una vuelta del paso 2, la reemplazaría por una nueva de la IA y el cambio se perdería sin aviso). */
    const RETOCADA: CambioTareaNueva = {
      ...DE_LA_IA_ANTES,
      clave: "t:ia-retocada",
      tarea: { ...DE_LA_IA_ANTES.tarea, title: "Revisión conjunta con el cliente" },
      retocada: true,
    };
    const conRetocada: Borrador = { ...CON_CHAT, cambios: [...BASE.cambios, DE_LA_IA_ANTES, RETOCADA, DEL_CHAT_NUEVA] };
    const recalculadas: CambioTareaNueva[] = [{ ...DE_LA_IA_ANTES, clave: "t:ia-nueva", tarea: { ...DE_LA_IA_ANTES.tarea, title: "Pruebas guiadas" } }];
    const mezcla = mezclarTareasDeFases(conRetocada.cambios, recalculadas, new Set(["c"]));
    expect(mezcla.map((c) => c.clave), "el recálculo se llevó la retocada").toEqual([
      ...BASE.cambios.map((c) => c.clave),
      "t:ia-nueva",
      "t:ia-retocada",
      "t:del-chat",
    ]);
    expect(mezcla.find((c) => c.clave === RETOCADA.clave)).toEqual(RETOCADA);

    const b = fusionarDetalle(conRetocada, cambios(salida([{ id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] }]), { borrador: conRetocada }), "run-2");
    const claves = b.cambios.map((c) => c.clave);
    expect(claves.slice(0, 4), "el paso 2 se llevó la retocada").toEqual(["fase:c:durationWeeks", PILOTO.clave, "t:ia-retocada", "t:del-chat"]);
    expect(claves, "sobrevivió una tarea de la IA de antes").not.toContain("t:ia-vieja");
  });

  it("⛔ revisión de los arreglos · la IA vuelve a proponer lo que el chat retocó o dictó: no entran las dos", () => {
    /* La IA propuso «Taller de requerimientos» (S1) en «Pruebas» y el chat la retocó (quedó `retocada`). Al
       recalcular la fase, el agente no la ve (arma desde lo vivo) y vuelve a proponer la misma. Antes quedaban
       las dos en «aplica», sin «Ya está» ni ⚠, y «Aplicar todo» creaba las dos. La edición que la pone en rojo:
       mezclar (o fusionar el paso 2) sin sacar la nueva del agente que repite una conservada de la misma fase. */
    const TALLER: CambioTareaNueva = {
      ...DE_LA_IA_ANTES,
      clave: "t:ia-taller",
      tarea: { ...DE_LA_IA_ANTES.tarea, title: "Taller de requerimientos", weekIndex: 1, party: "CLIENTE" },
      retocada: true,
    };
    const conTaller: Borrador = { ...CON_CHAT, cambios: [...BASE.cambios, TALLER, DEL_CHAT_CAMBIA, DEL_CHAT_NUEVA] };
    const delAgente = (clave: string, title: string, weekIndex: number, fase = "c"): CambioTareaNueva => ({
      ...DE_LA_IA_ANTES,
      clave,
      fase,
      tarea: { ...DE_LA_IA_ANTES.tarea, title, weekIndex },
    });
    /* ⚠ ACTUALIZADA antes del push (2026-09-26), con esta razón: «t:ia-flujos» le daba al agente el título NUEVO
       («Probar los flujos de venta»), que solo conoce el chat. El agente arma desde lo vivo y repite el título VIVO
       («Probar flujos»): con esa entrada la guarda quedaba en verde y el duplicado real pasaba. */
    const recalculadas = [
      delAgente("t:ia-taller-otra-vez", "Taller de requerimientos.", 1), // la misma, con un punto de más
      delAgente("t:ia-revision", "Revisión conjunta", 1), // la que dictó el chat
      delAgente("t:ia-flujos", "Probar flujos", 2), // la viva que el chat renombró, como la VIO el agente
      delAgente("t:ia-guiadas", "Pruebas guiadas", 2),
      delAgente("t:ia-en-otra-fase", "Taller de requerimientos", 1, "b"), // otra fase: no es la misma
    ];
    const mezcla = mezclarTareasDeFases(conTaller.cambios, recalculadas, new Set(["b", "c"]));
    const claves = mezcla.map((c) => c.clave);
    expect(claves, "el recálculo metió otra vez la tarea que el chat retocó").not.toContain("t:ia-taller-otra-vez");
    expect(claves, "el recálculo metió otra vez la tarea que dictó el chat").not.toContain("t:ia-revision");
    expect(claves, "el recálculo metió otra vez la tarea viva que el chat renombró").not.toContain("t:ia-flujos");
    expect(claves).toEqual(expect.arrayContaining(["t:ia-taller", "t:ia-guiadas", "t:ia-en-otra-fase", "tarea:c1:cambia", "t:del-chat"]));
    expect(mezcla.find((c) => c.clave === TALLER.clave), "la retocada es la que queda, con su retoque").toEqual(TALLER);

    // Una sesión que se repite cada semana: la retocada se lleva UNA sola (la de su semana), no todas.
    const SEGUIMIENTO: CambioTareaNueva = {
      ...TALLER,
      clave: "t:ia-seguimiento-s2",
      tarea: { ...TALLER.tarea, title: "Sesión de seguimiento", weekIndex: 2 },
    };
    const semanales = [1, 2, 3].map((s) => delAgente(`t:seg-s${s}`, "Sesión de seguimiento", s));
    const conSemanales = mezclarTareasDeFases([...BASE.cambios, SEGUIMIENTO], semanales, new Set(["c"])).map((c) => c.clave);
    expect(conSemanales.filter((k) => k.startsWith("t:seg-")), "se perdieron las otras semanas de la sesión").toEqual(["t:seg-s1", "t:seg-s3"]);

    // El paso 2 (fusionarDetalle) hace lo mismo.
    const r = cambios(
      salida([{ id: "c", tasks: [{ title: "Taller de requerimientos", weekIndex: 1 }, { title: "Pruebas de aceptación", weekIndex: 3 }] }]),
      { borrador: conTaller },
    );
    const b = fusionarDetalle(conTaller, r, "run-2");
    const titulos = b.cambios.flatMap((c) => (c.tipo === "tarea-nueva" && c.fase === "c" ? [c.tarea.title] : []));
    expect(titulos.filter((t) => t === "Taller de requerimientos"), "el paso 2 dejó dos «Taller de requerimientos»").toHaveLength(1);
    expect(titulos).toContain("Pruebas de aceptación");
    expect(b.cambios.find((c) => c.clave === TALLER.clave)).toEqual(TALLER);
  });

  /** Una tarea nueva (de la IA, salvo `extra`) en «Pruebas» o en la fase que se diga. */
  const nueva = (clave: string, title: string, weekIndex: number, extra: Partial<CambioTareaNueva> = {}): CambioTareaNueva => ({
    ...DE_LA_IA_ANTES,
    clave,
    tarea: { ...DE_LA_IA_ANTES.tarea, title, weekIndex },
    ...extra,
  });
  const claves = (cs: ReadonlyArray<{ clave: string }>) => cs.map((c) => c.clave);
  const delAgenteEn = (cs: ReadonlyArray<{ clave: string }>) => claves(cs).filter((k) => k.startsWith("t:ag-"));

  it("⛔ revisión antes del push · el filtro no saca una tarea legítima: una sesión semanal conserva sus semanas", () => {
    /* El filtro se llevaba la PRIMERA del agente con el mismo título en CUALQUIER semana, y con una sesión que se
       repite cada semana sacaba una que no era duplicado, sin aviso. Las ediciones que la ponen en rojo: volver a
       emparejar en otra semana sin mirar si hay varias (A y B pierden la S1), aplicarlo a lo que AGREGÓ el chat
       (A pierde la S1), o volver a la huella cortada a 60 caracteres (se va la de postventa). */
    const semanales = [1, 2, 3].map((s) => nueva(`t:ag-s${s}`, "Sesión de seguimiento", s));

    // (A) El chat AGREGA la S4 a una fase con S1–S3 de la IA; el recálculo devuelve S1–S3: no se va ninguna.
    const a = mezclarTareasDeFases([...BASE.cambios, nueva("t:chat-s4", "Sesión de seguimiento", 4, { porChat: true })], semanales, new Set(["c"]));
    expect(delAgenteEn(a), "(A) el chat agregó la S4 y el recálculo perdió la S1").toEqual(["t:ag-s1", "t:ag-s2", "t:ag-s3"]);
    expect(claves(a)).toContain("t:chat-s4");
    // Lo que agregó el chat sí se reconoce en su MISMA semana (la S2 del agente repite la S2 del chat).
    const a2 = mezclarTareasDeFases([...BASE.cambios, nueva("t:chat-s2", "Sesión de seguimiento", 2, { porChat: true })], semanales, new Set(["c"]));
    expect(delAgenteEn(a2)).toEqual(["t:ag-s1", "t:ag-s3"]);
    // Y en otra semana no, aunque el agente tenga UNA sola con ese título: el chat la agregó, el agente no la repite.
    const a3 = mezclarTareasDeFases(
      [...BASE.cambios, nueva("t:chat-cierre", "Sesión de cierre", 4, { porChat: true })],
      [nueva("t:ag-cierre", "Sesión de cierre", 2)],
      new Set(["c"]),
    );
    expect(delAgenteEn(a3), "lo que agregó el chat se llevó una del agente de otra semana").toEqual(["t:ag-cierre"]);

    // (B) El chat pasó una retocada de la S2 a la S5: tres del agente con ese título y ninguna en la S5 → no se saca ninguna.
    const b = mezclarTareasDeFases([...BASE.cambios, nueva("t:ret-s5", "Sesión de seguimiento", 5, { retocada: true })], semanales, new Set(["c"]));
    expect(delAgenteEn(b), "(B) la retocada pasó a la S5 y el recálculo perdió la S1").toEqual(["t:ag-s1", "t:ag-s2", "t:ag-s3"]);
    expect(claves(b)).toContain("t:ret-s5");
    // Sin dudas (UNA sola del agente con ese título en la fase), la retocada que cambió de semana sí se la lleva.
    const sinDudas = mezclarTareasDeFases(
      [...BASE.cambios, nueva("t:ret-taller", "Taller de cierre", 3, { retocada: true })],
      [nueva("t:ag-taller", "Taller de cierre", 1), nueva("t:ag-guiadas", "Pruebas guiadas", 1)],
      new Set(["c"]),
    );
    expect(delAgenteEn(sinDudas), "la retocada que cambió de semana quedó repetida").toEqual(["t:ag-guiadas"]);

    // El título COMPLETO: dos largos que comparten los primeros 60 caracteres no son la misma tarea.
    const VENTAS = "Configurar las propiedades personalizadas del objeto Negocios para ventas";
    const POSTVENTA = "Configurar las propiedades personalizadas del objeto Negocios para postventa";
    const largas = mezclarTareasDeFases(
      [...BASE.cambios, nueva("t:ret-ventas", VENTAS, 1, { retocada: true })],
      [nueva("t:ag-postventa", POSTVENTA, 1), nueva("t:ag-ventas", VENTAS, 2)],
      new Set(["c"]),
    );
    expect(delAgenteEn(largas), "se fue la de postventa por compartir el comienzo del título").toEqual(["t:ag-postventa"]);
  });

  it("⛔ revisión antes del push · la viva que el chat renombró, mudó o quitó: el agente la repite como la VIO y no entra", () => {
    /* El agente arma desde lo vivo (`estructuraHipotetica` descarta los cambios de tareas): ve «Probar flujos» en
       «Pruebas», S2, aunque el chat la haya renombrado o mudado, y ve «Mapear procesos» aunque el chat la quite.
       Como el chat la tocó, no es reemplazable y lo que el agente repite entra como «+ tarea nueva». El filtro
       comparaba solo con el título y la fase de DESTINO: «Aplicar todo» dejaba la renombrada y otra con el nombre
       viejo, o borraba la quitada y la volvía a crear. La edición que la pone en rojo: comparar solo con lo que
       DEJA el cambio (sin lo que vio el agente: `desde` y la fase de origen). */
    // Renombrada: el paso 2 entero, desde lo que devolvió el agente.
    const conRenombre: Borrador = { ...BASE, cambios: [...BASE.cambios, DEL_CHAT_CAMBIA] };
    const r = cambios(
      salida([{ id: "c", tasks: [{ title: "Probar flujos", weekIndex: 2 }, { title: "Pruebas guiadas", weekIndex: 2 }] }]),
      { borrador: conRenombre },
    );
    expect(resumen(r, "c"), "la precondición: lo que el agente repite entra como nueva").toContain("+Probar flujos@2");
    const b = fusionarDetalle(conRenombre, r, "run-2");
    const titulosEnC = b.cambios.flatMap((c) => (c.tipo === "tarea-nueva" && c.fase === "c" ? [c.tarea.title] : []));
    expect(titulosEnC, "quedó la renombrada y otra con el nombre viejo").not.toContain("Probar flujos");
    expect(titulosEnC).toContain("Pruebas guiadas");
    expect(b.cambios.find((c) => c.clave === DEL_CHAT_CAMBIA.clave)).toEqual(DEL_CHAT_CAMBIA);
    // En otra semana también, sin dudas (UNA sola «Probar flujos» del agente en la fase).
    const otraSemana = mezclarTareasDeFases([...BASE.cambios, DEL_CHAT_CAMBIA], [nueva("t:ag-flujos-s1", "Probar flujos", 1)], new Set(["c"]));
    expect(delAgenteEn(otraSemana), "la renombrada volvió con el nombre viejo en otra semana").toEqual([]);

    // Mudada de «Pruebas» a «Diseño», y se recalcula «Pruebas».
    const MUDADA: CambioTareaCambia = { ...DEL_CHAT_CAMBIA, clave: "tarea:c1:cambia-fase", a: { fase: "b" } };
    const mudada = mezclarTareasDeFases(
      [...BASE.cambios, MUDADA],
      [nueva("t:ag-flujos", "Probar flujos", 2), nueva("t:ag-guiadas", "Pruebas guiadas", 2)],
      new Set(["c"]),
    );
    expect(delAgenteEn(mudada), "la mudada volvió a su fase de origen").toEqual(["t:ag-guiadas"]);
    expect(claves(mudada)).toContain(MUDADA.clave);

    // Quitada por el chat: el paso 2 no la vuelve a proponer.
    const conQuitada: Borrador = { ...BASE, cambios: [...BASE.cambios, DEL_CHAT_SE_VA] };
    const rq = cambios(
      salida([{ id: "b", tasks: [{ title: "Mapear procesos", weekIndex: 0 }, { title: "Definir pipeline de ventas", weekIndex: 1 }] }]),
      { borrador: conQuitada },
    );
    expect(resumen(rq, "b"), "la precondición: lo que el agente repite entra como nueva").toContain("+Mapear procesos@0");
    const bq = fusionarDetalle(conQuitada, rq, "run-2");
    const titulosEnB = bq.cambios.flatMap((c) => (c.tipo === "tarea-nueva" && c.fase === "b" ? [c.tarea.title] : []));
    expect(titulosEnB, "el chat la quitó y la IA la volvió a proponer").not.toContain("Mapear procesos");
    expect(titulosEnB).toContain("Definir pipeline de ventas");
    expect(bq.cambios.find((c) => c.clave === DEL_CHAT_SE_VA.clave)).toEqual(DEL_CHAT_SE_VA);
  });
});

/* L7 (§8.2, 2026-09-26): la mudanza que SUGIERE la IA (una hecha que parece de otra fase) nace sin marcar y la decide el
   CSE con su casilla. Las fusiones la CONSERVAN (`seConserva`): si no, una vuelta del paso 2 o el recálculo de su fase la
   borraban, y su clave quedaba huérfana en `excluidos`. */
describe("8 · L7: las mudanzas sugeridas sobreviven a las fusiones", () => {
  /** «Firmar el acta» (hecha, en Kick-off) que la IA sugiere mudar a «Pruebas». */
  const SUGERIDA: CambioTareaCambia = {
    tipo: "tarea-cambia",
    clave: "tarea:a2:cambia",
    tareaId: "a2",
    faseId: "a",
    desde: fotoDeTarea(A2),
    a: { fase: "c" },
    motivo: "Parece de «Pruebas»",
    sugerida: "otra-fase",
  };
  const CON_SUGERIDA: Borrador = { ...BASE, cambios: [...BASE.cambios, SUGERIDA], excluidos: [SUGERIDA.clave] };
  const huerfanas = (b: Pick<Borrador, "cambios" | "excluidos">) => {
    const claves = new Set(b.cambios.map((c) => c.clave));
    return (b.excluidos ?? []).filter((k) => !claves.has(k));
  };
  const deLaIa = (clave: string, fase: string, title: string, weekIndex: number): CambioTareaNueva => ({
    tipo: "tarea-nueva",
    clave,
    fase,
    tarea: { title, weekIndex, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
  });

  it("⭐ `fusionarDetalle` la conserva, sin clave huérfana en `excluidos`", () => {
    /* La edición que la pone en rojo: no sumarla a `seConserva` (queda solo `loTocoElChat`): la fusión la borra y
       «tarea:a2:cambia» queda en `excluidos` sin su cambio. */
    const r = cambios(
      salida([
        { id: "a", tasks: [{ title: "Presentar el equipo", weekIndex: 0 }] },
        { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 2 }] },
      ]),
      { borrador: CON_SUGERIDA },
    );
    const b = fusionarDetalle(CON_SUGERIDA, r, "run-2");
    expect(b.cambios.find((c) => c.clave === SUGERIDA.clave), "la fusión borró la mudanza sugerida").toEqual(SUGERIDA);
    expect(b.cambios.filter((c) => c.clave === SUGERIDA.clave)).toHaveLength(1);
    expect(b.excluidos, "nació desmarcada y tiene que seguir así").toEqual([SUGERIDA.clave]);
    expect(huerfanas(b)).toEqual([]);
  });

  it("⭐ `mezclarTareasDeFases` (el recálculo de su fase de origen, de su destino o de las dos) la conserva", () => {
    /* La edición que la pone en rojo: la misma (sin `seConserva`, el recálculo de «Kick-off» se la lleva). */
    for (const fases of [["a"], ["c"], ["a", "c"]]) {
      const recalculadas = [deLaIa("t:ia-a", "a", "Presentar el equipo", 0), deLaIa("t:ia-c", "c", "Pruebas guiadas", 2)].filter((n) =>
        fases.includes(n.fase),
      );
      const mezcla = mezclarTareasDeFases(CON_SUGERIDA.cambios, recalculadas, new Set(fases));
      expect(mezcla.find((c) => c.clave === SUGERIDA.clave), `el recálculo de ${fases.join("+")} se llevó la sugerida`).toEqual(SUGERIDA);
      const b = fusionarRecalculo(CON_SUGERIDA, {
        tareas: recalculadas,
        armadas: Object.fromEntries(fases.map((f) => [f, { nombre: f, semanas: 3 }])),
        escritas: fases,
        fallidas: [],
        motivo: null,
        observaciones: [],
      });
      expect(huerfanas(b)).toEqual([]);
      expect(b.excluidos).toEqual([SUGERIDA.clave]);
    }
  });
});

describe("9 · M2: un kickoff, el cierre y la entrega sin duplicados, y la IA no repite lo que se queda (R14, R15)", () => {
  /* Pedido de Elías (2026-09-27): en Wherex la propuesta sumaba un kickoff con otras palabras (ya había tres) y la IA
     repetía lo que ya estaba. Estos casos pasan `hitos`, como las fusiones desde M2 P2c. */
  const SIN_CAMBIOS: Borrador = { ...BASE, cambios: [] };
  /** El recorrido con `hitos`, sobre un vivo propio (la estructura es la del vivo, sin cambios de fases). */
  function conHitos(
    vivo: Vivo,
    fases: Array<{ id: string; tasks: TareaCruda[] }>,
    opciones: { recurrente?: boolean; conSemanaCero?: boolean; soloFases?: ReadonlySet<string>; borrador?: Borrador } = {},
  ) {
    const borrador = opciones.borrador ?? SIN_CAMBIOS;
    const estructura = estructuraHipotetica(vivo, borrador);
    const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({ estructura, analysisJson: salida(fases), huellas: null, cortado: false });
    return cambiosDeTareasDelDetalle({
      estructura,
      vivo,
      propuestas,
      borrador,
      tags: [],
      nuevaClave,
      idsDesconocidos,
      soloFases: opciones.soloFases ?? null,
      respetarTerminadas: !opciones.soloFases,
      hitos: { recurrente: opciones.recurrente ?? false, conSemanaCero: opciones.conSemanaCero ?? true },
    });
  }
  const sesion = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}) =>
    tarea(id, title, weekIndex, { type: "SESSION", ...extra });
  const nuevasDe = (r: CambiosDelDetalle) => r.tareas.flatMap((c) => (c.tipo === "tarea-nueva" ? [c] : []));
  const seVanDe = (r: CambiosDelDetalle) => r.tareas.flatMap((c) => (c.tipo === "tarea-se-va" ? [c] : []));

  /** Wherex, con los títulos reales (cliente anonimizado): dos kickoffs hechos y uno pendiente en la Semana 0. */
  const K1 = sesion("k1", "Sesión de kickoff: equipo, roles y accesos", 0, { status: "DONE" });
  const K2 = sesion("k2", "Sesión de kick-off formal del proyecto", 0, { status: "DONE" });
  const K3 = sesion("k3", "Sesión de kick-off del proyecto", 0);
  const X1 = tarea("x1", "Recolección de accesos y credenciales", 1);
  const E1 = sesion("e1", "Entrega formal del proyecto a Cliente", 0);
  const C1 = sesion("cj1", "Sesión de cierre con junta directiva", 0);
  const WHEREX: Vivo = {
    ancla: null,
    fases: [
      fase("s0", "Semana 0", 2, [K1, K2, K3, X1], { status: "IN_PROGRESS" }),
      fase("sh", "Sales Hub", 4, [tarea("sh1", "Configurar el pipeline de ventas", 0)]),
      fase("ce", "Cierre y entrega", 1, [E1]),
      fase("cj", "Cierre con junta directiva", 1, [C1]),
    ],
  };
  const KICKOFF_CON_OTRAS_PALABRAS = { title: "Sesión de kick-off con el equipo Cliente", type: "SESSION", weekIndex: 0 };
  const OBS_KICKOFF_REPETIDO =
    "La IA volvió a proponer el kickoff: no se suma, ya está «Sesión de kickoff: equipo, roles y accesos» (hecho).";
  const OBS_DOS_HECHOS =
    "Hay 2 kickoffs hechos en «Semana 0»: «Sesión de kickoff: equipo, roles y accesos» y «Sesión de kick-off formal del proyecto». Si son la misma sesión, borra la segunda desde su fila del cronograma.";

  it("⭐ Wherex: se quita el kickoff pendiente (lo decide el sistema), el de otras palabras no entra y se nombran los dos hechos", () => {
    /* La edición que la pone en rojo: reconocer el kickoff por `huellaCompleta` contra los que ya están (el de otras
       palabras entra), o no nombrar los hechos de más (falta la segunda observación). */
    const r = conHitos(WHEREX, [
      { id: "s0", tasks: [KICKOFF_CON_OTRAS_PALABRAS, { title: "Recolección de accesos y credenciales", weekIndex: 1 }] },
    ]);
    expect(r.tareas).toEqual([
      {
        tipo: "tarea-se-va",
        clave: "tarea:k3:se-va",
        tareaId: "k3",
        faseId: "s0",
        desde: fotoDeTarea(K3),
        motivo: "Ya hay un kickoff hecho: «Sesión de kickoff: equipo, roles y accesos».",
        delSistema: "hito",
      },
    ]);
    expect(r.observaciones).toEqual([OBS_KICKOFF_REPETIDO, OBS_DOS_HECHOS]);
  });

  it("sin `hitos`, como antes: el pendiente se va por R2 como uno más y el de otras palabras entra", () => {
    const r = cambios(salida([{ id: "s0", tasks: [KICKOFF_CON_OTRAS_PALABRAS] }]), { vivo: WHEREX, visto: WHEREX, borrador: SIN_CAMBIOS });
    expect(resumen(r, "s0")).toEqual(["-k3", "-x1", "+Sesión de kick-off con el equipo Cliente@0"]);
    expect(seVanDe(r).every((c) => c.delSistema === undefined && c.motivo === undefined)).toBe(true);
  });

  it("⛔ el sobrante solo si el guardián también es kickoff: con «Kickoff interno» hecho, el pendiente se queda", () => {
    /* La edición que la pone en rojo: quitar sin mirar los negativos (sin `NO_ES_EL_HITO`, el interno guarda y el
       pendiente sobra). */
    const vivo: Vivo = {
      ancla: null,
      fases: [fase("s0", "Semana 0", 1, [sesion("int", "Kickoff interno del equipo", 0, { status: "DONE" }), K3])],
    };
    const r = conHitos(vivo, [{ id: "s0", tasks: [{ title: "Revisar el alcance firmado", weekIndex: 0 }] }]);
    expect(resumen(r)).toEqual(["+Revisar el alcance firmado@0"]);
    expect(r.observaciones).toEqual([]);
  });

  it("⛔ el guardián pendiente de la IA que la IA no repite se queda (R2 no lo reemplaza)", () => {
    /* La edición que la pone en rojo: dejar el guardián en `reemplazables` (se iría como cualquier pendiente). */
    const vivo: Vivo = { ancla: null, fases: [fase("s0", "Semana 0", 1, [K3]), fase("ce", "Cierre y entrega", 1, [E1])] };
    const r = conHitos(vivo, [
      { id: "s0", tasks: [{ title: "Revisar el alcance firmado", weekIndex: 0 }] },
      { id: "ce", tasks: [{ title: "Preparar el acta de cierre", weekIndex: 0 }] },
    ]);
    expect(resumen(r)).toEqual(["+Revisar el alcance firmado@0", "+Preparar el acta de cierre@0"]);
    expect(r.observaciones).toEqual([]);
  });

  describe("el kickoff que falta", () => {
    const SIN_KICKOFF: Vivo = {
      ancla: null,
      fases: [fase("s0", "Semana 0", 1, [tarea("r0", "Recolección de accesos", 0)]), fase("d", "Diseño", 2, [])],
    };
    const PROPUESTA = [
      { id: "s0", tasks: [{ title: "Recolección de accesos", weekIndex: 0 }, { title: "Revisar el alcance firmado", weekIndex: 0 }] },
      { id: "d", tasks: [{ title: "Mapear procesos", weekIndex: 0 }] },
    ];

    it("⭐ con Semana 0 sin avance: el sistema agrega UNO, al final de la Semana 0, marcado y con su motivo", () => {
      /* La edición que la pone en rojo: no agregarlo, o agregarlo sin la marca del sistema. */
      const r = conHitos(SIN_KICKOFF, PROPUESTA);
      expect(resumen(r)).toEqual(["+Revisar el alcance firmado@0", "+Sesión de kickoff del proyecto@0", "+Mapear procesos@0"]);
      const kickoff = nuevasDe(r)[1];
      expect(kickoff).toMatchObject({ fase: "s0", tarea: { ...TAREA_DE_KICKOFF, hito: ["kickoff"] }, motivo: MOTIVO_DEL_KICKOFF_QUE_FALTA, delSistema: "hito" });
      expect(r.observaciones).toEqual([]);
    });

    it("⛔ con la Semana 0 empezada no lo agrega: lo dice", () => {
      /* La edición que la pone en rojo: agregarlo sin mirar si la Semana 0 empezó (inventaría una fecha pasada). */
      const empezada: Vivo = {
        ...SIN_KICKOFF,
        fases: [fase("s0", "Semana 0", 1, [tarea("r0", "Recolección de accesos", 0, { status: "DONE" })]), SIN_KICKOFF.fases[1]],
      };
      const r = conHitos(empezada, [
        { id: "s0", tasks: [{ title: "Revisar el alcance firmado", weekIndex: 0 }] },
        { id: "d", tasks: [{ title: "Mapear procesos", weekIndex: 0 }] },
      ]);
      expect(nuevasDe(r).map((c) => c.tarea.title)).toEqual(["Revisar el alcance firmado", "Mapear procesos"]);
      expect(r.observaciones).toEqual([OBSERVACION_SIN_KICKOFF]);
    });

    it("⛔ en un Desarrollo (sin Semana 0) no lo agrega ni lo dice", () => {
      /* La edición que la pone en rojo: elegir la Semana 0 sin `conSemanaCero` (su primera fase es trabajo real). */
      const r = conHitos(SIN_KICKOFF, PROPUESTA, { conSemanaCero: false });
      expect(nuevasDe(r).some((c) => c.delSistema === "hito")).toBe(false);
      expect(r.observaciones).toEqual([]);
    });

    it("⭐ dos kickoffs de la IA en fases distintas, sin guardián: entra el primero, marcado; el sistema no agrega otro", () => {
      /* La edición que la pone en rojo: no sumar el que entra como guardián (entrarían los dos). */
      const r = conHitos(SIN_KICKOFF, [
        { id: "s0", tasks: [{ title: "Sesión de kick-off del proyecto", type: "SESSION", weekIndex: 0 }] },
        { id: "d", tasks: [{ title: "Reunión de arranque con el equipo", type: "SESSION", weekIndex: 0 }] },
      ]);
      expect(nuevasDe(r).map((c) => [c.tarea.title, c.tarea.hito])).toEqual([["Sesión de kick-off del proyecto", ["kickoff"]]]);
      expect(r.observaciones).toEqual(["La IA propuso el kickoff más de una vez: entra solo «Sesión de kick-off del proyecto»."]);
    });
  });

  it("⛔ lo escrito a mano se queda y se nombra; un sobrante que tocó el chat no se toca", () => {
    /* La edición que la pone en rojo: quitar un kickoff pendiente escrito a mano, o quitar el sobrante que el chat ya
       cambió (tendría dos cambios con la misma tarea). */
    const aMano = sesion("h1", "Sesión de kick-off del proyecto", 0, { source: "HUMAN" });
    const vivo: Vivo = { ancla: null, fases: [fase("s0", "Semana 0", 2, [sesion("k0", "Sesión de kickoff oficial", 0, { status: "DONE" }), aMano])] };
    const r = conHitos(vivo, [{ id: "s0", tasks: [{ title: "Revisar el alcance firmado", weekIndex: 1 }] }]);
    expect(resumen(r)).toEqual(["+Revisar el alcance firmado@1"]);
    expect(r.observaciones).toEqual(["«Sesión de kick-off del proyecto» repite el kickoff, pero la escribió una persona: no se quita."]);

    const delChat: CambioTareaCambia = {
      tipo: "tarea-cambia",
      clave: claveDeTareaQueCambia("k3"),
      tareaId: "k3",
      faseId: "s0",
      desde: fotoDeTarea(K3),
      a: { weekIndex: 1 },
      porChat: true,
    };
    const conElChat = conHitos(WHEREX, [{ id: "s0", tasks: [{ title: "Recolección de accesos y credenciales", weekIndex: 1 }] }], {
      borrador: { ...SIN_CAMBIOS, cambios: [delChat] },
    });
    expect(seVanDe(conElChat)).toEqual([]);
  });

  it("⛔ el alcance: con «Regenerar» de otra fase, el sobrante de la Semana 0 se queda y un kickoff nuevo no entra", () => {
    /* La edición que la pone en rojo: quitar los sobrantes fuera de las fases del alcance. */
    const r = conHitos(
      WHEREX,
      [{ id: "sh", tasks: [{ title: "Sesión de kickoff oficial del proyecto", type: "SESSION", weekIndex: 0 }, { title: "Configurar el pipeline de ventas", weekIndex: 0 }] }],
      { soloFases: new Set(["sh"]) },
    );
    expect(r.tareas).toEqual([]);
    expect(r.observaciones).toEqual([OBS_KICKOFF_REPETIDO]); // los dos hechos son de la Semana 0: fuera del alcance
  });

  it("⛔ «Sesión de cierre y entrega» no entra si ya hay entrega, aunque falte el cierre: la observación dice «la entrega»", () => {
    /* La edición que la pone en rojo: dejarla entrar porque le falta uno de sus dos hitos. */
    const vivo: Vivo = { ancla: null, fases: [fase("sh", "Sales Hub", 2, []), fase("ce", "Cierre y entrega", 1, [E1])] };
    const r = conHitos(vivo, [{ id: "ce", tasks: [{ title: "Sesión de cierre y entrega del proyecto", type: "SESSION", weekIndex: 0 }] }], {
      conSemanaCero: false,
    });
    expect(r.tareas).toEqual([]);
    expect(r.observaciones).toEqual(["La IA volvió a proponer la entrega: no se suma, ya está «Entrega formal del proyecto a Cliente» (pendiente)."]);
  });

  it("⛔ el paso 1 agrega una fase al final: el cierre de la que ERA la última sigue de guardián y uno nuevo en la agregada no entra", () => {
    /* Revisión de M1–M5 (2026-09-27, hallazgo 4). La edición que la pone en rojo: medir la «última fase» solo sobre la
       estructura supuesta (sin `ultimaViva`): con «Soporte post-lanzamiento» detrás, «Capacitación & Go Live» dejaba de
       ser fase de hito, su cierre perdía al guardián y «Sesión de cierre y entrega del proyecto» entraba en la agregada
       (Metzger, SICOP y Spectrum: un segundo cierre y una segunda entrega). */
    const CIERRE = sesion("ci", "Sesión de cierre del proyecto", 1);
    const vivo: Vivo = {
      ancla: null,
      fases: [fase("on", "Onboarding", 2, [tarea("on1", "Configurar portal", 0)]), fase("go", "Capacitación & Go Live", 2, [CIERRE])],
    };
    const SOPORTE: CambioFaseNueva = {
      tipo: "fase-nueva",
      clave: "n:0000soporte",
      fase: { name: "Soporte post-lanzamiento", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
      despuesDe: "go",
    };
    const r = conHitos(vivo, [{ id: "n:0000soporte", tasks: [{ title: "Sesión de cierre y entrega del proyecto", type: "SESSION", weekIndex: 1 }] }], {
      conSemanaCero: false,
      borrador: { ...SIN_CAMBIOS, cambios: [SOPORTE] },
    });
    expect(nuevasDe(r), "entró un segundo cierre en la fase agregada").toEqual([]);
    expect(r.observaciones).toEqual(["La IA volvió a proponer el cierre: no se suma, ya está «Sesión de cierre del proyecto» (pendiente)."]);
    // Sin la fase agregada, lo mismo (como siempre).
    const sinFase = conHitos(vivo, [{ id: "go", tasks: [{ title: "Sesión de cierre del proyecto", type: "SESSION", weekIndex: 1 }, { title: "Sesión de cierre y entrega del proyecto", type: "SESSION", weekIndex: 1 }] }], {
      conSemanaCero: false,
    });
    expect(nuevasDe(sinFase)).toEqual([]);
  });

  describe("D8 · la entrega por ciclo en un recurrente", () => {
    const ENTREGA_C1 = sesion("ec1", "Sesión de entrega del ciclo 1", 0);
    const CON_ENTREGA: Vivo = {
      ancla: null,
      fases: [
        fase("f1", "Entrega inicial de accesos", 1, []),
        fase("c1", "Cierre ciclo 1", 1, [ENTREGA_C1]),
        fase("f2", "Operación ciclo 2", 2, []),
        fase("f3", "Fase 3", 1, []),
      ],
    };
    const PROPUESTA = [
      { id: "f1", tasks: [{ title: "Sesión de entrega formal del proyecto", type: "SESSION", weekIndex: 0 }] },
      { id: "c1", tasks: [{ title: "Revisar indicadores del ciclo", weekIndex: 0 }] },
      { id: "f3", tasks: [{ title: "Sesión de entrega del ciclo 2", type: "SESSION", weekIndex: 0 }] },
    ];

    it("⭐ con una entrega existente: en su ciclo no entra otra, en el siguiente sí; sin el tag, ninguna; y la existente nunca se va", () => {
      /* La edición que la pone en rojo: calcular el ciclo sin el tag (sin él, la de la Fase 3 entraría), o quitar la
         entrega existente (que la IA no repitió) por R2. */
      const rec = conHitos(CON_ENTREGA, PROPUESTA, { recurrente: true, conSemanaCero: false });
      expect(resumen(rec)).toEqual(["+Revisar indicadores del ciclo@0", "+Sesión de entrega del ciclo 2@0"]);
      expect(nuevasDe(rec)[1].tarea.hito).toEqual(["entrega"]);
      expect(rec.observaciones).toEqual(["La IA volvió a proponer la entrega: no se suma, ya está «Sesión de entrega del ciclo 1» (pendiente)."]);
      const sinTag = conHitos(CON_ENTREGA, PROPUESTA, { conSemanaCero: false });
      expect(resumen(sinTag)).toEqual(["+Revisar indicadores del ciclo@0"]);
      expect(seVanDe(rec)).toEqual([]);
      expect(seVanDe(sinTag)).toEqual([]);
    });

    it("⭐ sin ninguna entrega, la IA propone la de dos ciclos en la misma corrida: entran las dos", () => {
      /* La edición que la pone en rojo: tomar el ciclo de lo que YA existe (calculado antes del recorrido): las dos
         caerían en el ciclo 1 y la segunda no entraría. */
      const vivo: Vivo = {
        ancla: null,
        fases: [fase("f1", "Operación ciclo 1", 2, []), fase("c1", "Cierre ciclo 1", 1, []), fase("f2", "Operación ciclo 2", 2, []), fase("c2", "Cierre ciclo 2", 1, [])],
      };
      const r = conHitos(
        vivo,
        [
          { id: "c1", tasks: [{ title: "Sesión de entrega del ciclo 1", type: "SESSION", weekIndex: 0 }] },
          { id: "c2", tasks: [{ title: "Sesión de entrega del ciclo 2", type: "SESSION", weekIndex: 0 }] },
        ],
        { recurrente: true, conSemanaCero: false },
      );
      expect(resumen(r)).toEqual(["+Sesión de entrega del ciclo 1@0", "+Sesión de entrega del ciclo 2@0"]);
      expect(r.observaciones).toEqual([]);
    });
  });

  it("⭐ R14 · no entra lo que repite algo que se queda; lo hecho en otra semana y una sesión semanal, sí", () => {
    /* La edición que la pone en rojo: comparar contra una HECHA en otra semana («Revisión con el sponsor» no entraría)
       o comparar sin ambigüedad (la S5 de la sesión semanal no entraría). */
    const semanal = [1, 2, 3, 4].map((w) => tarea(`w${w}`, "Sesión semanal de avance", w, { source: "HUMAN" }));
    const vivo: Vivo = {
      ancla: null,
      fases: [
        fase("d", "Diseño", 6, [
          tarea("rs", "Revisión con el sponsor", 1, { status: "DONE" }),
          tarea("tp", "Taller de procesos", 2, { status: "DONE" }),
          tarea("vf", "Validar el flujo con ventas", 2, { source: "HUMAN" }),
          tarea("dd", "Documentar decisiones", 3),
          ...semanal,
        ]),
      ],
    };
    const r = conHitos(
      vivo,
      [
        {
          id: "d",
          tasks: [
            { title: "Taller de procesos", weekIndex: 2 }, // la hecha, en su misma semana: no entra
            { title: "Revisión con el sponsor", weekIndex: 4 }, // la hecha es de otra semana: entra
            { title: "Sesión semanal de avance", weekIndex: 5 }, // cuatro con ese título: no se adivina, entra
            { title: "Validar el flujo con ventas", weekIndex: 4 }, // UNA pendiente que se queda, en otra semana: no entra
            { title: "Documentar decisiones", weekIndex: 3 }, // la que se iría, idéntica (R4b): no emite nada
          ],
        },
      ],
      { conSemanaCero: false },
    );
    expect(resumen(r)).toEqual(["+Revisión con el sponsor@4", "+Sesión semanal de avance@5"]);
    expect(r.observaciones).toEqual(["No entran 2 tareas de la IA: repiten una que ya está."]);
  });
});

describe("10 · M3: lo que ya pasó no se reescribe (R13)", () => {
  /* Pedido de Elías (2026-09-27, decisión (a)): en «Regenerar todo» lo pendiente de semanas que ya pasaron se avisa, no se
     reescribe. Ayer la propuesta de Wherex quitaba 50 tareas y sumaba 59 en semanas vencidas. Estos casos pasan `pasado`,
     como la fusión cuando el borrador trae `hoy` (y `hitos`, como la fusión desde M2). */
  const FX = leerFixtureGrande();
  const PASADO = { ancla: FX.ancla, hoy: new Date(FX.hoy) };
  const HITOS = { recurrente: false, conSemanaCero: true };

  /** El recorrido sobre un vivo propio (la estructura es la del vivo), con `pasado` y los hitos, como la fusión. */
  function conPasado(
    vivo: Vivo,
    fases: Array<{ id: string; tasks: TareaCruda[] }>,
    opciones: { pasado?: { ancla: string; hoy: Date } | null; hitos?: { recurrente: boolean; conSemanaCero: boolean } | null } = {},
  ) {
    const borrador: Borrador = { ...BASE, cambios: [] };
    const estructura = estructuraHipotetica(vivo, borrador);
    const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({ estructura, analysisJson: salida(fases), huellas: null, cortado: false });
    return cambiosDeTareasDelDetalle({
      estructura,
      vivo,
      propuestas,
      borrador,
      tags: [],
      nuevaClave,
      idsDesconocidos,
      respetarTerminadas: true,
      hitos: opciones.hitos === undefined ? HITOS : opciones.hitos,
      pasado: opciones.pasado === undefined ? PASADO : opciones.pasado,
    });
  }

  /** La propuesta grande: su paso 2 fusionado otra vez, con o sin `pasado` (y con los hitos, como la fusión). */
  function fusionDelFixture(pasado: { ancla: string; hoy: Date } | null | undefined) {
    const vivo = vivoDelFixture(FX);
    const borrador = borradorDelFixture(FX);
    const estructura = estructuraHipotetica(vivo, borrador);
    const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({ estructura, analysisJson: FX.paso2, huellas: null, cortado: false });
    let k = 0;
    const r = cambiosDeTareasDelDetalle({
      estructura,
      vivo,
      propuestas,
      borrador,
      tags: [],
      nuevaClave: () => `fx-${++k}`,
      idsDesconocidos,
      respetarTerminadas: true,
      hitos: HITOS,
      ...(pasado === undefined ? {} : { pasado }),
    });
    return { vivo, estructura, r };
  }

  /** Los cambios de tareas que caen en una semana que ya pasó (el predicado de la vista, sobre la estructura que vio el agente). */
  function enSemanasVencidas(vivo: Vivo, estructura: ReturnType<typeof estructuraHipotetica>, r: CambiosDelDetalle) {
    const rangos = computePhaseRanges(estructura.fases);
    const inicio = new Map(estructura.fases.map((f, k) => [f.id, rangos[k].start]));
    const semanaViva = new Map(vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, t.weekIndex] as const)));
    const vencida = (fase: string, semana: number) => semanaVencida(FX.ancla, inicio.get(fase) ?? 0, semana, PASADO.hoy);
    return {
      seVan: r.tareas.filter((c) => c.tipo === "tarea-se-va" && vencida(c.faseId, semanaViva.get(c.tareaId) ?? c.desde.weekIndex)),
      nuevas: r.tareas.filter((c) => c.tipo === "tarea-nueva" && vencida(c.fase, c.tarea.weekIndex)),
      cambian: r.tareas.filter(
        (c) =>
          c.tipo === "tarea-cambia" &&
          (vencida(faseDeLaTarea(c), c.a.weekIndex ?? c.desde.weekIndex) || vencida(c.faseId, semanaViva.get(c.tareaId) ?? c.desde.weekIndex)),
      ),
    };
  }

  const cuenta = (r: CambiosDelDetalle) => ({
    seVan: r.tareas.filter((c) => c.tipo === "tarea-se-va").length,
    nuevas: r.tareas.filter((c) => c.tipo === "tarea-nueva").length,
    cambian: r.tareas.filter((c) => c.tipo === "tarea-cambia").length,
  });

  it("⭐ la propuesta grande: 0 que se van, 0 nuevas y 0 movidas en semanas vencidas; la terminada en 0/0; lo que no entra se dice", () => {
    /* La edición que la pone en rojo: ignorar `pasado` (sin R13 salen 44 que se van y 44 nuevas en semanas vencidas).
       Las cuentas son las del código real sobre el fixture (anonimizado: ningún título es un hito, así que no hay kickoff
       que sobre, y la Semana 0 ya venció: por eso la observación del kickoff que falta). */
    const { vivo, estructura, r } = fusionDelFixture(PASADO);
    const pasadas = enSemanasVencidas(vivo, estructura, r);
    expect(pasadas.seVan.filter((c) => c.tipo === "tarea-se-va" && c.delSistema !== "hito"), "se quita algo de una semana que ya pasó").toEqual([]);
    expect(pasadas.nuevas, "entra algo nuevo en una semana que ya pasó").toEqual([]);
    expect(pasadas.cambian, "se mueve algo desde o hacia una semana que ya pasó").toEqual([]);
    expect(r.tareas.filter((c) => faseDeLaTarea(c) === FASE_TERMINADA), "la fase terminada recibe o pierde tareas").toEqual([]);
    expect(cuenta(r)).toEqual({ seVan: 5, nuevas: 13, cambian: 2 });
    expect(r.observaciones).toEqual([
      "«Fase B» está terminada: la IA no le propone tareas.",
      "2 tareas vuelven con otra nota: se conserva la nota de hoy.",
      OBSERVACION_SIN_KICKOFF,
      "No entran 51 tareas de la IA: caen en semanas que ya pasaron.",
    ]);
  });

  it("⛔ sin `pasado` el resultado es el de siempre, byte a byte (con null igual que ausente)", () => {
    /* La edición que la pone en rojo: activar R13 sin `pasado` (por ejemplo, con el ancla del vivo y la hora de ahora):
       «Regenerar» de una fase, el recálculo, «primera» y un borrador de antes del deploy se comportarían distinto. */
    const ausente = fusionDelFixture(undefined);
    const nulo = fusionDelFixture(null);
    expect(nulo.r).toEqual(ausente.r);
    const pasadas = enSemanasVencidas(ausente.vivo, ausente.estructura, ausente.r);
    expect([pasadas.seVan.length, pasadas.nuevas.length], "sin `pasado`, R13 no corre").toEqual([44, 44]);
    expect(ausente.r.tareas).toHaveLength(110);
    expect(ausente.r.observaciones.some((o) => o.includes("semanas que ya pasaron"))).toBe(false);
  });

  /* Un proyecto chico con fecha: «Semana 0» (S0–S1, ya pasó) y «Diseño» (S2–S21). Con el `hoy` fijo (S18), en «Diseño»
     vencieron los weekIndex 0 a 15. */
  const pendiente = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}) => tarea(id, title, weekIndex, extra);
  const conFecha = (s0: TareaDelVivo[], diseno: TareaDelVivo[]): Vivo => ({
    ancla: FX.ancla,
    fases: [fase("s0", "Semana 0", 2, s0, { status: "IN_PROGRESS" }), fase("d", "Diseño", 20, diseno, { status: "IN_PROGRESS" })],
  });
  const HECHA_S0 = pendiente("s0h", "Firmar el acta", 0, { status: "DONE" });
  const KICKOFF_S0 = pendiente("s0k", "Sesión de kickoff: equipo, roles y accesos", 0, { status: "DONE", type: "SESSION" });

  it("⭐ R1 después de R13: una fase a la que la IA solo le propone semanas vencidas conserva sus pendientes futuras", () => {
    /* La edición que la pone en rojo: calcular `sinPropuesta` con todo lo que propuso la IA, antes de quitar lo del
       pasado: «Definir pipeline» (S19) se iba y no entraba nada. */
    const vivo = conFecha([KICKOFF_S0, HECHA_S0], [pendiente("d1", "Mapear procesos", 1), pendiente("d2", "Definir pipeline", 17)]);
    const r = conPasado(vivo, [{ id: "d", tasks: [{ title: "Relevar el proceso actual", weekIndex: 3 }] }]);
    expect(resumen(r)).toEqual([]);
    expect(r.observaciones).toEqual(["No entra 1 tarea de la IA: cae en una semana que ya pasó."]);
    // Con algo del futuro, R2 sigue como siempre: se va lo pendiente que la IA no repite, pero no lo vencido.
    const conFuturo = conPasado(vivo, [
      { id: "d", tasks: [{ title: "Relevar el proceso actual", weekIndex: 3 }, { title: "Validar el pipeline", weekIndex: 17 }] },
    ]);
    expect(resumen(conFuturo)).toEqual(["-d2", "+Validar el pipeline@17"]);
  });

  it("⭐ la IA repite en la S20 lo pendiente de una semana vencida de su fase: no entra (lo vencido se queda y cuenta)", () => {
    /* La edición que la pone en rojo: no contar lo vencido como algo que se queda en R14: «Mapear procesos» volvía a
       entrar en la S20 y quedaban las dos. */
    const vivo = conFecha([KICKOFF_S0, HECHA_S0], [pendiente("d1", "Mapear procesos", 1), pendiente("d2", "Definir pipeline", 17)]);
    const r = conPasado(vivo, [
      { id: "d", tasks: [{ title: "Mapear procesos", weekIndex: 18 }, { title: "Definir pipeline", weekIndex: 17 }] },
    ]);
    expect(resumen(r), "la vencida se fue, o su repetición entró").toEqual([]);
    expect(r.observaciones).toEqual(["No entra 1 tarea de la IA: repite una que ya está."]);
  });

  it("⛔ el kickoff que falta: con `pasado`, solo si la semana 0 de la Semana 0 no venció (si no, se dice)", () => {
    /* La edición que la pone en rojo: mirar solo si la Semana 0 empezó (lo de M2 sin reloj): el sistema agregaba el
       kickoff en una semana que ya pasó. */
    const base = conFecha([pendiente("s0a", "Recolectar accesos", 0)], [pendiente("d2", "Definir pipeline", 17)]);
    // Una Semana 0 que nunca arrancó (ni ella ni sus tareas): sin reloj, M2 le agrega el kickoff.
    const sinKickoff: Vivo = { ...base, fases: base.fases.map((f) => (f.id === "s0" ? { ...f, status: "PENDING" } : f)) };
    const propuesta = [{ id: "d", tasks: [{ title: "Definir pipeline", weekIndex: 17 }] }];
    const r = conPasado(sinKickoff, propuesta);
    expect(r.tareas.filter((c) => c.tipo === "tarea-nueva"), "agregó un kickoff en el pasado").toEqual([]);
    expect(r.observaciones).toEqual([OBSERVACION_SIN_KICKOFF]);
    // Sin `pasado` (M2, sin reloj): la Semana 0 no empezó, así que lo agrega el sistema.
    const sinReloj = conPasado(sinKickoff, propuesta, { pasado: null });
    expect(sinReloj.tareas.filter((c) => c.tipo === "tarea-nueva" && c.delSistema === "hito")).toHaveLength(1);
    // Con la Semana 0 todavía por delante (el mismo día, un proyecto que arranca la semana que viene), también.
    const futuro = conPasado(sinKickoff, propuesta, { pasado: { ancla: "2026-09-29", hoy: PASADO.hoy } });
    expect(futuro.tareas.filter((c) => c.tipo === "tarea-nueva" && c.delSistema === "hito")).toHaveLength(1);
  });
});

describe("11 · M4 P4c: lo que corrió el código no lo reescribe la IA (D6)", () => {
  /* Spec del replanteo §5.4 (2026-09-27). La marca del paso 2 reprograma lo atrasado desde hoy (reprogramar-desde-hoy.ts,
     en el orden del plan, lo que decidió Elías) y el paso 2 llega DESPUÉS, sobre esa estructura. Las abiertas que el
     sistema corrió con su fase (las MOVIDAS) no las reemplaza la IA, R14 las cuenta en su semana nueva y las fusiones
     las conservan. Con el `hoy` fijo de las guardas: la S18. */
  const FX = leerFixtureGrande();
  const HOY = new Date(FX.hoy);
  const PASADO = { ancla: FX.ancla, hoy: HOY };
  const HITOS = { recurrente: false, conSemanaCero: true };
  /** «Semana 0» (S0–S1, hecha) · «Diseño» (S2–S5, empezó y quedó atrasado): una hecha, una pendiente y una revisión
   *  semanal · «Pruebas» (S6–S7, no empezó). */
  const VIVO_M4: Vivo = {
    ancla: FX.ancla,
    fases: [
      fase("s0", "Semana 0", 2, [tarea("k1", "Sesión de kickoff", 0, { status: "DONE", type: "SESSION" })], { status: "DONE" }),
      fase(
        "d",
        "Diseño",
        4,
        [
          tarea("d0", "Mapear procesos", 0, { status: "DONE" }),
          tarea("d1", "Definir pipeline", 1),
          tarea("d2", "Revisión semanal", 2, { type: "SESSION" }),
          tarea("d3", "Revisión semanal", 3, { type: "SESSION" }),
        ],
        { status: "IN_PROGRESS", startWeek: 2 },
      ),
      fase("p", "Pruebas", 2, [tarea("p1", "Probar flujos", 0)], { status: "PENDING", startWeek: 6 }),
    ],
  };
  /** El borrador que deja la marca: «Diseño» se estira (4 → 19) y sus tres abiertas se corren 15; «Pruebas» arranca en
   *  la S21, entera. */
  const REPROGRAMADO = (() => {
    const vacio = JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))) as Record<string, unknown>;
    const r = reprogramarDesdeHoy({ vivo: VIVO_M4, borrador: leerBorrador(vacio)!, hoy: HOY, politica: POLITICA_DE_ATRASOS, conSemanaCero: true })!;
    return leerBorrador(JSON.parse(JSON.stringify(conLaReprogramacion(vacio, r))))!;
  })();
  const movidas = (cambios: readonly Cambio[]) =>
    cambios.flatMap((c) => (c.tipo === "tarea-cambia" && c.desdeHoy ? [`${c.tareaId}@${c.a.weekIndex}`] : []));

  /** El paso 2 sobre lo reprogramado. «Regenerar todo»: con `pasado`; el recálculo: sin él y con su alcance (D3). */
  function paso2(fases: Array<{ id: string; tasks: TareaCruda[] }>, modo: "regenerar-todo" | "recalculo") {
    const estructura = estructuraHipotetica(VIVO_M4, REPROGRAMADO);
    const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({ estructura, analysisJson: salida(fases), huellas: null, cortado: false });
    return cambiosDeTareasDelDetalle({
      estructura,
      vivo: VIVO_M4,
      propuestas,
      borrador: REPROGRAMADO,
      tags: [],
      nuevaClave,
      idsDesconocidos,
      soloFases: modo === "recalculo" ? new Set(fases.map((f) => f.id)) : null,
      respetarTerminadas: modo === "regenerar-todo",
      hitos: HITOS,
      pasado: modo === "regenerar-todo" ? PASADO : null,
    });
  }

  it("el punto de partida: tres movidas en «Diseño» y «Pruebas» entera en la S21", () => {
    expect(movidas(REPROGRAMADO.cambios)).toEqual(["d1@16", "d2@17", "d3@18"]);
    const deFase = REPROGRAMADO.cambios.flatMap((c) => (c.tipo === "fase-cambia" ? [`${c.clave}→${String(c.a)}`] : []));
    expect(deFase).toEqual([`${claveDeCampo("d", "durationWeeks")}→19`, `${claveDeCampo("p", "startWeek")}→21`]);
  });

  it("⭐ una movida no sale en R2: ni en «Regenerar todo» ni en el recálculo (sin `pasado`, su semana vieja no la protege)", () => {
    /* La edición que la pone en rojo: dejarla en `reemplazables` (sin `movidasDesdeHoy`). En el recálculo salían «-d1»,
       «-d2» y «-d3»: dos cambios de la misma tarea, y «Aplicar» quitaba lo que el sistema acababa de correr. */
    const propuesta = [{ id: "d", tasks: [{ title: "Documentar decisiones", weekIndex: 18 }] }];
    expect(resumen(paso2(propuesta, "regenerar-todo"), "d")).toEqual(["+Documentar decisiones@18"]);
    expect(resumen(paso2(propuesta, "recalculo"), "d"), "el recálculo reemplazó una movida").toEqual(["+Documentar decisiones@18"]);
    // Una fase sin empezar que se mueve entera no tiene movidas: sus pendientes se reemplazan como en cualquier fase futura.
    const deLaQueSeMueve = paso2([{ id: "p", tasks: [{ title: "Probar integraciones", weekIndex: 0 }] }], "regenerar-todo");
    expect(resumen(deLaQueSeMueve, "p")).toEqual(["-p1", "+Probar integraciones@0"]);
  });

  it("⭐ R14: lo que repite una movida no entra, comparado en su semana NUEVA (también una sesión semanal)", () => {
    /* Las ediciones que la ponen en rojo: comparar con la semana vieja (sin `enSuSemana`: las revisiones de la S17 y la
       S18 no se reconocían, la sesión semanal es ambigua en otra semana, y entraban duplicadas), o dejar la movida en
       `reemplazables` (en el recálculo, «Definir pipeline» volvía como «~d1», un segundo cambio de la misma tarea). */
    const propuesta = [
      {
        id: "d",
        tasks: [
          { title: "Definir pipeline", weekIndex: 16 },
          { title: "Revisión semanal", weekIndex: 17, type: "SESSION" },
          { title: "Revisión semanal", weekIndex: 18, type: "SESSION" },
        ],
      },
    ];
    for (const modo of ["regenerar-todo", "recalculo"] as const) {
      const r = paso2(propuesta, modo);
      expect(resumen(r, "d"), `${modo}: entró lo que repite una movida`).toEqual([]);
      expect(r.observaciones, modo).toContain("No entran 3 tareas de la IA: repiten una que ya está.");
    }
    // En otra semana y sin ambigüedad, también: «Definir pipeline» en la S12 es la movida de la S16.
    const otraSemana = paso2([{ id: "d", tasks: [{ title: "Definir pipeline", weekIndex: 12 }] }], "recalculo");
    expect(resumen(otraSemana, "d")).toEqual([]);
  });

  it("⭐ la fusión conserva lo que corrió el sistema: `fusionarDetalle` y el recálculo (`mezclarTareasDeFases`)", () => {
    /* La edición que la pone en rojo: `seConserva` sin `desdeHoy`: la fusión que llega después de la marca borraba las
       arrastradas con las tareas de la IA de antes, y «Diseño» se estiraba sin que se corriera lo que le falta. */
    const r = paso2([{ id: "d", tasks: [{ title: "Documentar decisiones", weekIndex: 18 }] }], "regenerar-todo");
    const fusionado = fusionarDetalle(REPROGRAMADO, r, "run-2");
    expect(movidas(fusionado.cambios), "la fusión perdió las arrastradas").toEqual(["d1@16", "d2@17", "d3@18"]);
    const plan = planDeAplicacion(VIVO_M4, fusionado, [], { tareas: "listas" });
    expect(plan.arrastradas).toEqual({ aplican: 3, choques: 0 });
    const diseno = proyectar(VIVO_M4, fusionado).fases.find((f) => f.id === "d")!;
    expect(diseno.tareas.map((t) => `${t.title}@${t.weekIndex}`)).toEqual([
      "Mapear procesos@0",
      "Definir pipeline@16",
      "Revisión semanal@17",
      "Revisión semanal@18",
      "Documentar decisiones@18",
    ]);
    // El recálculo de «Diseño» reemplaza las tareas de la IA de su fase, no lo que corrió el sistema.
    const recalculo = paso2([{ id: "d", tasks: [{ title: "Cerrar el diseño", weekIndex: 18 }] }], "recalculo");
    const mezclados = mezclarTareasDeFases(fusionado.cambios, recalculo.tareas, new Set(["d"]));
    expect(movidas(mezclados), "el recálculo perdió las arrastradas").toEqual(["d1@16", "d2@17", "d3@18"]);
    expect(resumen({ ...recalculo, tareas: mezclados.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva") })).toEqual([
      "+Cerrar el diseño@18",
    ]);
  });
});
