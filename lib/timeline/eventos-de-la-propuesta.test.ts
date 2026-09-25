/**
 * lib/timeline/eventos-de-la-propuesta.test.ts — los eventos del watchdog de lo que dictó el chat (E3, D15).
 *
 * Correr: `npx vitest run lib/timeline/eventos-de-la-propuesta.test.ts --project unit`.
 *
 * Sin propuesta abierta, lo que acuerda el chat va por el PUT del cronograma, que emite un evento por
 * fase y por tarea que cambia (app/api/projects/[projectId]/timeline/route.ts). Con una propuesta
 * abierta va a la propuesta y se emite al aplicar: con las MISMAS acciones, y solo lo del chat.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  claveDeFaseQueSeVa,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  planDeAplicacion,
  type Borrador,
  type Cambio,
  type CambioFaseSeVa,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { aplicadosDelChat, eventosDelChatAplicado } from "./eventos-de-la-propuesta";

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
const fase = (id: string, name: string, durationWeeks: number, tareas: TareaDelVivo[]): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tareas,
  status: "PENDING",
});
const B1 = tarea("b1", "Mapear procesos", 0);
const B2 = tarea("b2", "Definir pipeline", 1, { status: "DONE" });
const C1 = tarea("c1", "Probar flujos", 2);
const D1 = tarea("d1", "Firmar el acta", 0);
const VIVO: Vivo = {
  ancla: "2026-10-05",
  fases: [fase("a", "Kick-off", 1, []), fase("b", "Diseño", 2, [B1, B2]), fase("c", "Pruebas", 3, [C1]), fase("d", "Cierre", 1, [D1])],
};
const seVaLaFase = (id: string): CambioFaseSeVa => {
  const f = VIVO.fases.find((x) => x.id === id)!;
  return {
    tipo: "fase-se-va",
    clave: claveDeFaseQueSeVa(id),
    faseId: id,
    desde: {
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: null,
      sessionCount: null,
      notes: null,
      activityType: null,
      status: "PENDING",
      tareas: (f.tareas ?? []).map((t) => ({ id: t.id, foto: fotoDeTarea(t) })),
    },
    porChat: true,
  };
};
const v1 = (cambios: Cambio[]): Borrador => ({
  formato: FORMATO_BORRADOR,
  version: 1,
  origen: "contexto",
  observaciones: [],
  cambios,
  pedido: "regenerar",
  tareas: { corrida: "run-1", listas: true },
  tareasArmadasPara: { b: { nombre: "Diseño", semanas: 2 }, c: { nombre: "Pruebas", semanas: 3 } },
});

describe("los eventos de lo que dictó el chat, al aplicar", () => {
  it("⭐ solo lo `porChat` aplicado, con las acciones del PUT", () => {
    /* La edición que la pone en rojo: emitir también lo de la IA (el watchdog vería cientos de eventos
       por un «Regenerar todo»), o perder los del chat (dejaría de enterarse de lo que el CSE pidió). */
    const plan = planDeAplicacion(
      VIVO,
      v1([
        { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 4, porChat: true },
        { tipo: "fase-cambia", clave: "fase:a:name", faseId: "a", fase: "Kick-off", campo: "name", desde: "Kick-off", a: "Arranque", porChat: true },
        { tipo: "fase-cambia", clave: "fase:b:notes", faseId: "b", fase: "Diseño", campo: "notes", desde: null, a: "una nota", porChat: true },
        {
          tipo: "fase-nueva",
          clave: "n:chat",
          fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
          despuesDe: "c",
          porChat: true,
        },
        { tipo: "tarea-nueva", clave: "t:chat", fase: "c", tarea: { title: "Pruebas de carga", weekIndex: 5, notes: null, party: "AMBOS", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null }, porChat: true },
        { tipo: "tarea-nueva", clave: "t:ia", fase: "b", tarea: { title: "Pruebas de humo", weekIndex: 0, notes: null, party: null, type: null, needsValidation: false, motivoPorValidar: null, fuga: null } },
        { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("c1"), tareaId: "c1", faseId: "c", desde: fotoDeTarea(C1), porChat: true },
        { tipo: "tarea-cambia", clave: claveDeTareaQueCambia("b1"), tareaId: "b1", faseId: "b", desde: fotoDeTarea(B1), a: { fase: "c" }, porChat: true },
        { tipo: "tarea-cambia", clave: claveDeTareaQueCambia("b2"), tareaId: "b2", faseId: "b", desde: fotoDeTarea(B2), a: { title: "Definir el pipeline" }, porChat: true },
        seVaLaFase("d"),
      ]),
    );
    const eventos = eventosDelChatAplicado(plan, VIVO, ["d"], [{ clave: "n:chat", id: "fase-creada" }]);
    const resumen = eventos.map((e) => [e.entityType, e.action, e.label]);
    expect(resumen).toEqual([
      ["PHASE", "CREATED", "Piloto"],
      ["PHASE", "EDITED", "Arranque"],
      ["PHASE", "MOVED", "Pruebas"],
      ["PHASE", "DELETED", "Cierre"],
      ["TASK", "CREATED", "Pruebas de carga"],
      ["TASK", "DELETED", "Probar flujos"],
      ["TASK", "MOVED", "Mapear procesos"],
      ["TASK", "EDITED", "Definir el pipeline"],
    ]);
    // Las notas no cuentan (la regla del PUT) y lo de la IA, aplicado igual, no emite nada.
    expect(plan.aplicadas.some((c) => c.clave === "t:ia"), "la de la IA tiene que aplicarse para que la guarda mire algo").toBe(true);
    expect(eventos.some((e) => e.label === "Diseño")).toBe(false);
    expect(eventos.some((e) => e.label === "Pruebas de humo")).toBe(false);
    // El detalle viaja como el del PUT: solo lo que cambió, y la semana acotada a la duración final.
    expect(eventos.find((e) => e.action === "CREATED" && e.entityType === "PHASE")).toMatchObject({ entityId: "fase-creada" });
    expect(eventos.find((e) => e.label === "Pruebas" && e.entityType === "PHASE")).toMatchObject({
      before: { durationWeeks: 3 },
      after: { durationWeeks: 4 },
    });
    expect(eventos.find((e) => e.label === "Pruebas de carga")).toMatchObject({ after: { weekIndex: 3, party: "AMBOS", type: "TASK" } });
    expect(eventos.find((e) => e.label === "Mapear procesos")).toMatchObject({
      entityId: "b1",
      before: { fase: "Diseño" },
      after: { fase: "Pruebas" },
    });
    expect(eventos.find((e) => e.label === "Cierre")).toMatchObject({ entityId: "d", before: { tasks: 1 } });
    expect(aplicadosDelChat(plan)).toBe(9);
  });

  it("⛔ una fase que se queda con lo suyo no emite «fase borrada»: emite cada tarea que se fue", () => {
    const plan = planDeAplicacion(VIVO, v1([seVaLaFase("b")]));
    expect(plan.escrituras.fasesQueSeVan).toEqual([{ id: "b", borrar: ["b1"], queda: true }]);
    expect(eventosDelChatAplicado(plan, VIVO, []).map((e) => [e.entityType, e.action, e.entityId])).toEqual([["TASK", "DELETED", "b1"]]);
  });

  it("sin nada del chat, ningún evento (como hoy: aplicar lo de la IA no los emitía)", () => {
    const plan = planDeAplicacion(VIVO, v1([{ tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("c1"), tareaId: "c1", faseId: "c", desde: fotoDeTarea(C1) }]));
    expect(plan.aplicadas).toHaveLength(1);
    expect(eventosDelChatAplicado(plan, VIVO, [])).toEqual([]);
  });

  it("⛔ la ruta los emite DESPUÉS de la transacción, con la fuente de aplicar, y la razón dice cuántos son del chat", () => {
    /* La edición que la pone en rojo: emitirlos dentro de la transacción (la alarga), o dejar de
       emitirlos. */
    const ruta = fs
      .readFileSync(path.join(process.cwd(), "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\/\/.*$/gm, "");
    const iTx = ruta.indexOf("prisma.$transaction(");
    const iEventos = ruta.indexOf("eventosDelChatAplicado(r.plan, r.vivo, r.fasesBorradas, r.fasesCreadas)");
    expect(iEventos, "la ruta dejó de armar los eventos del chat").toBeGreaterThan(iTx);
    const tramo = ruta.slice(iEventos, iEventos + 700);
    expect(tramo).toContain("emitTimelineEventsSafe(");
    expect(tramo).toContain('source: "AI_ASSIST_APPLY"');
    expect(ruta).toContain("(delChat > 0 ? ` (${delChat} del chat)` : \"\")");
  });
});
