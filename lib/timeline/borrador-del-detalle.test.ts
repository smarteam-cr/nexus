/**
 * lib/timeline/borrador-del-detalle.test.ts — L5 (§6.3): LO QUE YA HAY en cada fase, como lo arma el servidor
 * para el agente de tareas (`estructuraParaElDetalle` → `loQueYaHay`).
 *
 * Correr: `npx vitest run lib/timeline/borrador-del-detalle.test.ts --project unit`.
 *
 * El agente de tareas leía solo las fases y reescribía todo. Desde L5 lee qué fases están terminadas o en
 * curso, qué se hizo, qué está pendiente y lo que notó el paso 1. Lo que cuida esta guarda, con la base
 * FALSA (la función real corre contra esto):
 *   1. «Regenerar todo»: las terminadas se nombran para no tocarse, y lo pendiente es solo lo que la IA puede
 *      conservar (pendiente y no escrito a mano), con su `weekIndex`;
 *   2. «Regenerar» de una fase y el recálculo van CON alcance: ninguna terminada que respetar (D11: ahí «lo que
 *      ya se hizo va como tarea» manda).
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ projectTimeline: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { borradorVacio } from "./borrador";
import { estructuraParaElDetalle } from "./borrador-del-detalle";

const tareaDB = (id: string, title: string, weekIndex: number, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  weekIndex,
  order: 0,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  startDateOverride: null,
  dueDateOverride: null,
  needsValidation: false,
  ...extra,
});
const faseDB = (id: string, name: string, order: number, durationWeeks: number, status: string, tasks: unknown[]) => ({
  id,
  name,
  order,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  status,
  tasks,
});

const LARGO = "Configurar las propiedades personalizadas del objeto Negocios para ventas y para postventa, con sus vistas";
/** Kick-off terminada · Diseño en curso (hecha, pendiente de la IA, escrita a mano, en curso, retocada) · Pruebas. */
const FASES = [
  faseDB("a", "Kick-off", 0, 1, "DONE", [
    tareaDB("a1", "Reunión de arranque", 0, { status: "DONE", source: "HUMAN" }),
    tareaDB("a2", LARGO, 0, { status: "DONE" }),
  ]),
  faseDB("b", "Diseño", 1, 2, "IN_PROGRESS", [
    tareaDB("b1", "Mapear procesos", 0, { status: "DONE" }),
    tareaDB("b5", "Ajustar vistas", 0, { source: "MODIFIED" }),
    tareaDB("b2", "Definir pipeline", 1),
    tareaDB("b3", "Revisar con el cliente", 1, { source: "HUMAN" }),
    tareaDB("b4", "Armar reportes", 1, { status: "IN_PROGRESS" }),
  ]),
  faseDB("c", "Pruebas", 2, 3, "PENDING", [tareaDB("c1", "Probar flujos", 2)]),
];
const OBSERVACIONES = ["Diseño sigue en curso; el paso de tareas debe contemplarlo."];
const enLaBase = (guardado: unknown) =>
  db.projectTimeline.findUnique.mockResolvedValue({
    pendingProposal: JSON.parse(JSON.stringify(guardado)),
    anchorStartDate: null,
    closeDateOverride: null,
    phases: FASES,
  });

beforeEach(() => db.projectTimeline.findUnique.mockReset());

describe("L5 · lo que ya hay en cada fase, para el agente de tareas", () => {
  it("⭐ «Regenerar todo»: estado de cada fase, lo hecho, lo pendiente de la IA con su weekIndex, y las terminadas que no se tocan", async () => {
    /* Las ediciones que la ponen en rojo: listar como pendiente lo escrito a mano o lo que está en curso (el
       agente creería que puede reescribirlo), o no nombrar la terminada (la IA le volvía a proponer tareas). */
    enLaBase(borradorVacio({ pedido: "regenerar", corrida: "run-2", observaciones: OBSERVACIONES }));
    const sobre = await estructuraParaElDetalle("tl", "run-2");
    const l = sobre?.loQueYaHay;
    expect(l, "el paso 2 no recibe lo que ya hay").toBeDefined();
    expect(l!.conAlcance).toBe(false);
    expect(l!.terminadasQueNoSeTocan).toEqual(["a"]);
    expect(l!.observaciones).toEqual(OBSERVACIONES);
    expect(l!.fases.map((f) => [f.id, f.estado])).toEqual([
      ["a", "terminada"],
      ["b", "en curso"],
      ["c", "pendiente"],
    ]);
    const [kickoff, diseno, pruebas] = l!.fases;
    expect(kickoff.hechas).toEqual(["Reunión de arranque", `${LARGO.slice(0, 79)}…`]);
    expect(kickoff.hechas[1].length).toBe(80);
    expect(diseno.hechas).toEqual(["Mapear procesos"]);
    expect(diseno.pendientes, "lo pendiente tiene que ser solo lo que la IA puede conservar").toEqual([
      { titulo: "Ajustar vistas", semana: 0 },
      { titulo: "Definir pipeline", semana: 1 },
    ]);
    expect(pruebas.pendientes).toEqual([{ titulo: "Probar flujos", semana: 2 }]);
  });

  it("⛔ «Regenerar» de una fase: con alcance, y ninguna terminada que respetar (D11)", async () => {
    /* La edición que la pone en rojo: llenar `terminadasQueNoSeTocan` o dejar `conAlcance` en false con
       `soloFase`: el mensaje diría «lo hecho no se vuelve a proponer» y chocaría con «lo que ya se hizo va como
       tarea» de la fase que el CSE pidió regenerar. */
    enLaBase(borradorVacio({ pedido: "regenerar", corrida: "run-f", soloFase: "a" }));
    const l = (await estructuraParaElDetalle("tl", "run-f"))?.loQueYaHay;
    expect(l?.conAlcance).toBe(true);
    expect(l?.terminadasQueNoSeTocan).toEqual([]);
    // Lo que ya hay se sigue diciendo: sirve para conservar lo pendiente.
    expect(l?.fases.find((f) => f.id === "b")?.pendientes.map((p) => p.titulo)).toEqual(["Ajustar vistas", "Definir pipeline"]);
  });

  it("⛔ el recálculo: también con alcance", async () => {
    enLaBase({
      ...borradorVacio({ pedido: "regenerar", corrida: "run-2" }),
      tareas: { corrida: "run-2", listas: true },
      recalculo: { corrida: "run-r", fases: [{ id: "c", nombre: "Pruebas" }], sin: [] },
    });
    const l = (await estructuraParaElDetalle("tl", "run-r"))?.loQueYaHay;
    expect(l?.conAlcance).toBe(true);
    expect(l?.terminadasQueNoSeTocan).toEqual([]);
  });
});
