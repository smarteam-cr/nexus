import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  whereCorridasDeDocumento,
  resumenDeCorrida,
  duracionLegible,
  debeVerHistorial,
  LIMITE_HISTORIAL,
  type FilaDeCorrida,
} from "./historial-corridas";

/**
 * lib/agents/historial-corridas.test.ts — EL HISTORIAL DEL HANDOFF.
 *
 * Tres cosas que se rompen en silencio: que el contador y la lista dejen de mirar lo mismo
 * (el botón aparece y abre una lista que no coincide), que el detalle deje de acotarse al
 * proyecto (leer el contenido de una corrida ajena), y que el `output` crudo se filtre a una
 * respuesta.
 */

const AHORA = new Date("2026-08-08T12:00:00.000Z");
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);

const fila = (over: Partial<FilaDeCorrida> = {}): FilaDeCorrida => ({
  id: "run1",
  status: "DONE",
  createdAt: hace(5),
  updatedAt: hace(3),
  triggeredByEmail: "marco@smarteamcr.com",
  sourceSessionIds: ["s1", "s2"],
  ...over,
});

describe("whereCorridasDeDocumento", () => {
  it("acota al proyecto y al grupo del agente", () => {
    expect(whereCorridasDeDocumento("p1", "kickoff")).toEqual({
      projectId: "p1",
      agent: { agentGroup: "kickoff" },
    });
  });

  it("⚠ NO hay rescate de huérfanas: el handoff filtra igual de estricto que los demás", () => {
    /* La primera versión sumaba las corridas con `agentId: null` y `sourceSessionIds` no vacío,
       sobre la premisa «solo el agente de handoff setea sourceSessionIds». La auditoría probó
       que es FALSA (`lib/projects/analyze-participants.ts` también las setea), así que una
       corrida de análisis de participantes huérfana se habría colado en el historial Y en el
       `lastRun` del encabezado del handoff. La edición que la pone en rojo: reintroducir el OR. */
    expect(whereCorridasDeDocumento("p1", "handoff")).toEqual({
      projectId: "p1",
      agent: { agentGroup: "handoff" },
    });
  });
});

describe("resumenDeCorrida", () => {
  it("una corrida terminada trae su duración y quién la lanzó", () => {
    const r = resumenDeCorrida(fila(), "Marco Salas", null, AHORA);
    expect(r.estado).toBe("DONE");
    expect(r.colgada).toBe(false);
    expect(r.duracionMs).toBe(2 * 60_000);
    expect(r.lanzadaPor).toBe("Marco Salas");
    expect(r.sesionesFuente).toBe(2);
  });

  it("sin nombre cae al email; sin email, la lanzó el sistema", () => {
    expect(resumenDeCorrida(fila(), null, null, AHORA).lanzadaPor).toBe("marco@smarteamcr.com");
    expect(
      resumenDeCorrida(fila({ triggeredByEmail: null }), null, null, AHORA).lanzadaPor,
    ).toBeNull();
  });

  it("una RUNNING con latido reciente sigue en curso y NO tiene duración", () => {
    const r = resumenDeCorrida(fila({ status: "RUNNING", updatedAt: hace(2) }), null, null, AHORA);
    expect(r.estado).toBe("RUNNING");
    expect(r.colgada).toBe(false);
    expect(r.duracionMs).toBeNull(); // su updatedAt es el último latido, no el fin
  });

  it("⚠ una RUNNING sin latido hace media hora se reporta como FALLÓ, no «corriendo» eterno", () => {
    const r = resumenDeCorrida(
      fila({ status: "RUNNING", createdAt: hace(600), updatedAt: hace(500) }),
      null,
      null,
      AHORA,
    );
    expect(r.colgada).toBe(true);
    expect(r.estado).toBe("ERROR");
    expect(r.duracionMs, "una corrida muerta no reporta el tiempo que estuvo muerta").toBeNull();
  });

  it("marca cuál es la corrida vigente en el documento", () => {
    expect(resumenDeCorrida(fila({ id: "rA" }), null, "rA", AHORA).vigente).toBe(true);
    expect(resumenDeCorrida(fila({ id: "rA" }), null, "rB", AHORA).vigente).toBe(false);
    expect(resumenDeCorrida(fila({ id: "rA" }), null, null, AHORA).vigente).toBe(false);
  });
});

describe("duracionLegible", () => {
  it("segundos, minutos, y «en curso» sin dato", () => {
    expect(duracionLegible(45_000)).toBe("45 s");
    expect(duracionLegible(125_000)).toBe("2 min");
    expect(duracionLegible(null)).toBe("en curso");
  });
});

describe("debeVerHistorial — cuándo se ofrece el CTA", () => {
  it("dos o más corridas: sí", () => {
    expect(debeVerHistorial({ corridas: 2, ultimoEstado: "DONE" })).toBe(true);
    expect(debeVerHistorial({ corridas: 7, ultimoEstado: "ERROR" })).toBe(true);
  });

  it("una sola corrida OK: no (el historial sería el documento que ya está abajo)", () => {
    expect(debeVerHistorial({ corridas: 1, ultimoEstado: "DONE" })).toBe(false);
    expect(debeVerHistorial({ corridas: 1, ultimoEstado: "RUNNING" })).toBe(false);
  });

  it("⚠ una sola corrida que FALLÓ: sí — es el único lugar donde queda el motivo", () => {
    /* El error en pantalla muere al recargar la pestaña; `output` con el motivo es la única
       copia. La edición que la pone en rojo: exigir `>= 2` a secas. */
    expect(debeVerHistorial({ corridas: 1, ultimoEstado: "ERROR" })).toBe(true);
  });

  it("sin corridas o sin dato: no", () => {
    expect(debeVerHistorial({ corridas: 0, ultimoEstado: null })).toBe(false);
    expect(debeVerHistorial({})).toBe(false);
  });
});

/**
 * ── LAS GUARDAS DE LOS ENDPOINTS ────────────────────────────────────────────
 * Son rutas, así que el escaneo es de archivo — con el corte incluido, no solo la condición.
 */
describe("guardas: el where es UNO, el detalle no es IDOR, y el output crudo no sale", () => {
  const RAIZ = process.cwd();
  const LISTA = "app/api/projects/[projectId]/agent-runs/route.ts";
  const DETALLE = "app/api/projects/[projectId]/agent-runs/[runId]/route.ts";
  const HANDOFF = "app/api/projects/[projectId]/handoff/route.ts";
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("el contador y la lista usan el MISMO where, de una sola fuente", () => {
    /* Si divergieran, el botón "Ver historial" aparecería y abriría una lista que no coincide:
       los dos lados "andan bien" y el fallo es imposible de ver desde afuera.
       La edición que la pone en rojo: inlinear `agent: { agentGroup: "handoff" }` en cualquiera. */
    for (const archivo of [LISTA, HANDOFF]) {
      const codigo = sinComentarios(leer(archivo));
      expect(codigo, `${archivo} dejó de usar el where compartido`).toContain(
        "whereCorridasDeDocumento(",
      );
      expect(codigo, `${archivo} volvió a escribir el filtro a mano`).not.toMatch(
        /agentGroup:\s*"handoff"/,
      );
    }
  });

  it("⛔ el detalle SIEMPRE acota al proyecto (anti-IDOR)", () => {
    /* Tener acceso a ESTE proyecto no da derecho a leer el contenido de una corrida de otro.
       La edición que la pone en rojo: cambiar a findUnique({ where: { id: runId } }). */
    const codigo = sinComentarios(leer(DETALLE));
    expect(codigo, "el detalle dejó de acotar por proyecto").toContain(
      "where: { id: runId, projectId }",
    );
    expect(codigo, "un findUnique por id solo deja leer corridas de otros proyectos").not.toContain(
      "agentRun.findUnique",
    );
  });

  it("el `output` crudo no viaja en ninguna de las dos respuestas", () => {
    /* La lista no lo selecciona (20 × ~100 KB de @db.Text para pintar un badge), y el detalle lo
       manda YA NORMALIZADO: sin prompts, sin el timeline propuesto, sin pendingItems. */
    const lista = sinComentarios(leer(LISTA));
    expect(lista, "la lista empezó a traer el output").not.toContain("output");

    const detalle = sinComentarios(leer(DETALLE));
    expect(detalle, "el detalle dejó de normalizar el output").toContain("documentoDeCorrida(");
    expect(detalle, "el JSON crudo se filtró a la respuesta").not.toMatch(/output:\s*run\.output/);
  });

  it("la lista tiene tope y lo declara en la respuesta", () => {
    const codigo = sinComentarios(leer(LISTA));
    expect(codigo).toContain("take: LIMITE_HISTORIAL");
    expect(codigo, "la respuesta no dice cuál fue el tope: una lista cortada parecería completa")
      .toContain("limite: LIMITE_HISTORIAL");
    expect(LIMITE_HISTORIAL).toBe(20);
  });

  it("⛔ el visor NO puede editar — «restaurar» no aparece por goteo", () => {
    /* Decisión de Elías: el historial es SOLO LECTURA. `BlockRenderer` habilita la edición
       cuando recibe callbacks; sin ellos es un visor puro. La edición que la pone en rojo:
       pasarle `onSave` (o cualquier otro) al renderer del historial — el primer paso natural
       hacia un "volver a esta versión" que nadie decidió. */
    const visor = sinComentarios(leer("components/canvas/DocumentoAgenteView.tsx"));
    for (const cb of ["onSave", "onDelete", "onAccept", "onReject", "onDragStart"]) {
      expect(visor, `el visor del historial recibió ${cb}: dejó de ser solo lectura`).not.toContain(cb);
    }
    /* Y los dos campos load-bearing del adaptador: con otro `source` la toolbar queda siempre
       visible, y con "DRAFT" una corrida vieja se pinta como algo que espera aprobación. */
    expect(visor).toContain('source: "AGENT"');
    expect(visor).toContain('status: "CONFIRMED"');
  });

  it("el CTA del handoff se decide con el helper, no con una condición a mano", () => {
    const seccion = sinComentarios(leer("components/clients/ProjectHandoffSection.tsx"));
    expect(seccion, "el CTA dejó de usar la regla compartida").toContain("debeVerHistorial({");
    expect(seccion, "desapareció el botón del historial").toContain("Ver historial");
  });

  it("el grupo se valida con hasOwn: una clave heredada NO puede llegar a Prisma", () => {
    /* `AGENT_GROUP_TO_CANVAS["constructor"]` devuelve algo TRUTHY del prototipo, así que el 400
       no cortaba y el slug —una función— reventaba adentro de Prisma: 500 y ruido en Sentry con
       un simple `?grupo=toString`. La edición que la pone en rojo: volver al acceso directo. */
    const codigo = sinComentarios(leer(LISTA));
    expect(codigo, "el whitelist volvió al acceso directo por índice").toContain(
      "Object.hasOwn(AGENT_GROUP_TO_CANVAS, grupo)",
    );
    expect(codigo, "el guard de tipo del slug desapareció").toContain('typeof slug !== "string"');
  });

  it("el estado del detalle es POR CORRIDA, no global", () => {
    /* Con un booleano y un string únicos: el error de A quedaba pegado sobre el documento de B,
       y el `finally` de un fetch apagaba el spinner de otro que seguía en vuelo — el panel
       quedaba en blanco. La edición que la pone en rojo: volver a `useState<boolean>`. */
    const modal = sinComentarios(leer("components/clients/HistorialHandoffModal.tsx"));
    expect(modal, "el cargando volvió a ser global").toContain("useState<Set<string>>");
    expect(modal, "el error volvió a ser global").toContain("useState<Map<string, string>>");
    expect(modal, "el error mostrado no se deriva de la corrida elegida").toContain(
      "errores.get(seleccion)",
    );
    expect(modal, "el spinner no se deriva de la corrida elegida").toContain(
      "cargando.has(seleccion)",
    );
  });

  it("el aviso de lista truncada compara contra el TOPE, no por igualdad", () => {
    /* Con `total === limite` mentía en las dos direcciones: callaba el corte con 25 corridas y
       lo anunciaba con 20 exactas (donde no se cortó nada). */
    const modal = sinComentarios(leer("components/clients/HistorialHandoffModal.tsx"));
    expect(modal, "el aviso de truncado volvió a comparar por igualdad").not.toContain(
      "lista.total === lista.limite",
    );
    expect(modal).toContain("lista.total > lista.limite");
  });
});
