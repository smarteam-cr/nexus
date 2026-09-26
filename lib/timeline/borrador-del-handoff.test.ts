/**
 * lib/timeline/borrador-del-handoff.test.ts — la propuesta que deja el HANDOFF cuando el proyecto ya
 * tiene cronograma (E2b P2): un `borrador-v1`, escrito solo si hay algo que aplicar y sin pisar una
 * propuesta abierta con algo por decidir.
 *
 * Correr: `npx vitest run lib/timeline/borrador-del-handoff.test.ts --project unit`.
 *
 * Pruebas de CONDUCTA: el helper real contra la base falsa (vi.mock), contando las escrituras. Antes
 * esto vivía dentro de analyze y solo se vigilaba escaneando el código; en esa rama ya se había
 * escapado un defecto (02aefc2f). Cada `it` nombra la edición que lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const sesiones = vi.hoisted(() => ({ getKickoffSessionDate: vi.fn() }));
vi.mock("@/lib/sessions/project-sessions", () => sesiones);

import { guardarPropuestaDelHandoff, timelineSyncErrorDelHandoff, type ResultadoDelHandoff } from "./borrador-del-handoff";
import { borradorVacio, FORMATO_BORRADOR, leerBorrador, type Borrador } from "./borrador";
import {
  AVISO_OTRA_PROPUESTA_ENTRO,
  AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE,
  AVISO_PROPUESTA_DEL_HANDOFF_PENDIENTE,
} from "./proposal-deltas";
import type { AgentProposedPhase } from "./reconcile-proposal";

/** Una fase como la lee el helper (el select de 7 campos, sin tareas). */
const existe = (id: string, name: string, durationWeeks: number) => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
});
const propone = (name: string, durationWeeks: number): AgentProposedPhase => ({
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
});

const FASES = [existe("a", "Kick-off", 1), existe("b", "Diseño", 2), existe("c", "Pruebas", 3)];
const ANCLA = new Date("2026-10-05T00:00:00.000Z");
/** Lo que propone el agente: Pruebas pasa a 4 semanas y suma un Piloto al final. */
const PROPUESTA = [propone("Kick-off", 1), propone("Diseño", 2), propone("Pruebas", 4), propone("Piloto", 2)];

const fila = (extra: Record<string, unknown> = {}) => ({
  anchorStartDate: ANCLA,
  pendingProposal: null,
  pendingProposalRunId: null,
  phases: FASES,
  ...extra,
});
const guardar = (fases: AgentProposedPhase[] = PROPUESTA) => {
  const claves = ["aaaaaaaa-1", "bbbbbbbb-2", "cccccccc-3"];
  return guardarPropuestaDelHandoff({ projectId: "p1", corrida: "run-h", fases, nuevaClave: () => claves.shift() ?? "dddddddd-4" });
};
const escrito = () => db.projectTimeline.updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: { pendingProposal: Borrador; pendingProposalRunId: string } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
  sesiones.getKickoffSessionDate.mockResolvedValue(null);
});

describe("guardarPropuestaDelHandoff — cuándo NO escribe", () => {
  it("1 · sin cronograma: lo dice y no escribe (analyze crea las fases)", async () => {
    /* La edición que la pone en rojo: escribir una propuesta cuando no hay fila, o devolver otra cosa
       (analyze no crearía el cronograma). */
    db.projectTimeline.findUnique.mockResolvedValue(null);
    expect(await guardar()).toEqual({ tipo: "sin-cronograma" });
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });

  it("2 · lo que propone ya es lo que hay: no escribe ni avisa", async () => {
    /* La edición que la pone en rojo: dejar una propuesta idéntica (el CSE tenía que descartarla). */
    db.projectTimeline.findUnique.mockResolvedValue(fila());
    expect(await guardar([propone("Kick-off", 1), propone("Diseño", 2), propone("Pruebas", 3)])).toEqual({ tipo: "sin-cambios" });
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });

  it("⭐ 9 · un nombre repetido no deja una fase imposible (D9): sin cambios, sin escribir", async () => {
    /* Wherex tiene dos fases que se llaman igual. La edición que la pone en rojo: volver a emparejar
       siempre con la primera del nombre (dos cambios con el mismo id) o proponer la repetida como fase
       nueva (choca siempre y frena lo que viene después). */
    db.projectTimeline.findUnique.mockResolvedValue(
      fila({ phases: [existe("a1", "Implementación", 2), existe("b", "Diseño", 2), existe("a2", "Implementación", 2)] }),
    );
    expect(await guardar([propone("Implementación", 2), propone("Diseño", 2), propone("Implementación", 2)])).toEqual({
      tipo: "sin-cambios",
    });
    db.projectTimeline.findUnique.mockResolvedValue(fila({ phases: [existe("a", "Kick-off", 1)] }));
    expect(await guardar([propone("Kick-off", 1), propone("Kick-off", 1)])).toEqual({ tipo: "sin-cambios" });
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });
});

describe("guardarPropuestaDelHandoff — escribe un borrador v1", () => {
  it("⭐ 3 · sin propuesta abierta: v1 del handoff, solo si sigue sin haber ninguna, con la corrida como token", async () => {
    /* La edición que la pone en rojo: volver al formato viejo `{ anchorStartDate, phases }`, dejar
       claves derivadas de posiciones (`nueva:`), que espere tareas, o escribir sin condicionar. */
    db.projectTimeline.findUnique.mockResolvedValue(fila());
    expect(await guardar()).toEqual({ tipo: "propuesta" });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = escrito();
    expect(where).toEqual({ projectId: "p1", pendingProposal: { equals: Prisma.DbNull } });
    expect(data.pendingProposalRunId).toBe("run-h");
    expect(data.pendingProposal).toMatchObject({ formato: FORMATO_BORRADOR, origen: "handoff", tareas: null, pedido: null, version: 0 });
    const guardado = JSON.parse(JSON.stringify(data.pendingProposal));
    expect(JSON.stringify(guardado)).not.toContain("nueva:");
    const nuevas = data.pendingProposal.cambios.filter((c) => c.tipo === "fase-nueva");
    expect(nuevas.map((c) => c.clave)).toEqual(["n:aaaaaaaa"]);
    expect(data.pendingProposal.cambios.find((c) => c.tipo === "fase-cambia")).toMatchObject({
      faseId: "c",
      campo: "durationWeeks",
      desde: 3,
      a: 4,
    });
    // Lo leen igual la pantalla y el servidor (E2a): nada queda como desconocido.
    expect(leerBorrador(guardado)?.desconocidos).toBeUndefined();
  });

  it("⭐ 6 · una v1 abierta SIN nada por decidir se reemplaza, condicionado a su token y su versión", async () => {
    /* La edición que la pone en rojo: condicionar solo al token (una edición del borrador en el medio
       se pisaría) o pisar sin condición. */
    const yaEsta: Borrador = {
      formato: FORMATO_BORRADOR,
      version: 3,
      origen: "contexto",
      observaciones: [],
      cambios: [{ tipo: "fase-cambia", clave: "fase:b:durationWeeks", faseId: "b", fase: "Diseño", campo: "durationWeeks", desde: 1, a: 2 }],
      pedido: "regenerar",
      tareas: { corrida: "run-2", listas: true },
      tareasArmadasPara: {},
    };
    db.projectTimeline.findUnique.mockResolvedValue(fila({ pendingProposal: JSON.parse(JSON.stringify(yaEsta)), pendingProposalRunId: "run-v" }));
    expect(await guardar()).toEqual({ tipo: "propuesta" });
    expect(escrito().where).toEqual({
      projectId: "p1",
      pendingProposalRunId: "run-v",
      pendingProposal: { path: ["version"], equals: 3 },
    });
    /* ⚠ REESCRITA en E4 (2026-09), con esta razón: pedía que una propuesta del formato viejo sin nada por
       decidir se reemplazara condicionada solo al token. Desde E4 lo que no es un v1 no se sabe leer, y
       `propuestaPorDecidir` FALLA CERRADA: el handoff no pisa lo que no entiende (se descarta en la
       pantalla). La edición que la pone en rojo: `if (!b) return false` en `propuestaPorDecidir`. */
    vi.clearAllMocks();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const vieja = { anchorStartDate: null, phases: FASES };
    db.projectTimeline.findUnique.mockResolvedValue(fila({ pendingProposal: vieja, pendingProposalRunId: "run-viejo" }));
    expect(await guardar()).toMatchObject({ tipo: "aviso" });
    expect(db.projectTimeline.updateMany, "el handoff pisó lo que no sabe leer").not.toHaveBeenCalled();
  });

  it("⭐ 8 · el arranque solo se propone si el proyecto no tenía (su `desde` es null)", async () => {
    /* La edición que la pone en rojo: proponer el kickoff encima de un arranque que ya existe, o
       fijarle un `desde` que no es null (el formato viejo lo infería así). */
    sesiones.getKickoffSessionDate.mockResolvedValue(new Date("2026-10-12T15:00:00.000Z"));
    db.projectTimeline.findUnique.mockResolvedValue(fila({ anchorStartDate: null }));
    await guardar();
    expect(escrito().data.pendingProposal.cambios[0]).toEqual({ tipo: "ancla", clave: "ancla", desde: null, a: "2026-10-12" });
    // Con arranque: ni se consulta el kickoff ni se propone.
    vi.clearAllMocks();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    db.projectTimeline.findUnique.mockResolvedValue(fila());
    await guardar();
    expect(sesiones.getKickoffSessionDate).not.toHaveBeenCalled();
    expect(escrito().data.pendingProposal.cambios.some((c) => c.tipo === "ancla")).toBe(false);
  });
});

describe("guardarPropuestaDelHandoff — una abierta con algo por decidir no se pisa", () => {
  it("⭐ 4 · la vieja de un handoff anterior: avisa con su texto y no escribe", async () => {
    /* La edición que la pone en rojo: sacar la pregunta (se pisaría a mitad de la revisión) o avisar
       con el texto de las reuniones. */
    const vieja = { anchorStartDate: null, phases: [...FASES.slice(0, 2), { ...FASES[2], durationWeeks: 6 }] };
    db.projectTimeline.findUnique.mockResolvedValue(fila({ pendingProposal: vieja, pendingProposalRunId: "run-viejo" }));
    expect(await guardar()).toEqual({ tipo: "aviso", aviso: AVISO_PROPUESTA_DEL_HANDOFF_PENDIENTE });
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });

  it("⭐ 5 · una v1 que espera sus tareas: avisa con el texto de las reuniones y no escribe", async () => {
    /* La edición que la pone en rojo: decidir solo por el plan (vacío = nada que decidir): la corrida
       pagada del paso 2 se perdería. */
    const vacio = JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" })));
    db.projectTimeline.findUnique.mockResolvedValue(fila({ pendingProposal: vacio, pendingProposalRunId: "run-2" }));
    expect(await guardar()).toEqual({ tipo: "aviso", aviso: AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE });
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });

  it("7 · si en el medio entró otra, no se pisa y se avisa", async () => {
    /* La edición que la pone en rojo: ignorar el `count` (el CSE no se enteraría de que su propuesta
       no quedó). */
    db.projectTimeline.findUnique.mockResolvedValue(fila());
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(await guardar()).toEqual({ tipo: "aviso", aviso: AVISO_OTRA_PROPUESTA_ENTRO });
  });
});

describe("timelineSyncErrorDelHandoff — lo que analyze hace con el resultado", () => {
  it("⛔ la tabla de los 4 casos: solo «sin-cronograma» crea las fases, y solo el aviso llega al CSE", () => {
    /* Revisión de E2b. El reparto vivía en analyze sin guarda: callar el aviso (el CSE no se entera de
       que su handoff no guardó las sugerencias) o mandar «sin-cambios» a crear un cronograma que ya
       existe (`projectId @unique`: un error de Prisma cada vez que regenera sin cambios) quedaba en
       verde. Las ediciones que la ponen en rojo: cualquiera de esas dos, o crear con «propuesta». Que
       analyze lo use tal cual lo vigila «#3 / #6» (lib/contexto/estructura-cronograma.test.ts). */
    const tabla: Array<[ResultadoDelHandoff, ReturnType<typeof timelineSyncErrorDelHandoff>]> = [
      [{ tipo: "sin-cronograma" }, { crear: true }],
      [{ tipo: "sin-cambios" }, { crear: false, timelineSyncError: null }],
      [{ tipo: "propuesta" }, { crear: false, timelineSyncError: null }],
      [{ tipo: "aviso", aviso: AVISO_OTRA_PROPUESTA_ENTRO }, { crear: false, timelineSyncError: AVISO_OTRA_PROPUESTA_ENTRO }],
    ];
    for (const [resultado, esperado] of tabla) {
      expect(timelineSyncErrorDelHandoff(resultado), resultado.tipo).toEqual(esperado);
    }
  });
});
