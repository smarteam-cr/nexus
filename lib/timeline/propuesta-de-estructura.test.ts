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
  AVISO_FALLO_DE_ESTRUCTURA,
  AVISO_PROPUESTA_PENDIENTE,
  AVISO_SIN_CAMBIOS,
  MAX_FASES_NUEVAS,
  construirPropuestaDeEstructura,
  pasoTrasEstructura,
  pasoTrasResolver,
  type FaseParaEstructura,
} from "./propuesta-de-estructura";
import { computeProposalDeltas } from "./proposal-deltas";
import { ACTIVITY_TYPES } from "./validate";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import { PESO_DE_LAS_FUENTES } from "@/lib/contexto/material-cronograma";
import { ID_ESTRUCTURA_CRONOGRAMA, PROMPT_ESTRUCTURA_CRONOGRAMA } from "@/lib/agents/estructura-cronograma";

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
  fase({ id: "e", order: 5, name: "Go-live", durationWeeks: 1, status: "DONE" }),
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
    const nombres = r.propuesta!.phases.map((p) => p.name);
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

describe("la máquina de pasos de la pantalla", () => {
  it("después de pedir la estructura", () => {
    /* ⛔ Una falla del paso 1 NUNCA traba al CSE: sigue con las tareas. Solo el 403 detiene (sin
       permiso, el paso 2 tampoco lo tendría). */
    expect(pasoTrasEstructura({ red: true })).toEqual({ paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA });
    expect(pasoTrasEstructura({ status: 500 })).toEqual({ paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA });
    expect(pasoTrasEstructura({ status: 409 })).toEqual({ paso: "tareas", aviso: AVISO_PROPUESTA_PENDIENTE });
    expect(pasoTrasEstructura({ status: 403, message: "Sin permiso." })).toEqual({ paso: "detener", mensaje: "Sin permiso." });
    expect(pasoTrasEstructura({ status: 200, estado: "propuesta" })).toEqual({ paso: "esperar" });
    expect(pasoTrasEstructura({ status: 200, estado: "sin-cambios" })).toEqual({ paso: "tareas", aviso: AVISO_SIN_CAMBIOS });
    expect(pasoTrasEstructura({ status: 200, estado: "sin-material" })).toEqual({ paso: "tareas" });
  });

  it("después de resolver sugerencias", () => {
    expect(pasoTrasResolver({ pendientes: 1, origen: "contexto", iniciadoAqui: true })).toBe("nada");
    expect(pasoTrasResolver({ pendientes: 0, origen: "handoff", iniciadoAqui: true })).toBe("nada");
    expect(pasoTrasResolver({ pendientes: 0, origen: "contexto", iniciadoAqui: true })).toBe("auto");
    // Recargó a mitad de camino, o las resolvió otra persona: se ofrece, no se dispara.
    expect(pasoTrasResolver({ pendientes: 0, origen: "contexto", iniciadoAqui: false })).toBe("ofrecer");
  });

  it("los avisos van en tuteo", () => {
    for (const aviso of [AVISO_FALLO_DE_ESTRUCTURA, AVISO_PROPUESTA_PENDIENTE, AVISO_SIN_CAMBIOS]) {
      expect(aviso).not.toMatch(/resolvélos|volvé|revisá|podés/);
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
