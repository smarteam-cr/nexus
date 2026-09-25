/**
 * lib/contexto/cronograma-para-agentes.test.ts — EL TEXTO DEL CRONOGRAMA QUE LEEN LOS AGENTES, FIJO.
 *
 * Correr: `npx vitest run lib/contexto/cronograma-para-agentes.test.ts --project unit`.
 *
 * `loadTimelineContext` (lib/canvas/load-canvas-context.ts) arma el renglón de cada fase que leen
 * el detalle del cronograma, el avance y los demás agentes. Hasta E2a nadie fijaba ese texto: el
 * golden de detalle-cronograma.test.ts inyecta un `timelineCtx` falso. Desde E2a el paso 2 de
 * «Regenerar todo» lee la estructura SUPUESTA del borrador (fases que todavía no existen, con su
 * clave `n:…`) con el mismo renderizador, `renderCronogramaParaAgentes` (cronograma-para-agentes.ts).
 *
 * Por eso el golden va PRIMERO: se escribió y se corrió en verde contra el código de antes de la
 * extracción, con Prisma falso, en los tres modos. Los textos esperados son una transcripción a mano,
 * no una foto de la salida. La edición que lo pone en rojo: tocar un byte del formato (un separador,
 * el orden de los campos, el encabezado, el recorte de las notas, el renglón de una tarea o el de una
 * desviación). Cambiar ese texto es un cambio de prompt: se hace a propósito, en su tanda, y este
 * archivo se actualiza con el motivo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({ projectTimeline: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { renderCronogramaParaAgentes, type FaseParaAgentes } from "./cronograma-para-agentes";

/** Las fases como las devuelve el select de `loadTimelineContext` (con estado y tareas). */
const FASES = [
  {
    id: "f1",
    name: "Kickoff",
    durationWeeks: 1,
    sessionCount: 2,
    notes: "  Arranque con el cliente  ",
    activityType: "EXPLORACION",
    status: "DONE",
    tasks: [{ id: "t1", title: "Accesos", status: "DONE", weekIndex: 0 }],
  },
  {
    // Semanas y sesiones en 0, tipo null y notas solo con espacios: nada de eso se escribe.
    id: "f2",
    name: "Diseño",
    durationWeeks: 0,
    sessionCount: 0,
    notes: "   ",
    activityType: null,
    status: "IN_PROGRESS",
    tasks: [],
  },
  {
    // Sesiones null y sin notas.
    id: "f3",
    name: "Configuración",
    durationWeeks: 3,
    sessionCount: null,
    notes: null,
    activityType: "CONFIGURACION",
    status: "PENDING",
    tasks: [
      { id: "t2", title: "Configurar pipeline", status: "PENDING", weekIndex: 1 },
      { id: "t3", title: "Probar pipeline", status: "IN_PROGRESS", weekIndex: 2 },
    ],
  },
];

const DESVIACIONES = [
  {
    kind: "RETRASO",
    party: "CLIENTE",
    title: "El cliente no entregó accesos",
    weeksImpact: 2,
    occurredAt: new Date("2026-09-01T15:00:00.000Z"),
    dedupeKey: "tl1:RETRASO:accesos-cliente",
    visibleExternal: true,
    estado: "ABIERTA",
    resueltaEn: null,
  },
  {
    // Sin huella, CERRADA con fecha y sin impacto en semanas.
    kind: "ALCANCE",
    party: "SMARTEAM",
    title: "Se sumó un pipeline",
    weeksImpact: null,
    occurredAt: new Date("2026-09-05T15:00:00.000Z"),
    dedupeKey: null,
    visibleExternal: false,
    estado: "CERRADA",
    resueltaEn: new Date("2026-09-10T12:00:00.000Z"),
  },
  {
    // Una clave con dos partes no trae huella; CERRADA sin fecha de resolución.
    kind: "RETRASO",
    party: "SIN_ATRIBUIR",
    title: "Feriado",
    weeksImpact: 1,
    occurredAt: new Date("2026-09-08T15:00:00.000Z"),
    dedupeKey: "tl1:RETRASO",
    visibleExternal: false,
    estado: "CERRADA",
    resueltaEn: null,
  },
];

const SIN_IDS = [
  "CRONOGRAMA (fases en orden — contexto de solo lectura, NO lo reproduzcas como lista en tu output):",
  "1. Kickoff · 1 sem · 2 sesiones — Arranque con el cliente",
  "2. Diseño",
  "3. Configuración · 3 sem",
].join("\n");

const CON_IDS = [
  "CRONOGRAMA (fases en orden, cada una con su id — usá esos ids EXACTOS en tu output):",
  "[id: f1] 1. Kickoff · 1 sem · 2 sesiones · tipo: EXPLORACION — Arranque con el cliente",
  "[id: f2] 2. Diseño · tipo: (sin asignar)",
  "[id: f3] 3. Configuración · 3 sem · tipo: CONFIGURACION",
].join("\n");

const CON_AVANCE = [
  "CRONOGRAMA CON AVANCE CONFIRMADO (fases y tareas con su id y estado — usá esos ids EXACTOS para proponer avance; NO re-propongas lo que ya está DONE):",
  "[id: f1] 1. Kickoff · 1 sem · 2 sesiones · tipo: EXPLORACION · estado: DONE — Arranque con el cliente",
  "   - [tarea id: t1] (sem 1, DONE) Accesos",
  "[id: f2] 2. Diseño · tipo: (sin asignar) · estado: IN_PROGRESS",
  "[id: f3] 3. Configuración · 3 sem · tipo: CONFIGURACION · estado: PENDING",
  "   - [tarea id: t2] (sem 2, PENDING) Configurar pipeline",
  "   - [tarea id: t3] (sem 3, IN_PROGRESS) Probar pipeline",
  "",
  "DESVIACIONES YA REGISTRADAS (NO las vuelvas a proponer). Si el MISMO hecho sigue vigente y querés corregirlo, devolvelo con su MISMA huella y se actualiza en lugar de duplicarse.",
  "Las marcadas CERRADA ya se resolvieron: tampoco las repitas. Si ese hecho VOLVIÓ A PASAR, devolvelo con su MISMA huella y decilo en el detalle — se reabre, no se duplica:",
  "- [huella: accesos-cliente] RETRASO/CLIENTE +2sem (2026-09-01) El cliente no entregó accesos",
  "- [huella: (sin huella)] [CERRADA el 2026-09-10] ALCANCE/SMARTEAM (2026-09-05) Se sumó un pipeline",
  "- [huella: (sin huella)] [CERRADA] RETRASO/SIN_ATRIBUIR +1sem (2026-09-08) Feriado",
].join("\n");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("⭐ golden: el texto del cronograma que lee cada agente (loadTimelineContext)", () => {
  it("sin ids: fases en orden, sin tipo ni estado; 0 y null no se escriben y las notas se recortan", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ phases: FASES });
    expect(await loadTimelineContext("p1")).toBe(SIN_IDS);
  });

  it("con ids (el detalle del cronograma): cada fase con su id y su tipo, «(sin asignar)» si no tiene", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ phases: FASES });
    expect(await loadTimelineContext("p1", { includeIds: true })).toBe(CON_IDS);
  });

  it("con avance: estado de fase, una línea por tarea y las desviaciones ya registradas con su huella", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ phases: FASES, particularidades: DESVIACIONES });
    expect(await loadTimelineContext("p1", { includeProgress: true })).toBe(CON_AVANCE);
    // Las desviaciones se piden SOLO en este modo, y solo las confirmadas.
    const select = db.projectTimeline.findUnique.mock.calls[0][0].select;
    expect(select.particularidades.where).toEqual({ needsValidation: false });
  });

  it("con avance y sin desviaciones: no hay bloque de desviaciones (ni el renglón vacío)", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ phases: FASES, particularidades: [] });
    const texto = await loadTimelineContext("p1", { includeProgress: true });
    expect(texto).toBe(CON_AVANCE.slice(0, CON_AVANCE.indexOf("\n\nDESVIACIONES")));
  });

  it("sin cronograma, o sin fases: la cadena vacía (el llamador omite la fuente)", async () => {
    db.projectTimeline.findUnique.mockResolvedValue(null);
    expect(await loadTimelineContext("p1", { includeIds: true })).toBe("");
    db.projectTimeline.findUnique.mockResolvedValue({ phases: [] });
    expect(await loadTimelineContext("p1", { includeIds: true })).toBe("");
  });
});

describe("⭐ el renderizador directo: la estructura SUPUESTA del borrador (el `sobre` del paso 2)", () => {
  it("fases que todavía no existen, con su clave `n:…`, salen con el mismo formato que las reales", () => {
    /* Es lo que ve el agente de tareas en «Regenerar todo» (cargarContextoDelDetalle con `sobre`): la
       estructura hipotética, con las fases nuevas de la propuesta. Sus tareas vuelven con esa clave
       y la fusión las encuentra (tareasPropuestasDelDetalle). */
    const sobre: FaseParaAgentes[] = [
      { id: "f1", name: "Kickoff", durationWeeks: 1, sessionCount: 2, notes: "Arranque", activityType: "EXPLORACION" },
      { id: "n:0a1b2c3d", name: "Migración", durationWeeks: 2, sessionCount: null, notes: null, activityType: null },
    ];
    expect(renderCronogramaParaAgentes(sobre, { includeIds: true })).toEqual([
      "CRONOGRAMA (fases en orden, cada una con su id — usá esos ids EXACTOS en tu output):",
      "[id: f1] 1. Kickoff · 1 sem · 2 sesiones · tipo: EXPLORACION — Arranque",
      "[id: n:0a1b2c3d] 2. Migración · 2 sem · tipo: (sin asignar)",
    ]);
  });

  it("con las fases de la base da, renglón por renglón, lo mismo que loadTimelineContext", async () => {
    for (const opts of [{}, { includeIds: true }, { includeProgress: true }]) {
      db.projectTimeline.findUnique.mockResolvedValue({ phases: FASES, particularidades: [] });
      expect(renderCronogramaParaAgentes(FASES, opts).join("\n")).toBe(await loadTimelineContext("p1", opts));
    }
  });
});

describe("⛔ el formato tiene UN dueño", () => {
  it("loadTimelineContext arma sus renglones con el renderizador y su bucle de fases no se duplica", () => {
    /* La edición que la pone en rojo: volver a escribir el bucle de fases dentro de
       loadTimelineContext (dos copias del formato: el paso 2 de «Regenerar todo» leería otro texto
       que el resto de los agentes), o dejar de llamar al renderizador. */
    const src = fs
      .readFileSync(path.join(process.cwd(), "lib/canvas/load-canvas-context.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    const i = src.indexOf("export async function loadTimelineContext(");
    expect(i, "no encontré loadTimelineContext").toBeGreaterThan(-1);
    const cuerpo = src.slice(i, src.indexOf("\n}", i));
    expect(cuerpo.length, "la guarda no está mirando la función").toBeGreaterThan(300);
    expect(cuerpo).toContain("renderCronogramaParaAgentes(");
    for (const copia of ["tl.phases.forEach(", "sem`)", "sesiones`)", "(sin asignar)", "[tarea id:", "CRONOGRAMA ("]) {
      expect(cuerpo, `loadTimelineContext volvió a armar el formato por su cuenta (${copia})`).not.toContain(copia);
    }
    // El bloque de desviaciones se queda en loadTimelineContext (solo lo usa el avance).
    expect(cuerpo).toContain("DESVIACIONES YA REGISTRADAS");
  });
});
