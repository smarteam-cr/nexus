/**
 * lib/timeline/propuesta-de-estructura.test.ts — EL ARMADOR DE LA PROPUESTA DE FASES Y TIEMPOS,
 * LA MÁQUINA DE PASOS DE LA PANTALLA Y EL PROMPT DEL REVISOR («Regenerar todo», paso 1).
 *
 * Correr: `npx vitest run lib/timeline/propuesta-de-estructura.test.ts --project unit`.
 *
 * El modelo puede pedir cualquier cosa; lo que llega al Gantt lo decide el armador. Estas guardas
 * fijan que la propuesta cambia SOLO lo pedido y permitido, que nunca trae tareas, notas ni ancla,
 * que un cambio vacío no se guarda (la cadena al paso 2 quedaría colgada) y que el prompt lleva
 * las decisiones de negocio de Elías (2026-09-23) sin voseo y sin fila en `Agent`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AVISO_ACORDADO_SIN_ENTRAR,
  AVISO_DECIDE_PRIMERO,
  AVISO_FALLO_DE_ESTRUCTURA,
  AVISO_PROPUESTA_PENDIENTE,
  AVISO_SIN_CAMBIOS,
  CAMBIOS_DE_FASES_SIN_DECIDIR,
  errorDeLaRevisionDeFases,
  faseDeSemanaCero,
  FRASE_PLAZO_JUSTO,
  MAX_FASES_NUEVAS,
  MAX_OBSERVACIONES,
  PLANTILLA_PLAZO_CON_MARGEN,
  PLANTILLA_PLAZO_EXCEDIDO,
  construirPropuestaDeEstructura,
  fraseDelPlazo,
  leerRespuestaDeEstructura,
  motivoCitaUnaFuente,
  motivoEsUnaExclusion,
  pasoTrasEstructura,
  pasoTrasResolver,
  revisarDireccionDelPlazo,
  type FaseParaEstructura,
} from "./propuesta-de-estructura";
import { buildPhaseOrder, computeProposalDeltas, reescribirPropuestaPendiente } from "./proposal-deltas";
import { ACTIVITY_TYPES } from "./validate";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import { PESO_DE_LAS_FUENTES } from "@/lib/contexto/material-cronograma";
import { ID_ESTRUCTURA_CRONOGRAMA, PROMPT_ESTRUCTURA_CRONOGRAMA } from "@/lib/agents/estructura-cronograma";
import { REGLA_DE_FRONTERA_DE_ESTRUCTURA, renderEstructuraDelCronograma } from "@/lib/contexto/estructura-cronograma";

const fase = (over: Partial<FaseParaEstructura> & { id: string; order: number }): FaseParaEstructura => ({
  name: over.id.toUpperCase(),
  durationWeeks: 2,
  startWeek: null,
  sessionCount: 2,
  notes: `nota vigente de ${over.id}`,
  activityType: "CONFIGURACION",
  status: "PENDING",
  tasks: [],
  ...over,
});

/**
 * Semanas del proyecto (0-based): S0 0 · A 1-3 · B 4-7 · C 8-9 · D 10-11 · E 12 · F 13-14.
 * La Semana 0 está PENDIENTE a propósito: así la bloquea su propio filtro, no el de «terminada».
 *
 * ⚠ E (Go-live, TERMINADA) va FIJADA en su semana 12, la misma que ya calculaba el plan: ninguna
 * semana cambia. Motivo (revisión del paso A2, 2026-09-24): el armador ahora descarta todo cambio
 * que le corra el inicio a una fase terminada o en curso, y una terminada que arranca «tras la
 * anterior» detrás de fases pendientes la corría CUALQUIER alargue o fase nueva de más arriba —
 * estos casos prueban otra cosa (los filtros de siempre). Ese caso, el de la terminada sin fijar,
 * tiene su propia fila en «#17 · lo terminado y lo en curso no se corren».
 */
const FASES: FaseParaEstructura[] = [
  fase({ id: "s0", order: 0, name: "Semana 0 – Arranque", durationWeeks: 1 }),
  fase({
    id: "a",
    order: 1,
    name: "Arquitectura y planificación",
    durationWeeks: 3,
    status: "IN_PROGRESS",
    activityType: "PLANIFICACION",
    tasks: [
      { status: "DONE", weekIndex: 0 },
      { status: "IN_PROGRESS", weekIndex: 2 },
      { status: "PENDING", weekIndex: 1 },
    ],
  }),
  fase({ id: "b", order: 2, name: "Configuración y migración", durationWeeks: 4 }),
  fase({ id: "c", order: 3, name: "Capacitación", activityType: "ADOPCION" }),
  fase({ id: "d", order: 4, name: "Pruebas y ajustes" }),
  fase({ id: "e", order: 5, name: "Go-live", durationWeeks: 1, status: "DONE", startWeek: 12 }),
  fase({ id: "f", order: 6, name: "Soporte posterior", status: "SUSPENDED" }),
];

const armar = (cambios: unknown[], extra: Partial<Parameters<typeof construirPropuestaDeEstructura>[0]> = {}) =>
  construirPropuestaDeEstructura({
    fases: FASES,
    crudo: { estructura: { cambios, observaciones: [] } },
    anchorISO: null,
    ...extra,
  });

describe("G1 · cambia SOLO lo pedido", () => {
  it("un «ajustar» de duración da exactamente ese delta, con su motivo", () => {
    /* La edición que la pone en rojo: esparcir el objeto crudo del modelo en la fase (aparecerían
       notes o activityType), o dejar de copiar las notas, las sesiones o el tipo vigentes (cada
       fase saldría con cambios falsos). */
    const r = armar([
      {
        tipo: "ajustar",
        faseId: "b",
        durationWeeks: 5,
        motivo: "«CAV: Definiendo cronograma» (21 sep): se sumó el journey Maridaje del Mes",
        notes: "CENTINELA-NOTA-DEL-MODELO",
        activityType: "ADOPCION",
        sessionCount: 2, // el mismo valor: no es un cambio
      },
    ]);
    expect(r.deltas).toEqual([
      {
        key: "mod:b",
        kind: "MODIFY_PHASE",
        phaseId: "b",
        name: "Configuración y migración",
        changes: [{ field: "durationWeeks", from: 4, to: 5 }],
        motivo: "«CAV: Definiendo cronograma» (21 sep): se sumó el journey Maridaje del Mes",
      },
    ]);
    expect(r.descartados).toEqual([]);
  });
});

describe("G2 · nunca tareas, nunca notas, nunca ancla", () => {
  const r = construirPropuestaDeEstructura({
    fases: FASES,
    anchorISO: "2026-09-14T00:00:00.000Z",
    crudo: {
      anchorStartDate: "2026-10-05T00:00:00.000Z",
      estructura: {
        anchorStartDate: "2026-10-05T00:00:00.000Z",
        cambios: [
          { tipo: "ajustar", faseId: "c", durationWeeks: 3, notes: "CENTINELA", tasks: [{ title: "x" }], motivo: "M" },
          {
            tipo: "agregar",
            despuesDeFaseId: "b",
            name: "Piloto con socios",
            durationWeeks: 1,
            notes: "CENTINELA",
            tasks: [{ title: "x" }],
            motivo: "M2",
          },
        ],
      },
    },
  });

  it("ninguna fase trae `tasks` (si no, el Gantt se congela como con el assist)", () => {
    expect(r.propuesta).not.toBeNull();
    for (const p of r.propuesta!.phases) expect("tasks" in p, `«${p.name}» trae tasks`).toBe(false);
  });

  it("las notas son las vigentes; las nuevas nacen sin notas", () => {
    const porNombre = new Map(r.propuesta!.phases.map((p) => [p.name, p]));
    expect(porNombre.get("Capacitación")!.notes).toBe("nota vigente de c");
    expect(porNombre.get("Piloto con socios")!.notes).toBeNull();
    expect(JSON.stringify(r.propuesta)).not.toContain("CENTINELA");
  });

  it("sin ancla, sin SET_ANCHOR, y con el origen de las reuniones", () => {
    expect(r.propuesta!.anchorStartDate).toBeNull();
    expect(r.deltas.some((d) => d.kind === "SET_ANCHOR")).toBe(false);
    expect(r.propuesta!.origen).toBe("contexto");
  });
});

describe("G3 · los filtros: lo que el modelo no puede hacer, aunque lo pida", () => {
  const CASOS: Array<[string, unknown]> = [
    ["un id inventado (no se vuelve fase nueva)", { tipo: "ajustar", faseId: "zzz", durationWeeks: 3, motivo: "M" }],
    ["un cambio sin motivo", { tipo: "ajustar", faseId: "b", durationWeeks: 5 }],
    ["una fase terminada", { tipo: "ajustar", faseId: "e", durationWeeks: 2, motivo: "M" }],
    ["una fase suspendida", { tipo: "ajustar", faseId: "f", durationWeeks: 3, motivo: "M" }],
    ["la Semana 0 aunque no esté terminada", { tipo: "ajustar", faseId: "s0", durationWeeks: 2, motivo: "M" }],
    ["el inicio de una fase que ya empezó", { tipo: "ajustar", faseId: "a", inicioSemana: 4, motivo: "M" }],
    ["duración 0", { tipo: "ajustar", faseId: "b", durationWeeks: 0, motivo: "M" }],
    ["duración 53", { tipo: "ajustar", faseId: "b", durationWeeks: 53, motivo: "M" }],
    ["duración 2,5", { tipo: "ajustar", faseId: "b", durationWeeks: 2.5, motivo: "M" }],
    ["la misma duración", { tipo: "ajustar", faseId: "b", durationWeeks: 4, motivo: "M" }],
    ["un inicio igual al que ya calcula el plan", { tipo: "ajustar", faseId: "d", inicioSemana: 11, motivo: "M" }],
    ["un inicio fuera de 1..104", { tipo: "ajustar", faseId: "d", inicioSemana: 0, motivo: "M" }],
    ["acortar por debajo del trabajo empezado", { tipo: "ajustar", faseId: "a", durationWeeks: 2, motivo: "M" }],
    ["renombrar a «Integración de datos» una fase no técnica", { tipo: "ajustar", faseId: "b", name: "Integración de datos", motivo: "M" }],
    ["renombrar al nombre de otra fase", { tipo: "ajustar", faseId: "d", name: "capacitacion", motivo: "M" }],
    ["un nombre de más de 60 caracteres", { tipo: "ajustar", faseId: "d", name: "x".repeat(61), motivo: "M" }],
    ["sesiones fuera de 1..50", { tipo: "ajustar", faseId: "d", sessionCount: 51, motivo: "M" }],
    ["una fase nueva sin ancla", { tipo: "agregar", despuesDeFaseId: null, name: "Piloto", durationWeeks: 1, motivo: "M" }],
    ["una fase nueva con un ancla inventada", { tipo: "agregar", despuesDeFaseId: "zzz", name: "Piloto", durationWeeks: 1, motivo: "M" }],
    ["una fase nueva sin motivo", { tipo: "agregar", despuesDeFaseId: "b", name: "Piloto", durationWeeks: 1 }],
    ["mover la Semana 0", { tipo: "mover", faseId: "s0", despuesDeFaseId: "b", motivo: "M" }],
    ["mover una fase detrás de sí misma", { tipo: "mover", faseId: "c", despuesDeFaseId: "c", motivo: "M" }],
    ["mover a donde ya está", { tipo: "mover", faseId: "c", despuesDeFaseId: "b", motivo: "M" }],
    ["quitar una fase (no existe ese tipo)", { tipo: "quitar", faseId: "c", motivo: "M" }],
  ];

  it.each(CASOS)("descarta %s, y lo dice", (_nombre, cambio) => {
    /* La edición que pone en rojo cada fila: borrar su filtro en construirPropuestaDeEstructura. */
    const r = armar([cambio]);
    expect(r.propuesta, JSON.stringify(r.deltas)).toBeNull();
    expect(r.descartados.length, "se descartó en silencio: el motivo va a la corrida").toBeGreaterThan(0);
  });

  it("el id repetido: gana el primero, el segundo se descarta", () => {
    const r = armar([
      { tipo: "ajustar", faseId: "b", durationWeeks: 5, motivo: "M1" },
      { tipo: "ajustar", faseId: "b", durationWeeks: 6, motivo: "M2" },
    ]);
    expect(r.deltas).toHaveLength(1);
    expect(r.propuesta!.phases.find((p) => p.id === "b")!.durationWeeks).toBe(5);
    expect(r.descartados).toHaveLength(1);
  });

  it(`la fase nueva número ${MAX_FASES_NUEVAS + 1} se descarta`, () => {
    const nuevas = [1, 2, 3, 4].map((n) => ({
      tipo: "agregar",
      despuesDeFaseId: "b",
      name: `Fase extra ${"abcd"[n - 1]}`,
      durationWeeks: 1,
      motivo: "M",
    }));
    const r = armar(nuevas);
    expect(r.deltas.filter((d) => d.kind === "ADD_PHASE")).toHaveLength(MAX_FASES_NUEVAS);
    expect(r.descartados).toHaveLength(1);
  });

  it("inicioSemana es la semana DEL PROYECTO desde 1: 7 → startWeek 6 (el `- 1`)", () => {
    const r = armar([{ tipo: "ajustar", faseId: "d", inicioSemana: 7, motivo: "M" }]);
    expect(r.deltas).toEqual([
      {
        key: "mod:d",
        kind: "MODIFY_PHASE",
        phaseId: "d",
        name: "Pruebas y ajustes",
        changes: [{ field: "startWeek", from: null, to: 6 }],
        motivo: "M",
      },
    ]);
  });

  it("no mueve una fase a una semana que ya pasó", () => {
    // Ancla lunes 14-sep; «hoy» miércoles 7-oct = semana 4 del proyecto (0-based 3).
    const ahora = Date.UTC(2026, 9, 7, 18);
    const anchorISO = "2026-09-14T00:00:00.000Z";
    const pasado = armar([{ tipo: "ajustar", faseId: "d", inicioSemana: 3, motivo: "M" }], { anchorISO, ahora });
    expect(pasado.propuesta).toBeNull();
    const futuro = armar([{ tipo: "ajustar", faseId: "d", inicioSemana: 6, motivo: "M" }], { anchorISO, ahora });
    expect(futuro.deltas).toHaveLength(1);
  });

  it("un tipo de fase nueva que no existe queda en null, sin descartar la fase", () => {
    const r = armar([
      { tipo: "agregar", despuesDeFaseId: "b", name: "Piloto con socios", durationWeeks: 1, activityType: "PILOTO", motivo: "M" },
    ]);
    const add = r.deltas.find((d) => d.kind === "ADD_PHASE");
    expect(add && add.kind === "ADD_PHASE" ? add.phase.activityType : "falta").toBeNull();
    expect(ACTIVITY_TYPES).not.toContain("PILOTO");
  });

  it("la fase nueva va detrás de su ancla, y un «mover» da el reordenamiento con su motivo", () => {
    const r = armar([
      { tipo: "agregar", despuesDeFaseId: "a", name: "Revisión de artes y contenidos", durationWeeks: 1, motivo: "Nota «Acuerdo de alcance»" },
      { tipo: "mover", faseId: "d", despuesDeFaseId: "b", motivo: "Reunión del 22 sep: pruebas antes de capacitar" },
    ]);
    /* ⚠ ACTUALIZADA (revisión adversarial, 2026-09-24), con esta razón: miraba el orden del ARRAY de
       la propuesta. Ahora el «mover» viaja como intención (`movidas`) y el array va en el orden de
       hoy, así un orden que el CSE cambie a mano mientras la propuesta espera no se revierte. Lo que
       importa —y se sigue pidiendo— es el orden que QUEDA al aceptar todo (`buildPhaseOrder`). */
    expect(r.propuesta!.movidas).toEqual([{ id: "d", despuesDe: "b" }]);
    const actuales = FASES.map((f) => ({ id: f.id, name: f.name, durationWeeks: f.durationWeeks }));
    const porId = new Map(actuales.map((f) => [f.id, f.name]));
    const nombres = buildPhaseOrder(actuales, r.propuesta!, new Set(r.deltas.map((d) => d.key))).map((s) =>
      s.kind === "new" ? s.phase.name : porId.get(s.id),
    );
    expect(nombres).toEqual([
      "Semana 0 – Arranque",
      "Arquitectura y planificación",
      "Revisión de artes y contenidos",
      "Configuración y migración",
      "Pruebas y ajustes",
      "Capacitación",
      "Go-live",
      "Soporte posterior",
    ]);
    const add = r.deltas.find((d) => d.kind === "ADD_PHASE");
    expect(add && add.kind === "ADD_PHASE" && add.afterPhaseId).toBe("a");
    const reorder = r.deltas.find((d) => d.kind === "REORDER_PHASES");
    expect(reorder && reorder.kind === "REORDER_PHASES" ? reorder.motivos : null).toEqual([
      "Reunión del 22 sep: pruebas antes de capacitar",
    ]);
  });
});

describe("⛔ la frontera sobre los NOMBRES de fase (los lee el cliente al aceptar)", () => {
  const huellas = huellasDeFrontera(["Se acordó un piloto de una semana con Rafaela Pinzón."]);

  it("una fase nueva cuyo nombre trae un plazo no entra, y la IA lo dice en las observaciones", () => {
    /* La edición que la pone en rojo: dejar de pasar el nombre por `fugaEn`. */
    const r = armar(
      [{ tipo: "agregar", despuesDeFaseId: "b", name: "Piloto de 1 semana", durationWeeks: 1, motivo: "M" }],
      { huellas },
    );
    expect(r.propuesta).toBeNull();
    expect(r.descartados.join(" ")).toMatch(/plazo/);
    expect(r.observaciones.join(" "), "una fase ACORDADA no puede perderse en silencio").toContain("Piloto de 1 semana");
  });

  it("un renombre que cita la fuente o trae una fecha se descarta", () => {
    for (const name of ["Ajustes según la reunión", "Cierre 31 de diciembre"]) {
      const r = armar([{ tipo: "ajustar", faseId: "d", name, motivo: "M" }], { huellas });
      expect(r.propuesta, name).toBeNull();
    }
  });

  it("un nombre limpio pasa", () => {
    const r = armar(
      [{ tipo: "agregar", despuesDeFaseId: "b", name: "Piloto con socios", durationWeeks: 1, motivo: "M" }],
      { huellas },
    );
    expect(r.deltas).toHaveLength(1);
  });
});

/**
 * UN PROYECTO EN MARCHA, como los de verdad. Ancla lunes 14-sep; semanas del proyecto (0-based):
 * S0 0 (terminada) · A 1-3 (terminada) · B 4-7 (en curso) · C 8-9 · D FIJADA en 11-12 · E 13.
 * «Hoy» = lunes 30-nov = semana 11 del proyecto (0-based): C ya quedó atrás en el calendario.
 */
const EN_MARCHA: FaseParaEstructura[] = [
  fase({ id: "s0", order: 0, name: "Semana 0 – Arranque", durationWeeks: 1, status: "DONE" }),
  fase({ id: "a", order: 1, name: "Arquitectura y planificación", durationWeeks: 3, status: "DONE" }),
  fase({
    id: "b",
    order: 2,
    name: "Configuración y migración",
    durationWeeks: 4,
    status: "IN_PROGRESS",
    tasks: [
      { status: "DONE", weekIndex: 0 },
      { status: "IN_PROGRESS", weekIndex: 1 },
    ],
  }),
  fase({ id: "c", order: 3, name: "Capacitación" }),
  fase({ id: "d", order: 4, name: "Pruebas y ajustes", startWeek: 11 }),
  fase({ id: "e", order: 5, name: "Go-live", durationWeeks: 1 }),
];
const ANCLA_EN_MARCHA = "2026-09-14T00:00:00.000Z";
const HOY_EN_MARCHA = Date.UTC(2026, 10, 30, 18); // lunes 30 nov 2026, mediodía en Costa Rica

/**
 * UNA FASE PENDIENTE CON TRABAJO HECHO, como las de verdad (revisión del paso A2, segunda vuelta):
 * las tareas solo derivan DONE a la fase e IN_PROGRESS lo pone únicamente el agente de avance, así
 * que la Semana 0 de CAV está PENDING con 2 tareas hechas. S0 0 · Diagnóstico 1-2 (PENDING, una
 * tarea hecha y otra en curso) · Arquitectura 3-4. «Hoy» = martes 22-sep = semana 1 (0-based).
 */
const CON_TRABAJO_EN_PENDIENTE: FaseParaEstructura[] = [
  fase({ id: "s0", order: 0, name: "Semana 0 – Arranque", durationWeeks: 1, status: "DONE" }),
  fase({
    id: "diag",
    order: 1,
    name: "Diagnóstico",
    tasks: [
      { status: "DONE", weekIndex: 0 },
      { status: "IN_PROGRESS", weekIndex: 0 },
    ],
  }),
  fase({ id: "arq", order: 2, name: "Arquitectura" }),
];
const HOY_EN_DIAGNOSTICO = Date.UTC(2026, 8, 22, 18);

/** Un proyecto ATRASADO: S0 0 · Configuración 1-4 (pendiente) · Capacitación 5-6 (pendiente). */
const ATRASADO: FaseParaEstructura[] = [
  fase({ id: "s0", order: 0, name: "Semana 0 – Arranque", durationWeeks: 1, status: "DONE" }),
  fase({ id: "x", order: 1, name: "Configuración", durationWeeks: 4 }),
  fase({ id: "y", order: 2, name: "Capacitación", durationWeeks: 2 }),
];
/** Martes 20-oct = semana 5 (0-based): Capacitación arranca esta semana. */
const HOY_EN_CAPACITACION = Date.UTC(2026, 9, 20, 18);
/** Martes 10-nov = semana 8: Capacitación ya estaba en el pasado por el atraso. */
const HOY_DESPUES_DE_CAPACITACION = Date.UTC(2026, 10, 10, 18);

describe("#17 · lo terminado y lo en curso no se corren, y nada cae en el pasado", () => {
  /* Revisión del paso A2: solo `inicioSemana` pasaba por el filtro de «semana que ya pasó», e
     `intocable` miraba solo la fase que cambia. Un «agregar» o un «mover» detrás de la Semana 0
     caían en la semana 2 y corrían a las fases terminadas y en curso; desfijar una fase la dejaba
     arrancar en el pasado. Cada fila se pone en rojo si se borra SU filtro en el armador. */
  const conHoy = { fases: EN_MARCHA, anchorISO: ANCLA_EN_MARCHA, ahora: HOY_EN_MARCHA };
  const sinHoy = { fases: EN_MARCHA, anchorISO: ANCLA_EN_MARCHA };
  const armarCon = (base: Omit<Parameters<typeof construirPropuestaDeEstructura>[0], "crudo">, cambios: unknown[]) =>
    construirPropuestaDeEstructura({ ...base, crudo: { cambios, observaciones: [] } });

  const CASOS: Array<[string, Omit<Parameters<typeof construirPropuestaDeEstructura>[0], "crudo">, unknown, RegExp]> = [
    [
      "una fase nueva detrás de la Semana 0 caería en el pasado",
      conHoy,
      { tipo: "agregar", despuesDeFaseId: "s0", name: "Piloto con socios", durationWeeks: 1, motivo: "M" },
      /agregar «Piloto con socios»: caería en la semana 2, que ya pasó/,
    ],
    [
      "mover una fase detrás de la Semana 0 la llevaría al pasado",
      conHoy,
      { tipo: "mover", faseId: "c", despuesDeFaseId: "s0", motivo: "M" },
      /mover «Capacitación»: caería en la semana 2, que ya pasó/,
    ],
    [
      "desfijar una fase la haría arrancar en una semana que ya pasó",
      conHoy,
      { tipo: "ajustar", faseId: "d", inicioSemana: null, motivo: "M" },
      /ajustar «Pruebas y ajustes»: con ese inicio caería en la semana 11, que ya pasó/,
    ],
    [
      "sin «hoy»: una fase nueva delante de la que está en curso la correría",
      sinHoy,
      { tipo: "agregar", despuesDeFaseId: "a", name: "Piloto con socios", durationWeeks: 1, motivo: "M" },
      /correría «Configuración y migración», que ya está en curso/,
    ],
    [
      "sin «hoy»: mover una fase delante de la que está en curso la correría",
      sinHoy,
      { tipo: "mover", faseId: "c", despuesDeFaseId: "a", motivo: "M" },
      /mover «Capacitación»: correría «Configuración y migración», que ya está en curso/,
    ],
    [
      "alargar una pendiente que tiene detrás una terminada sin fijar la correría",
      { fases: FASES.map((f) => (f.id === "e" ? { ...f, startWeek: null } : f)), anchorISO: null },
      { tipo: "ajustar", faseId: "b", durationWeeks: 5, motivo: "M" },
      /ajustar «Configuración y migración»: con 5 semanas correría «Go-live», que ya está terminada/,
    ],
    /* Segunda vuelta: una fase PENDIENTE con trabajo hecho también ya empezó. La edición que las
       pone en rojo: volver a mirar solo el estado de la fase en `comoVa`. */
    [
      "una pendiente con trabajo hecho ya empezó: un «mover» delante la correría",
      { fases: CON_TRABAJO_EN_PENDIENTE, anchorISO: ANCLA_EN_MARCHA, ahora: HOY_EN_DIAGNOSTICO },
      { tipo: "mover", faseId: "arq", despuesDeFaseId: "s0", motivo: "M" },
      /mover «Arquitectura»: correría «Diagnóstico», que ya empezó/,
    ],
    [
      "una pendiente con trabajo hecho ya empezó: una fase nueva delante la correría",
      { fases: CON_TRABAJO_EN_PENDIENTE, anchorISO: ANCLA_EN_MARCHA, ahora: HOY_EN_DIAGNOSTICO },
      { tipo: "agregar", despuesDeFaseId: "s0", name: "Piloto con socios", durationWeeks: 1, motivo: "M" },
      /agregar «Piloto con socios»: correría «Diagnóstico», que ya empezó/,
    ],
    /* Segunda vuelta: lo que cae DE REBOTE en el pasado. La edición que las pone en rojo: sacar
       `loQueCaeDeRebote` de `choqueDelCalendario`. */
    [
      "mover una fase más adelante adelanta de rebote a otra hasta una semana que ya pasó",
      conHoy,
      { tipo: "mover", faseId: "d", despuesDeFaseId: "e", motivo: "M" },
      /mover «Pruebas y ajustes»: correría «Go-live» a la semana 11, que ya pasó/,
    ],
    [
      "acortar una fase adelanta de rebote a la que sigue hasta una semana que ya pasó",
      { fases: ATRASADO, anchorISO: ANCLA_EN_MARCHA, ahora: HOY_EN_CAPACITACION },
      { tipo: "ajustar", faseId: "x", durationWeeks: 2, motivo: "M" },
      /ajustar «Configuración»: con 2 semanas correría «Capacitación» a la semana 4, que ya pasó/,
    ],
  ];

  it.each(CASOS)("descarta: %s", (_nombre, base, cambio, motivo) => {
    const r = armarCon(base, [cambio]);
    expect(r.propuesta, JSON.stringify(r.deltas)).toBeNull();
    expect(r.descartados.join(" | ")).toMatch(motivo);
  });

  it("lo ACORDADO que no entra por el calendario no se pierde: queda en las observaciones", () => {
    const agregar = armarCon(conHoy, [CASOS[0][2]]);
    expect(agregar.observaciones.join(" ")).toMatch(/Se sugirió sumar la fase «Piloto con socios».*ya pasó: decide tú dónde va/);
    const mover = armarCon(conHoy, [CASOS[1][2]]);
    expect(mover.observaciones.join(" ")).toMatch(/Se sugirió mover «Capacitación».*ya pasó: decide tú si se mueve/);
  });

  it("un «ajustar» descartado por el calendario también deja su observación (segunda vuelta)", () => {
    /* La revisión lo reprodujo: B y C seguidas y en curso, «ajustar B de 4 a 6 semanas» con el motivo
       de una reunión. Salía propuesta null, observaciones [] y la pantalla decía «Tus reuniones y
       notas no piden cambios», cuando la reunión sí lo acordó. La edición que pone en rojo cada
       caso: borrar su `perdidoPorElCalendario` en el «ajustar». */
    const enCurso: FaseParaEstructura[] = [
      fase({ id: "s0", order: 0, name: "Semana 0 – Arranque", durationWeeks: 1, status: "DONE" }),
      fase({ id: "b", order: 1, name: "Configuración", durationWeeks: 4, status: "IN_PROGRESS" }),
      fase({ id: "c", order: 2, name: "Capacitación", status: "IN_PROGRESS" }),
    ];
    const casos: Array<[string, Omit<Parameters<typeof construirPropuestaDeEstructura>[0], "crudo">, unknown, RegExp]> = [
      [
        "la duración",
        { fases: enCurso, anchorISO: null },
        { tipo: "ajustar", faseId: "b", durationWeeks: 6, motivo: "Reunión 23 sep: Configuración dura 6 semanas" },
        /Se sugirió llevar «Configuración» a 6 semanas, pero correría «Capacitación», que ya está en curso: decide tú si se ajusta\./,
      ],
      [
        "el inicio desfijado",
        conHoy,
        { tipo: "ajustar", faseId: "d", inicioSemana: null, motivo: "M" },
        /Se sugirió que «Pruebas y ajustes» arranque cuando termine la anterior, pero caería en la semana 11, que ya pasó: decide tú cuándo arranca\./,
      ],
      [
        "una semana de inicio que ya pasó",
        conHoy,
        { tipo: "ajustar", faseId: "d", inicioSemana: 10, motivo: "M" },
        /Se sugirió que «Pruebas y ajustes» arranque en la semana 10, pero esa semana ya pasó: decide tú cuándo arranca\./,
      ],
      [
        "el inicio de una fase que ya empezó",
        { fases: CON_TRABAJO_EN_PENDIENTE, anchorISO: null },
        { tipo: "ajustar", faseId: "diag", inicioSemana: 5, motivo: "M" },
        /Se sugirió que «Diagnóstico» arranque en la semana 5, pero la fase ya empezó: decide tú si se mueve\./,
      ],
    ];
    for (const [nombre, base, cambio, observacion] of casos) {
      const r = armarCon(base, [cambio]);
      expect(r.propuesta, nombre).toBeNull();
      expect(r.observaciones.join(" | "), nombre).toMatch(observacion);
      expect(r.acordadoSinEntrar, nombre).toBe(1);
      // Y la pantalla no dice que las reuniones no piden cambios.
      expect(pasoTrasEstructura({ status: 200, estado: "sin-cambios", acordadoSinEntrar: r.acordadoSinEntrar })).toEqual({
        paso: "tareas",
        aviso: AVISO_ACORDADO_SIN_ENTRAR,
      });
    }
  });

  it("una pendiente que ya estaba en el pasado por el atraso no se mira: acortar la de antes entra", () => {
    /* El control del rebote: en un proyecto atrasado cualquier cambio mueve a una pendiente que ya
       quedó atrás, y bloquearlos todos dejaría al revisor sin nada que proponer. La edición que la
       pone en rojo: mirar toda pendiente que termina en el pasado, y no solo la que llega desde hoy
       o más adelante. */
    const r = armarCon({ fases: ATRASADO, anchorISO: ANCLA_EN_MARCHA, ahora: HOY_DESPUES_DE_CAPACITACION }, [
      { tipo: "ajustar", faseId: "x", durationWeeks: 2, motivo: "M" },
    ]);
    expect(r.descartados).toEqual([]);
    expect(r.deltas.map((d) => d.key)).toEqual(["mod:x"]);
    expect(r.acordadoSinEntrar).toBe(0);
  });

  it("una tarea SUSPENDIDA no hace empezar a una fase (se aparcó sin ejecutarse)", () => {
    /* La edición que la pone en rojo: contar como empezada cualquier tarea que no esté PENDING. */
    const conSuspendida = CON_TRABAJO_EN_PENDIENTE.map((f) =>
      f.id === "diag" ? { ...f, tasks: [{ status: "SUSPENDED", weekIndex: 0 }] } : f,
    );
    const r = armarCon({ fases: conSuspendida, anchorISO: ANCLA_EN_MARCHA, ahora: HOY_EN_DIAGNOSTICO }, [
      { tipo: "mover", faseId: "arq", despuesDeFaseId: "s0", motivo: "M" },
    ]);
    expect(r.descartados).toEqual([]);
    expect(r.deltas.map((d) => d.key)).toEqual(["reorder"]);
  });

  it("lo que va hacia adelante pasa: una fase nueva después de la fijada y alargar una pendiente", () => {
    /* La edición que la pone en rojo: un filtro que descarte de más (por ejemplo, mirar el orden en
       vez del inicio y rechazar todo lo que va detrás de una fase fijada). */
    const r = armarCon(conHoy, [
      { tipo: "agregar", despuesDeFaseId: "d", name: "Piloto con socios", durationWeeks: 1, motivo: "M" },
      { tipo: "ajustar", faseId: "c", durationWeeks: 3, motivo: "M" },
    ]);
    expect(r.descartados).toEqual([]);
    expect(r.deltas.map((d) => d.key).sort()).toEqual(["add:5", "mod:c"]);
  });

  it("sin «hoy», desfijar la fase fijada entra: no corre nada terminado ni en curso", () => {
    /* El filtro del pasado necesita «hoy»; sin él, solo cuenta lo que se corre. */
    const r = armarCon(sinHoy, [{ tipo: "ajustar", faseId: "d", inicioSemana: null, motivo: "M" }]);
    expect(r.descartados).toEqual([]);
    expect(r.deltas).toHaveLength(1);
  });
});

describe("(d) · renombrar una fase de «Desarrollo / Integración» pide citar de dónde sale", () => {
  /* Prueba A3, ronda r2: el control renombró «Desarrollo SDK / Integración» a «Desarrollo e
     integración» 3 de 3 veces. El armador no lo frenaba: los dos nombres son de Desarrollo /
     Integración, así que la regla de «entra o sale» no aplica. Ahora el motivo tiene que CITAR una
     reunión, una nota o las instrucciones. La edición que la pone en rojo: borrar la condición de
     `motivoCitaUnaFuente` en el armador. */
  const CON_DEV: FaseParaEstructura[] = [
    ...FASES,
    fase({ id: "dev", order: 7, name: "Desarrollo SDK / Integración", durationWeeks: 3, startWeek: 4 }),
  ];
  const renombrar = (motivo: string) =>
    construirPropuestaDeEstructura({
      fases: CON_DEV,
      anchorISO: null,
      crudo: { cambios: [{ tipo: "ajustar", faseId: "dev", name: "Desarrollo e integración", motivo }] },
    });

  it("con un motivo que no cita nada, no se renombra", () => {
    const r = renombrar("El nombre describe mejor el trabajo de la fase.");
    expect(r.propuesta).toBeNull();
    expect(r.descartados.join(" ")).toMatch(/pide un motivo que cite la reunión, la nota o las instrucciones/);
  });

  it("citando la reunión, la nota o las instrucciones, sí", () => {
    for (const motivo of [
      "Kick off - CAV (23 sep 2026): se acordó llamarla «Desarrollo e integración».",
      "Nota 'Acuerdo con el cliente': el cliente pidió ese nombre.",
      "Instrucciones del CSE: llamar a la fase «Desarrollo e integración».",
    ]) {
      expect(renombrar(motivo).deltas, motivo).toHaveLength(1);
    }
  });

  it("⛔ las 3 salidas REALES de r2-E2 (renombre por una exclusión, citando las instrucciones) no pasan", () => {
    /* Revisión del paso A3, segunda vuelta: la guarda de la cita atrapaba 0 de 3 en los datos
       reales, porque los tres motivos citan «Instrucciones del CSE». Estos son sus motivos tal cual
       (a3/salida-r2-E2-1..3.txt), con la fase real. La edición que la pone en rojo: borrar la
       condición de `motivoEsUnaExclusion` en el armador. */
    const REALES = [
      "Instrucciones del CSE: excluir integraciones, ventas y servicio. La fase actual se llama «Desarrollo SDK / Integración», nombre que el cliente no debe ver y que mezcla desarrollo con integración técnica fuera del alcance de marketing. Se mantiene la fase pero se propone nombre neutral. Sin cambio de duración ni inicio.",
      "Instrucciones del CSE: excluir integraciones, ventas y servicio. La fase 'Desarrollo SDK / Integración' corresponde al SDK personalizado para notificaciones push, que es integración/desarrollo fuera del alcance de marketing. Se propone renombrar para reflejar solo el trabajo de marketing; sin embargo, el contenido completo de esta fase queda fuera del alcance definido por el CSE. Ver observaciones.",
      "Instrucciones del CSE: nada que no tenga que ver con marketing. La fase existe en el calendario con nombre 'Desarrollo SDK / Integración', que refiere explícitamente a desarrollo técnico fuera del alcance de marketing. Sin embargo, renombrar hacia o desde 'Desarrollo / Integración' está prohibido por las reglas. Se deja en observaciones.",
    ];
    const conFaseReal: FaseParaEstructura[] = [
      ...FASES,
      fase({ id: "cmt8yjaxv00oo07ry172iff2u", order: 7, name: "Desarrollo SDK / Integración", durationWeeks: 3, startWeek: 4 }),
    ];
    for (const motivo of REALES) {
      expect(motivoCitaUnaFuente(motivo), "cita las instrucciones: la guarda vieja la dejaba pasar").toBe(true);
      const crudo = leerRespuestaDeEstructura(
        JSON.stringify({
          cambios: [{ tipo: "ajustar", faseId: "cmt8yjaxv00oo07ry172iff2u", name: "Desarrollo e integración", motivo }],
          observaciones: [],
        }),
      );
      const r = construirPropuestaDeEstructura({ fases: conFaseReal, anchorISO: null, crudo });
      expect(r.propuesta, motivo).toBeNull();
      expect(r.descartados.join(" "), motivo).toMatch(/porque algo quedó excluido no es motivo/);
    }
  });

  it("qué cuenta como una exclusión", () => {
    for (const s of [
      "Instrucciones del CSE: excluir integraciones",
      "El brief excluye las integraciones",
      "Queda fuera del alcance de marketing",
      "Un nombre que el cliente no debe ver",
      "Instrucciones del CSE: nada de integraciones",
    ]) {
      expect(motivoEsUnaExclusion(s), s).toBe(true);
    }
    for (const s of [
      "Instrucciones del CSE: llamar a la fase «Desarrollo e integración».",
      "Kick off - CAV (23 sep 2026): se acordó llamarla «Desarrollo e integración».",
      "Nota 'Acuerdo con el cliente': el cliente pidió ese nombre.",
    ]) {
      expect(motivoEsUnaExclusion(s), s).toBe(false);
    }
  });

  it("es solo para las de Desarrollo / Integración: otra fase se renombra con el motivo que traiga", () => {
    const r = armar([{ tipo: "ajustar", faseId: "d", name: "Pruebas con usuarios", motivo: "M" }]);
    expect(r.deltas).toHaveLength(1);
  });

  it("qué cuenta como citar una fuente", () => {
    for (const s of [
      "Nota 'Acuerdo con el cliente (23 sep)', cargada el 23 sep 2026",
      "Reunión «CAV: Definiendo cronograma»",
      "Según las instrucciones del CSE",
      "Kick off - CAV",
      "CAV: Definiendo cronograma (21 sep 2026): se sumó un journey",
      "Acordado el 2026-09-23",
    ]) {
      expect(motivoCitaUnaFuente(s), s).toBe(true);
    }
    for (const s of ["El nombre describe mejor el trabajo", "Para que el cliente lo entienda", "M", ""]) {
      expect(motivoCitaUnaFuente(s), s).toBe(false);
    }
  });
});

/**
 * ── #2 / #9 / #17 / #29 · LA SEMANA 0 EXISTE SOLO SI EL PROYECTO LA TIENE, Y NADA ACORDADO SE PIERDE
 * EN SILENCIO (revisión adversarial, 2026-09-24) ──
 */
describe("#2 / #9 / #17 / #29 · la Semana 0 solo si existe, y lo intocable deja su observación", () => {
  /* Semana 0 PENDIENTE con 2 tareas hechas (como CAV) y la fase siguiente SIN trabajo empezado: acá
     `loQueCorre` no tiene nada que proteger, así que la ÚNICA razón para descartar es la regla de la
     Semana 0. En G3 las filas de la Semana 0 pasaban por otro motivo (la fase «a» del fixture está en
     curso y el cambio la corría): borrar la regla dejaba la suite en verde. */
  const CS: FaseParaEstructura[] = [
    fase({
      id: "s0",
      order: 0,
      name: "Semana 0 – Arranque",
      durationWeeks: 1,
      tasks: [
        { status: "DONE", weekIndex: 0 },
        { status: "DONE", weekIndex: 0 },
      ],
    }),
    fase({ id: "diag", order: 1, name: "Diagnóstico" }),
    fase({ id: "conf", order: 2, name: "Configuración" }),
  ];
  const DEV: FaseParaEstructura[] = [
    fase({ id: "rel", order: 0, name: "Relevamiento técnico" }),
    fase({ id: "des", order: 1, name: "Desarrollo SDK / Integración", durationWeeks: 4 }),
    fase({ id: "pru", order: 2, name: "Pruebas" }),
  ];
  const armarCon = (fases: FaseParaEstructura[], cambios: unknown[], conSemanaCero?: boolean) =>
    construirPropuestaDeEstructura({ fases, anchorISO: null, crudo: { cambios, observaciones: [] }, conSemanaCero });

  it("#29 · la Semana 0 (sin nada corrido) no se ajusta ni se mueve: su PROPIA regla", () => {
    /* La edición que la pone en rojo: borrar `if (f.id === semanaCero) return "es la Semana 0 / Kick-off";`. */
    for (const cambio of [
      { tipo: "ajustar", faseId: "s0", durationWeeks: 2, motivo: "Kick-off: la arrancada dura 2 semanas" },
      { tipo: "mover", faseId: "s0", despuesDeFaseId: "diag", motivo: "Reunión 22 sep" },
    ]) {
      const r = armarCon(CS, [cambio]);
      expect(r.propuesta, JSON.stringify(cambio)).toBeNull();
      expect(r.descartados.join(" "), JSON.stringify(cambio)).toMatch(/es la Semana 0 \/ Kick-off/);
    }
  });

  it("#2 / #9 · en Desarrollo y Web la primera fase NO es la Semana 0: lo acordado sobre ella entra", () => {
    /* El caso de la revisión, reproducido con el armador puro: «el relevamiento pasa a 3 semanas».
       La edición que la pone en rojo: volver a tomar la fase de order 0 como Semana 0 siempre. */
    const pedido = { tipo: "ajustar", faseId: "rel", durationWeeks: 3, motivo: "Reunión 22 sep: el relevamiento pasa a 3 semanas" };
    const r = armarCon(DEV, [pedido], false);
    expect(r.descartados).toEqual([]);
    expect(r.deltas.map((d) => d.key)).toEqual(["mod:rel"]);
    // Con Semana 0 (el default de CS), la misma fase SÍ sería la Semana 0: y ahí queda dicho, no se pierde.
    const cs = armarCon(DEV, [pedido]);
    expect(cs.propuesta).toBeNull();
    expect(cs.acordadoSinEntrar).toBe(1);
    expect(faseDeSemanaCero(DEV, false)).toBeNull();
    expect(faseDeSemanaCero(CS, true)?.id).toBe("s0");
  });

  it("#17 · lo acordado sobre una fase intocable, un acortar por debajo del trabajo empezado o un renombre que no entra deja su observación", () => {
    /* Antes solo el calendario y el nombre de una fase NUEVA dejaban observación: estos se descartaban
       y la pantalla decía «tus reuniones no piden cambios». Las ediciones que la ponen en rojo: sacar
       el `acordadoQueNoEntra` de cada caso. */
    const CONF: FaseParaEstructura[] = [
      fase({ id: "s0", order: 0, name: "Semana 0 – Arranque", durationWeeks: 1, status: "DONE" }),
      fase({
        id: "conf",
        order: 1,
        name: "Configuración",
        durationWeeks: 3,
        tasks: [
          { status: "DONE", weekIndex: 0 },
          { status: "IN_PROGRESS", weekIndex: 1 },
        ],
      }),
      fase({ id: "go", order: 2, name: "Go-live", durationWeeks: 1, status: "DONE", startWeek: 4 }),
      fase({ id: "sop", order: 3, name: "Soporte", status: "SUSPENDED", startWeek: 6 }),
    ];
    const casos: Array<[string, unknown, RegExp]> = [
      [
        "la Semana 0",
        { tipo: "ajustar", faseId: "s0", durationWeeks: 2, motivo: "M" },
        /Se sugirió llevar «Semana 0 – Arranque» a 2 semanas, pero es la Semana 0 \/ Kick-off: decide tú si corresponde\./,
      ],
      [
        "una fase terminada",
        { tipo: "ajustar", faseId: "go", name: "Salida en vivo", motivo: "M" },
        /Se sugirió renombrar «Go-live» a «Salida en vivo», pero la fase está terminada: decide tú si corresponde\./,
      ],
      [
        "una fase suspendida (mover)",
        { tipo: "mover", faseId: "sop", despuesDeFaseId: "conf", motivo: "M" },
        /Se sugirió mover «Soporte» después de «Configuración», pero la fase está suspendida: decide tú si se mueve\./,
      ],
      [
        "acortar por debajo del trabajo empezado",
        { tipo: "ajustar", faseId: "conf", durationWeeks: 1, motivo: "Reunión: Configuración se cierra en 1 semana" },
        /Se sugirió llevar «Configuración» a 1 semana, pero dejaría afuera trabajo ya empezado en su semana 2: decide tú si se ajusta\./,
      ],
      [
        "un renombre que no entra (ya hay otra fase con ese nombre)",
        { tipo: "ajustar", faseId: "conf", name: "Go-live", motivo: "M" },
        /Se sugirió renombrar «Configuración» a «Go-live», pero ya hay otra fase con ese nombre: decide tú si se renombra\./,
      ],
    ];
    for (const [nombre, cambio, observacion] of casos) {
      const r = armarCon(CONF, [cambio]);
      expect(r.propuesta, nombre).toBeNull();
      expect(r.observaciones.join(" | "), nombre).toMatch(observacion);
      expect(r.acordadoSinEntrar, nombre).toBe(1);
      expect(pasoTrasEstructura({ status: 200, estado: "sin-cambios", acordadoSinEntrar: r.acordadoSinEntrar })).toEqual({
        paso: "tareas",
        aviso: AVISO_ACORDADO_SIN_ENTRAR,
      });
    }
    // Lo que no llegó a ser un acuerdo (sin motivo, un id inventado) sigue sin observación.
    expect(armarCon(CONF, [{ tipo: "ajustar", faseId: "s0", durationWeeks: 2 }]).acordadoSinEntrar).toBe(0);
    expect(armarCon(CONF, [{ tipo: "ajustar", faseId: "zzz", durationWeeks: 2, motivo: "M" }]).acordadoSinEntrar).toBe(0);
  });
});

describe("#20 · un solo tope de observaciones, y lo acordado que no entró va siempre", () => {
  it(`${MAX_OBSERVACIONES} del modelo + 2 fases descartadas por su nombre = ${MAX_OBSERVACIONES}, con las 2`, () => {
    /* Revisión del paso A2: el corte se aplicaba a las del modelo y cada fase descartada sumaba otra
       encima (5 + 2 = 7). La edición que la pone en rojo: volver a empujar a la lista ya cortada. */
    const huellas = huellasDeFrontera(["Se acordó un piloto de una semana con Rafaela Pinzón."]);
    const delModelo = ["o1", "o2", "o3", "o4", "o5"];
    const r = construirPropuestaDeEstructura({
      fases: FASES,
      anchorISO: null,
      huellas,
      crudo: {
        cambios: [
          { tipo: "agregar", despuesDeFaseId: "b", name: "Piloto de 1 semana", durationWeeks: 1, motivo: "M" },
          { tipo: "agregar", despuesDeFaseId: "c", name: "Cierre 31 de diciembre", durationWeeks: 1, motivo: "M" },
        ],
        observaciones: delModelo,
      },
    });
    expect(r.observaciones).toHaveLength(MAX_OBSERVACIONES);
    expect(r.observaciones.slice(0, 3)).toEqual(["o1", "o2", "o3"]);
    expect(r.observaciones.join(" ")).toContain("«Piloto de 1 semana»");
    expect(r.observaciones.join(" ")).toContain("«Cierre 31 de diciembre»");
  });
});

describe("(a) · la respuesta del modelo se lee aunque venga envuelta", () => {
  /* Prueba A3: las 6 respuestas CON cambios vinieron en ```json … ```, pese a «sin markdown». La
     ruta las leía de la primera `{` a la ÚLTIMA `}`: prosa con una llave después, o una llave de
     más, daban ESTRUCTURA_FALLO. La edición que la pone en rojo: volver a `/\{[\s\S]*\}/`. */
  const RESPUESTA = '{"cambios":[{"tipo":"ajustar","faseId":"c","durationWeeks":3,"motivo":"Nota del 23 sep"}],"observaciones":["o"]}';

  it("con cerco ```json, con prosa alrededor (con llaves) y con una llave de más", () => {
    const CASOS: Array<[string, string[]]> = [
      [RESPUESTA, ["o"]],
      ["```json\n" + RESPUESTA + "\n```", ["o"]],
      ["Aquí va la revisión:\n```json\n" + RESPUESTA + "\n```\nNota: el formato {cambios} va arriba.", ["o"]],
      ["Formato {x: 1}. Respuesta: " + RESPUESTA + " — fin }", ["o"]],
      ['{"estructura":{"cambios":[],"observaciones":["o"]}}}', ["o"]],
      ['{"cambios":[],"observaciones":["una } suelta y una { también"]}', ["una } suelta y una { también"]],
      // Envuelta con otra llave: la respuesta se busca adentro (la edición que la pone en rojo:
      // saltar entero todo objeto que parsea, aunque no sea la respuesta).
      ['{"respuesta":' + RESPUESTA + "}", ["o"]],
    ];
    for (const [texto, observaciones] of CASOS) {
      const r = leerRespuestaDeEstructura(texto);
      expect(r, texto).not.toBeNull();
      expect(construirPropuestaDeEstructura({ fases: FASES, crudo: r, anchorISO: null }).observaciones, texto).toEqual(
        observaciones,
      );
    }
  });

  it("una respuesta real de la prueba A3 (r1-E1, con cerco y en varias líneas) da sus dos cambios", () => {
    const real = [
      "```json",
      "{",
      '  "cambios": [',
      '    {"tipo": "ajustar", "faseId": "c", "durationWeeks": 3, "motivo": "Nota \'Acuerdo con el cliente (23 sep)\': más espacio entre sesiones."},',
      '    {"tipo": "agregar", "despuesDeFaseId": "d", "name": "Piloto de lanzamiento", "durationWeeks": 1, "sessionCount": null, "activityType": "SEGUIMIENTO", "motivo": "Nota \'Acuerdo con el cliente (23 sep)\': piloto de 1 semana."}',
      "  ],",
      '  "observaciones": ["La Semana 0 se atrasó 3 días: es una desviación ya ocurrida."]',
      "}",
      "```",
    ].join("\n");
    const r = construirPropuestaDeEstructura({ fases: FASES, crudo: leerRespuestaDeEstructura(real), anchorISO: null });
    expect(r.deltas.map((d) => d.key).sort()).toEqual(["add:5", "mod:c"]);
  });

  it("si hay varios, gana la respuesta: el último cerco ```, o el último objeto (segunda vuelta)", () => {
    /* La revisión lo reprodujo: un modelo que repite el formato antes de contestar daba el ejemplo
       vacío, un «sin cambios» en silencio donde antes había un ESTRUCTURA_FALLO visible. La edición
       que pone en rojo las dos primeras: volver a quedarse con el PRIMER objeto con forma de
       respuesta; la tercera: dejar de preferir lo que viene en un cerco. */
    const EJEMPLO = '{"cambios": [], "observaciones": []}';
    const CASOS: Array<[string, string]> = [
      ["el ejemplo antes del cerco", `Formato de ejemplo: ${EJEMPLO}\n\`\`\`json\n${RESPUESTA}\n\`\`\``],
      ["el ejemplo antes, sin cercos", `Formato de ejemplo: ${EJEMPLO}\nRespuesta: ${RESPUESTA}`],
      ["el cerco antes de un ejemplo suelto", `\`\`\`json\n${RESPUESTA}\n\`\`\`\nSi no hubiera cambios, sería ${EJEMPLO}.`],
    ];
    for (const [nombre, texto] of CASOS) {
      const r = construirPropuestaDeEstructura({ fases: FASES, crudo: leerRespuestaDeEstructura(texto), anchorISO: null });
      expect(r.deltas.map((d) => d.key), nombre).toEqual(["mod:c"]);
    }
  });

  it("ilegible = null, y un objeto de ADENTRO de un JSON roto no pasa por la respuesta", () => {
    /* «Sin cambios» y «no se pudo leer» son dos avisos distintos: un cambio suelto rescatado de un
       JSON roto se leería como una respuesta sin cambios. */
    for (const texto of [
      "",
      "sin cambios",
      '{"cambios":[{"tipo":"ajustar","faseId":"c","motivo":"M"}] "observaciones":[]}',
      '{"cambios":[],"observaciones":["sin cerrar]}',
    ]) {
      expect(leerRespuestaDeEstructura(texto), texto).toBeNull();
    }
  });
});

describe("(b) · el plazo total contra el plan, en la dirección correcta", () => {
  /* Prueba A3: con el plan en 15 semanas y 12 acordadas, las 3 corridas de E3 dijeron «3 semanas de
     holgura» y otras dos «dentro del plazo». El comparador solo buscaba «12 semanas» y no lo vio. */
  it("la frase exacta, en las tres direcciones y en singular", () => {
    expect(fraseDelPlazo(15, 12)).toBe("el plan se pasa 3 semanas del plazo acordado");
    expect(fraseDelPlazo(13, 12)).toBe("el plan se pasa 1 semana del plazo acordado");
    expect(fraseDelPlazo(10, 12)).toBe("quedan 2 semanas de margen");
    expect(fraseDelPlazo(11, 12)).toBe("queda 1 semana de margen");
    expect(fraseDelPlazo(12, 12)).toBe(FRASE_PLAZO_JUSTO);
  });

  it("el revisor de la prueba en vivo: marca las observaciones reales que decían lo contrario", () => {
    const E3 =
      "El kickoff confirmó 12 semanas de proyecto (reunión 'Kick off - CAV', 23 sep 2026); el calendario actual cierra en " +
      "la semana 15 (4 ene 2027), lo que da 3 semanas de holgura sobre las 12 acordadas; el CSE debe decidir si ajusta el cierre.";
    const E1 =
      "El kickoff del 23 de septiembre confirmó 12 semanas de proyecto; el cierre actual del calendario es la semana 15 " +
      "(28 dic), lo que está dentro del plazo, pero los cambios propuestos suman semanas adicionales.";
    // En la dirección correcta pero sin la frase: tampoco alcanza (la frase es lo que se pide).
    const sinFrase =
      "El kick-off fijó un plazo de 12 semanas; el cierre planificado actual es semana 15, lo que excede ese plazo.";
    for (const o of [E3, E1, sinFrase]) expect(revisarDireccionDelPlazo([o], 15, 12).ok, o).toBe(false);
    expect(revisarDireccionDelPlazo([E3], 15, 12).motivo).toContain("el plan se pasa 3 semanas del plazo acordado");
  });

  it("acepta la frase correcta y rechaza una contraria al lado", () => {
    const bien = "El kick-off acordó 12 semanas: el plan se pasa 3 semanas del plazo acordado (hoy dura 15).";
    expect(revisarDireccionDelPlazo(["Otra cosa.", bien], 15, 12)).toEqual({ ok: true, motivo: "" });
    expect(revisarDireccionDelPlazo([bien, "Con el plazo de 12 semanas todavía hay holgura."], 15, 12).ok).toBe(false);
    expect(revisarDireccionDelPlazo(["El plazo es de 12 semanas: quedan 2 semanas de margen."], 10, 12).ok).toBe(true);
    expect(revisarDireccionDelPlazo(["El plazo es de 12 semanas: el plan se pasa 2 semanas del plazo acordado."], 10, 12).ok).toBe(false);
    expect(revisarDireccionDelPlazo(["Nada sobre plazos."], 15, 12).ok).toBe(false);
  });

  it("el medidor tolera el número, las negaciones y las observaciones que no hablan del cierre (segunda vuelta)", () => {
    /* La revisión lo reprodujo: con 1 semana de diferencia el modelo escribe «se pasa 1 semanas» (el
       prompt da las plantillas en plural) y el medidor decía que no; «sin margen para imprevistos»
       se leía como contraria; y cualquier observación con «plazo» y «a tiempo» también. La edición
       que pone en rojo cada bloque: volver a la frase exacta de `fraseDelPlazo`, sacar la negación
       de `afirma`, o volver a medir toda observación que diga «plazo». */
    const ACORDO = "El kick-off acordó 12 semanas: ";
    // Singular o plural: dicen lo correcto.
    for (const [o, plan] of [
      ["el plan se pasa 1 semanas del plazo acordado.", 13],
      ["el plan se pasa 1 semana del plazo acordado.", 13],
      ["quedan 1 semanas de margen.", 11],
      ["queda 1 semana de margen.", 11],
    ] as const) {
      expect(revisarDireccionDelPlazo([ACORDO + o], plan, 12), o).toEqual({ ok: true, motivo: "" });
    }
    // Una negación no es lo contrario.
    for (const [o, plan] of [
      ["el plan se pasa 3 semanas del plazo acordado, sin margen para imprevistos.", 15],
      ["el plan se pasa 3 semanas del plazo acordado y no hay holgura.", 15],
      ["el plan no se pasa: quedan 2 semanas de margen.", 10],
    ] as const) {
      expect(revisarDireccionDelPlazo([ACORDO + o], plan, 12), o).toEqual({ ok: true, motivo: "" });
    }
    // Otra observación con «plazo» y «a tiempo» que no habla del cierre no se mide.
    expect(
      revisarDireccionDelPlazo(
        [ACORDO + "el plan se pasa 3 semanas del plazo acordado.", "El plazo de entrega de las artes se cumplió a tiempo."],
        15,
        12,
      ),
    ).toEqual({ ok: true, motivo: "" });
    // Y lo que sí dice lo contrario sigue marcado, aunque haya una negación en OTRA cláusula.
    expect(
      revisarDireccionDelPlazo([ACORDO + "el plan se pasa 3 semanas del plazo acordado, pero no importa: hay holgura."], 15, 12).ok,
    ).toBe(false);
  });

  it("el prompt obliga a esas frases, desde las mismas constantes", () => {
    /* La edición que la pone en rojo: volver a «anota el cierre actual contra el plazo acordado» a
       secas, o escribir las frases a mano en el prompt (dejarían de ser las que mide la prueba). */
    const P = PROMPT_ESTRUCTURA_CRONOGRAMA;
    const regla = P.split("\n").find((l) => l.includes("plazo TOTAL")) ?? "";
    for (const f of [PLANTILLA_PLAZO_EXCEDIDO, PLANTILLA_PLAZO_CON_MARGEN, FRASE_PLAZO_JUSTO]) expect(regla).toContain(`«${f}»`);
    /* (2026-09-24: el calendario cierra con el «CIERRE ACTUAL» —el fijado a mano, u hoy si el
       planificado ya pasó— en vez del «LARGO DEL PLAN HOY», y el prompt nombra el plazo contado desde
       hoy. La edición que la pone en rojo: volver a comparar contra el largo de las fases.) */
    expect(regla).toContain("«CIERRE ACTUAL»");
    expect(regla).toMatch(/contado desde hoy/);
    expect(regla).not.toContain("LARGO DEL PLAN");
    expect(regla).toMatch(/nunca digas «holgura», «margen» ni «dentro del plazo»/);
    const src = fs.readFileSync(path.join(process.cwd(), "lib/agents/estructura-cronograma.ts"), "utf8");
    expect(src).toContain("${PLANTILLA_PLAZO_EXCEDIDO}");
    expect(src).toContain("${PLANTILLA_PLAZO_CON_MARGEN}");
  });
});

describe("G4 · sin cambios reales no se guarda nada", () => {
  it("un «ajustar» al mismo valor, o cambios: [], dan propuesta null", () => {
    /* La edición que la pone en rojo: devolver la propuesta con 0 deltas. El auto-descarte de la
       pantalla la borraría en silencio y la cadena al paso 2 quedaría esperando algo que no existe. */
    expect(armar([{ tipo: "ajustar", faseId: "c", durationWeeks: 2, sessionCount: 2, motivo: "M" }]).propuesta).toBeNull();
    expect(armar([]).propuesta).toBeNull();
    expect(construirPropuestaDeEstructura({ fases: FASES, crudo: "basura", anchorISO: null }).propuesta).toBeNull();
  });

  it("las observaciones sobreviven aunque no haya cambios (van a la respuesta «sin-cambios»)", () => {
    const r = construirPropuestaDeEstructura({
      fases: FASES,
      anchorISO: null,
      crudo: {
        estructura: {
          cambios: [],
          observaciones: ["En el kick-off se habló de 12 semanas; el plan cierra en 13.", "x".repeat(400), "", 3, "c", "d", "e", "f"],
        },
      },
    });
    expect(r.propuesta).toBeNull();
    expect(r.observaciones).toHaveLength(5);
    expect(r.observaciones[1].length).toBeLessThanOrEqual(300);
  });

  it("la propuesta que sale se descompone en los MISMOS deltas del lado de la pantalla", () => {
    const r = armar([{ tipo: "ajustar", faseId: "c", durationWeeks: 3, motivo: "M" }]);
    const actuales = FASES.map(({ id, name, durationWeeks, startWeek, sessionCount, notes, activityType }) => ({
      id, name, durationWeeks, startWeek, sessionCount, notes, activityType,
    }));
    expect(computeProposalDeltas(actuales, r.propuesta!, null)).toEqual(r.deltas);
  });
});

/**
 * ── #1 / #28 · LA PROPUESTA DICE QUÉ CAMBIA, NO GUARDA UNA FOTO (revisión adversarial, 2026-09-24) ──
 * La propuesta copiaba todas las fases tal como estaban, y los deltas se recalculan contra las fases
 * VIVAS campo por campo. Lo que el CSE editaba mientras la propuesta esperaba —o lo que un autoguardado
 * en vuelo todavía no había escrito cuando el paso 1 leyó la base— volvía como una «sugerencia» que lo
 * revertía, pegada al cambio de la reunión en la MISMA clave: aceptar la duración pisaba la nota nueva.
 */
describe("#1 / #28 · lo que el CSE edita mientras la propuesta espera no vuelve como sugerencia", () => {
  const vivas = (cambios: (f: FaseParaEstructura) => Partial<FaseParaEstructura>) =>
    FASES.map((f) => ({ ...f, ...cambios(f) })).map(({ id, name, durationWeeks, startWeek, sessionCount, notes, activityType }) => ({
      id, name, durationWeeks, startWeek, sessionCount, notes, activityType,
    }));

  it("otra nota, otro nombre, otra duración: solo queda el cambio que pidió la reunión", () => {
    /* La edición que la pone en rojo: comparar TODOS los campos (sacar `camposDeLaFasePropuesta` de
       computeProposalDeltas) o no escribir `campos` en el armador. */
    const r = armar([{ tipo: "ajustar", faseId: "c", durationWeeks: 3, motivo: "Reunión 22 sep: Capacitación pasa a 3" }]);
    const despues = vivas((f) =>
      f.id === "c"
        ? { notes: "Llevar manual impreso" }
        : f.id === "b"
          ? { name: "Configuración CRM" }
          : f.id === "d"
            ? { durationWeeks: 4 }
            : {},
    );
    const deltas = computeProposalDeltas(despues, r.propuesta!, null);
    expect(deltas.map((d) => d.key)).toEqual(["mod:c"]);
    const mod = deltas[0];
    expect(mod.kind === "MODIFY_PHASE" ? mod.changes : null, "aceptar la duración pisaría la nota nueva").toEqual([
      { field: "durationWeeks", from: 2, to: 3 },
    ]);
  });

  it("la foto vieja de un autoguardado en vuelo no revierte lo recién guardado", () => {
    /* El caso de la revisión: el paso 1 leyó «Pruebas» con 2 semanas y la nota vieja; el PUT en vuelo
       dejó 4 semanas y la nota nueva. El modelo solo sumó una fase: no hay nada que revertir. */
    const r = armar([
      { tipo: "agregar", despuesDeFaseId: "d", name: "Piloto con socios", durationWeeks: 1, motivo: "Reunión 22 sep" },
    ]);
    const despues = vivas((f) => (f.id === "d" ? { durationWeeks: 4, notes: "Lo acordado el 22" } : {}));
    expect(computeProposalDeltas(despues, r.propuesta!, null).map((d) => d.key)).toEqual(["add:5"]);
  });

  it("un orden cambiado a mano no vuelve como reordenamiento, y un «mover» pendiente se arma sobre el orden vivo", () => {
    /* La edición que la pone en rojo: volver a tomar el orden del array (sin `movidas`) en
       `secuenciaPropuesta`, o guardar el array ya movido en el armador. */
    const sinMover = armar([{ tipo: "ajustar", faseId: "c", durationWeeks: 3, motivo: "M" }]);
    const aMano = vivas(() => ({}));
    [aMano[3], aMano[4]] = [aMano[4], aMano[3]]; // el CSE puso «Pruebas» antes de «Capacitación»
    expect(computeProposalDeltas(aMano, sinMover.propuesta!, null).map((d) => d.key)).toEqual(["mod:c"]);

    const conMover = armar([{ tipo: "mover", faseId: "b", despuesDeFaseId: "d", motivo: "Reunión 22 sep" }]);
    const reorden = computeProposalDeltas(aMano, conMover.propuesta!, null).find((d) => d.kind === "REORDER_PHASES");
    expect(reorden && reorden.kind === "REORDER_PHASES" ? reorden.ids : null, "el «mover» revierte el orden manual").toEqual([
      "s0", "a", "d", "b", "c", "e", "f",
    ]);
    expect(buildPhaseOrder(aMano, conMover.propuesta!, new Set(["reorder"])).map((s) => (s.kind === "existing" ? s.id : "nueva"))).toEqual([
      "s0", "a", "d", "b", "c", "e", "f",
    ]);
  });

  it("resolver una sugerencia no convierte al resto en una foto: después de reescribir, sigue sin revertir", () => {
    /* La edición que la pone en rojo: re-emitir las fases sin sugerencia SIN `campos: []` en
       `reescribirPropuestaPendiente` (volverían a compararse todos sus campos). */
    const r = armar([
      { tipo: "ajustar", faseId: "c", durationWeeks: 3, motivo: "M1" },
      { tipo: "mover", faseId: "b", despuesDeFaseId: "d", motivo: "M2" },
    ]);
    // Se aceptó «Capacitación» a 3 semanas; después el CSE le escribe una nota a esa fase y a otra.
    const base = vivas((f) => (f.id === "c" ? { durationWeeks: 3 } : {}));
    const reescrita = reescribirPropuestaPendiente(r.propuesta!, base, new Set(["mod:c"]));
    const conNota = base.map((f) => (f.id === "a" || f.id === "c" ? { ...f, notes: "nota que escribió el CSE" } : f));
    expect(computeProposalDeltas(conNota, reescrita, null).map((d) => d.key)).toEqual(["reorder"]);
    // Resuelto el «mover», sus movidas se van con él.
    expect(reescribirPropuestaPendiente(reescrita, base, new Set(["reorder"])).movidas).toEqual([]);
  });

  it("la del handoff (sin `campos` ni `movidas`) sigue comparando todo, como antes", () => {
    const actuales = vivas(() => ({}));
    const handoff = {
      anchorStartDate: null,
      phases: actuales.map((f) => (f.id === "c" ? { ...f, notes: "nota del handoff" } : { ...f })),
    };
    expect(computeProposalDeltas(actuales, handoff, null).map((d) => d.key)).toEqual(["mod:c"]);
  });
});

describe("la máquina de pasos de la pantalla", () => {
  it("después de pedir la estructura", () => {
    /* ⛔ Una falla del paso 1 NUNCA traba al CSE: sigue con las tareas. Solo el 403 detiene (sin
       permiso, el paso 2 tampoco lo tendría). */
    expect(pasoTrasEstructura({ red: true })).toEqual({ paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA });
    expect(pasoTrasEstructura({ status: 500 })).toEqual({ paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA });
    /* ⚠ ACTUALIZADA (revisión adversarial, 2026-09-24), con esta razón: el 409 seguía con las tareas
       («tareas» + AVISO_PROPUESTA_PENDIENTE). Un 409 no es una falla del paso 1: YA hay cambios de
       fases sin decidir, y el detalle —la corrida más cara— se armaba sobre fases que nadie decidió;
       el mismo aviso pedía volver a regenerar, así que se pagaba dos veces. Ahora la pantalla trae esa
       propuesta y espera («decidir»). La edición que la pone en rojo: volver a «tareas» en el 409. */
    expect(pasoTrasEstructura({ status: 409 })).toEqual({ paso: "decidir" });
    expect(pasoTrasEstructura({ status: 403, message: "Sin permiso." })).toEqual({ paso: "detener", mensaje: "Sin permiso." });
    expect(pasoTrasEstructura({ status: 200, estado: "propuesta" })).toEqual({ paso: "esperar" });
    expect(pasoTrasEstructura({ status: 200, estado: "sin-cambios" })).toEqual({ paso: "tareas", aviso: AVISO_SIN_CAMBIOS });
    expect(pasoTrasEstructura({ status: 200, estado: "sin-material" })).toEqual({ paso: "tareas" });
  });

  it("sin propuesta pero con lo acordado que no entró, NO dice «no piden cambios» (segunda vuelta)", () => {
    /* La edición que la pone en rojo: volver a responder AVISO_SIN_CAMBIOS a todo «sin-cambios». */
    expect(pasoTrasEstructura({ status: 200, estado: "sin-cambios", acordadoSinEntrar: 2 })).toEqual({
      paso: "tareas",
      aviso: AVISO_ACORDADO_SIN_ENTRAR,
    });
    expect(pasoTrasEstructura({ status: 200, estado: "sin-cambios", acordadoSinEntrar: 0 })).toEqual({
      paso: "tareas",
      aviso: AVISO_SIN_CAMBIOS,
    });
    // El aviso apunta a donde el CSE lo ve: el acordeón del paso 2.
    expect(AVISO_ACORDADO_SIN_ENTRAR).toContain("«La IA también notó»");
    const modal = fs.readFileSync(path.join(process.cwd(), "components/canvas/AllPhasesRegenModal.tsx"), "utf8");
    expect(modal).toContain("La IA también notó (no se aplica sola):");
  });

  it("después de resolver sugerencias", () => {
    expect(pasoTrasResolver({ pendientes: 1, origen: "contexto", iniciadoAqui: true })).toBe("nada");
    expect(pasoTrasResolver({ pendientes: 0, origen: "handoff", iniciadoAqui: true })).toBe("nada");
    expect(pasoTrasResolver({ pendientes: 0, origen: "contexto", iniciadoAqui: true })).toBe("auto");
    // Recargó a mitad de camino, o las resolvió otra persona: se ofrece, no se dispara.
    expect(pasoTrasResolver({ pendientes: 0, origen: "contexto", iniciadoAqui: false })).toBe("ofrecer");
  });

  it("#22 · el fallo del paso 1 se guarda como lo lee el CSE: la frase de la pantalla y la causa en tuteo", () => {
    /* La corrida guardaba el crudo del SDK y el centro de corridas lo mostraba en un toast rojo, en
       inglés, encima de «sigo con las tareas». La edición que la pone en rojo: devolver `e.message`. */
    const sobrecarga = Object.assign(new Error('529 {"type":"error","error":{"type":"overloaded_error"}}'), { status: 529 });
    expect(errorDeLaRevisionDeFases(sobrecarga)).toBe(
      "No se pudieron revisar las fases esta vez (la IA está sobrecargada); se siguió con las tareas.",
    );
    expect(errorDeLaRevisionDeFases(new Error("Request timed out."))).toContain("tardó demasiado");
    expect(errorDeLaRevisionDeFases(new Error("respuesta ilegible del modelo"))).toContain("no se pudo leer");
    for (const e of [sobrecarga, new Error("Request timed out."), new Error("x"), "cualquier cosa"]) {
      const t = errorDeLaRevisionDeFases(e);
      expect(t).toContain("se siguió con las tareas");
      expect(t).not.toMatch(/overloaded|timed out|\{|avisá|probá/i);
    }
  });

  it("los avisos van en tuteo", () => {
    for (const aviso of [AVISO_FALLO_DE_ESTRUCTURA, AVISO_PROPUESTA_PENDIENTE, AVISO_DECIDE_PRIMERO, AVISO_SIN_CAMBIOS, AVISO_ACORDADO_SIN_ENTRAR, CAMBIOS_DE_FASES_SIN_DECIDIR]) {
      expect(aviso).not.toMatch(/resolvélos|volvé|revisá|podés|decidís|ves vos/);
    }
  });
});

describe("G7 · el prompt lleva las decisiones de negocio, en tuteo", () => {
  const P = PROMPT_ESTRUCTURA_CRONOGRAMA;

  it("los tipos de fase se interpolan desde el validador, no se transcriben", () => {
    expect(P).toContain(ACTIVITY_TYPES.join(" | "));
    const src = fs.readFileSync(path.join(process.cwd(), "lib/agents/estructura-cronograma.ts"), "utf8");
    expect(src).toContain('ACTIVITY_TYPES.join(" | ")');
  });

  it("quitar fases y mover el arranque están prohibidos: van a «observaciones»", () => {
    /* Decisión 2 de Elías. La edición que la pone en rojo: borrar cualquiera de las dos líneas. */
    const prohibido = P.slice(P.indexOf("PROHIBIDO"), P.indexOf("SEMANAS:"));
    expect(prohibido).toContain('va a "observaciones"');
    expect(prohibido).toMatch(/QUITAR una fase/);
    expect(prohibido).toMatch(/FECHA DE ARRANQUE del proyecto/);
  });

  it("un atraso que ya pasó no alarga la fase; un plazo total no se reparte", () => {
    /* Decisiones 1 y 3 de Elías: el plan cambia solo por lo acordado de acá en adelante. */
    expect(P).toMatch(/atraso que YA pasó[^\n]*NO alarga la fase[^\n]*observaciones/);
    expect(P).toMatch(/plazo TOTAL[^\n]*NO se reparte[^\n]*cierre actual[^\n]*plazo acordado/);
    expect(P).toMatch(/de acá en adelante/);
  });

  it("el peso de las fuentes es el de todos los agentes del cronograma", () => {
    // Decisión D: instrucciones del CSE > elegido (lo más reciente gana) > handoff.
    expect(P).toContain(PESO_DE_LAS_FUENTES);
  });

  it("⛔ ni una forma de voseo", () => {
    const VOSEO = [
      "proponé", "usá", "mirá", "podés", "querés", "tenés", "revisá", "decidí", "Generá",
      "devolvé", "anotá", "citá", "escribí", "poné", "agregá", "quitá", "sumá", "vos",
    ];
    const encontradas = VOSEO.filter((v) => new RegExp(`(?<![\\wáéíóúüñ])${v}(?![\\wáéíóúüñ])`, "i").test(P));
    expect(encontradas, "el modelo copia el registro de su prompt").toEqual([]);
  });
});

describe("G7b · lo que midió la prueba en vivo del revisor (A3, 2026-09-24)", () => {
  /* Con CAV y 8 reuniones reales, el texto de A2 rompió el JSON en 3 de 12 corridas (una llave de
     más al cerrar el envoltorio {"estructura":{…}}, o una cadena sin cerrar), dejó «un piloto de 1
     semana» solo en observaciones y renombró fases citando las instrucciones del CSE. Con el texto
     que fijan estas guardas: 24 de 24 corridas. */
  const P = PROMPT_ESTRUCTURA_CRONOGRAMA;
  /** El ejemplo del FORMATO, tal cual lo lee el modelo: de la línea que abre con «{» a la regla de «ajustar». */
  const ejemploDelFormato = () => {
    const desde = P.indexOf("FORMATO DE RESPUESTA");
    const inicio = P.indexOf("\n{", desde) + 1;
    return P.slice(inicio, P.indexOf('\n- En "ajustar"', inicio));
  };

  it("el ejemplo del formato es JSON válido y PLANO, y el armador lee sus tres cambios", () => {
    /* La edición que la pone en rojo: volver al envoltorio {"estructura":{…}} —el que el modelo
       cerraba con una llave de más— o dejar el ejemplo con un JSON que no parsea. */
    const crudo = JSON.parse(ejemploDelFormato());
    expect(Object.keys(crudo)).toEqual(["cambios", "observaciones"]);
    const r = construirPropuestaDeEstructura({ fases: FASES, crudo, anchorISO: null });
    // Los tres traen ids de mentira: se leen y se descartan uno por uno (no se ignoran en bloque).
    expect(r.propuesta).toBeNull();
    expect(r.descartados).toHaveLength(3);
    expect(r.observaciones).toEqual(["<una oración>"]);
    // Y se pide sin texto alrededor: una respuesta con prosa y un bloque ```json fue la que rompió.
    expect(P).toMatch(/SOLO este JSON, sin texto antes ni después/);
    expect(renderEstructuraDelCronograma({ instrucciones: "", fuentes: [] })).toMatch(
      /Devuelve SOLO el JSON del formato indicado, sin texto antes ni después; si nada cambia, "cambios": \[\]\.$/,
    );
  });

  it("una fase nueva con tiempo propio se propone; lo que se suma sin tiempo propio, no", () => {
    /* «Se acordó un piloto de 1 semana» quedaba solo en observaciones; «el lanzamiento arranca con
       un piloto» (sin duración) no tiene que volverse una fase. La edición que la pone en rojo:
       borrar cualquiera de las dos reglas. */
    expect(P).toMatch(/FASE NUEVA[^\n]*PROPIO tiempo[^\n]*"agregar"[^\n]*No la dejes solo en "observaciones"/);
    expect(P).toMatch(/SIN tiempo propio[^\n]*NO es una fase nueva ni alarga ninguna/);
  });

  it("una EXCLUSIÓN de las instrucciones no es motivo para tocar una fase; que las instrucciones lo PIDAN, sí", () => {
    /* El control renombraba «Desarrollo SDK / Integración» porque el brief dice «nada de
       integraciones». ⚠ ACTUALIZADA en la revisión del paso A3 (2026-09-24), con esta razón: el
       texto medido decía «Renombrar… sin que una reunión o una nota pida…» y «Cambiar o renombrar
       una fase porque choca con las instrucciones del CSE», que también frenaba un brief que PIDE
       un cambio («Capacitación dura 3 semanas») contra la decisión 4 (las instrucciones mandan).
       Lo que la prueba en vivo midió —la exclusión— sigue prohibido; lo que se abre es el pedido.
       La edición que la pone en rojo: volver a la frase amplia, sacar las instrucciones de las
       razones para renombrar, o borrar la regla de la exclusión. */
    const prohibido = P.slice(P.indexOf("PROHIBIDO"), P.indexOf("SEMANAS:"));
    expect(prohibido).toMatch(/renombrar una fase porque su tema choca con una EXCLUSIÓN de las instrucciones del CSE/);
    expect(prohibido, "volvió la frase amplia: frena también un brief que pide el cambio").not.toMatch(
      /porque choca con las instrucciones del CSE/,
    );
    expect(prohibido).toMatch(/Que las instrucciones PIDAN un cambio de fases o de tiempos sí es motivo/);
    expect(prohibido).toMatch(
      /Renombrar una fase sin que una reunión, una nota o las instrucciones del CSE pidan llamarla distinto/,
    );
    expect(prohibido).toMatch(/que el material describa su trabajo con otras palabras no es motivo/);
  });

  it("el prompt dice lo mismo que el armador: el motivo cita también las instrucciones, y el renombre de Desarrollo / Integración (segunda vuelta)", () => {
    /* La redacción de (c) abrió los cambios que piden las instrucciones, pero la regla del motivo
       y el ejemplo del FORMATO solo nombraban «la reunión o la nota»: el modelo no sabía cómo citar
       unas instrucciones, y el armador exige la cita para renombrar una fase de Desarrollo /
       Integración. Y el prompt prohibía todo renombre «hacia ni desde» Desarrollo / Integración,
       cuando el armador acepta uno de Desarrollo / Integración a Desarrollo / Integración con la
       fuente citada. La edición que la pone en rojo: volver a cualquiera de los textos viejos. */
    const regla = P.split("\n").find((l) => l.startsWith('- "motivo"')) ?? "";
    expect(regla).toMatch(/la reunión \(su título y su fecha\), la nota \(su título\) o las instrucciones del CSE/);
    const motivosDelEjemplo = [...ejemploDelFormato().matchAll(/"motivo":"([^"]*)"/g)].map((m) => m[1]);
    expect(motivosDelEjemplo).toEqual(Array(3).fill("<reunión, nota o instrucciones del CSE>"));
    const prohibido = P.slice(P.indexOf("PROHIBIDO"), P.indexOf("SEMANAS:"));
    expect(prohibido, "volvió «hacia ni desde»: prohíbe lo que el armador acepta").not.toMatch(/hacia ni desde/);
    expect(prohibido).toMatch(
      /Un nombre nuevo nunca entra ni sale de «Desarrollo \/ Integración»: una fase de «Desarrollo \/ Integración» solo cambia a otro nombre de «Desarrollo \/ Integración», y solo si se pide explícitamente\./,
    );
    // Lo mismo en la regla de la frontera que cierra el mensaje.
    expect(REGLA_DE_FRONTERA_DE_ESTRUCTURA).toContain("cita la reunión (título y fecha), la nota o las instrucciones del CSE");
    // Y el armador acepta justo eso: de Desarrollo / Integración a Desarrollo / Integración, citando las instrucciones.
    const r = construirPropuestaDeEstructura({
      fases: [...FASES, fase({ id: "dev", order: 7, name: "Desarrollo SDK / Integración", durationWeeks: 3, startWeek: 4 })],
      anchorISO: null,
      crudo: {
        cambios: [
          { tipo: "ajustar", faseId: "dev", name: "Desarrollo e integración", motivo: "Instrucciones del CSE: llamarla así." },
        ],
      },
    });
    expect(r.deltas.map((d) => d.key)).toEqual(["mod:dev"]);
  });
});

describe("G9 · el revisor NO es despachable: sin fila en `Agent`", () => {
  it("ningún script lo nombra (ni seed, ni re-siembra)", () => {
    /* Con fila, `/analyze` podría despacharlo y `resolveArtifactGate` lo correría sin celda de
       permiso. La edición que la pone en rojo: agregarlo a un seed. */
    const hallados: string[] = [];
    const rec = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules") rec(p);
          continue;
        }
        if (!/\.(ts|tsx|js|mjs|cjs|sql)$/.test(e.name)) continue;
        const src = fs.readFileSync(p, "utf8");
        if (src.includes(ID_ESTRUCTURA_CRONOGRAMA) || src.includes("ID_ESTRUCTURA_CRONOGRAMA")) hallados.push(p);
      }
    };
    for (const d of ["scripts", "prisma"]) {
      const abs = path.join(process.cwd(), d);
      if (fs.existsSync(abs)) rec(abs);
    }
    expect(hallados).toEqual([]);
  });

  it("la corrida nace sin agente: el slug es solo del medidor", () => {
    const ruta = fs.readFileSync(
      path.join(process.cwd(), "app/api/projects/[projectId]/timeline/estructura/route.ts"),
      "utf8",
    );
    expect(ruta).toContain("agentId: null");
    expect(ruta).not.toMatch(/prisma\.agent\.(findUnique|findFirst|upsert|create)/);
  });
});
