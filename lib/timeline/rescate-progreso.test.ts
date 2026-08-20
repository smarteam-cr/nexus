import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  rescatarProgreso,
  huellasEnMovimiento,
  idsBorrablesPorOmision,
  type FaseRealParaRescate,
} from "./rescate-progreso";
import { fingerprintFromTitle } from "./particularidad-identity";
import type { PhaseInput } from "./validate";

const tarea = (
  id: string,
  title: string,
  extra: Partial<FaseRealParaRescate["tasks"][number]> = {},
) => ({
  id,
  title,
  weekIndex: 0,
  order: 0,
  notes: null,
  status: "PENDING",
  source: "AGENT" as string | null,
  ...extra,
});

const fase = (
  id: string,
  name: string,
  order: number,
  tasks: FaseRealParaRescate["tasks"],
  extra: Partial<FaseRealParaRescate> = {},
): FaseRealParaRescate => ({
  id,
  name,
  order,
  durationWeeks: 2,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tasks,
  ...extra,
});

const prop = (id: string | undefined, name: string, order: number, tasks: PhaseInput["tasks"]): PhaseInput => ({
  id,
  name,
  order,
  durationWeeks: 2,
  tasks,
});

describe("rescatarProgreso", () => {
  it("repone la tarea DONE que la propuesta omitió, con su id", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "Configurar pipeline", { status: "DONE" })])];
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Setup", 0, [{ title: "Otra cosa", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases[0].tasks).toHaveLength(2);
    expect(phases[0].tasks!.find((t) => t.id === "t1")?.title).toBe("Configurar pipeline");
    expect(warnings[0]).toContain("Setup");
  });

  it("NO repone una tarea PENDING del agente (esa sí se puede reemplazar)", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "Configurar pipeline")])];
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Setup", 0, [{ title: "Otra cosa", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases[0].tasks).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("una PENDING cargada a mano (HUMAN) SÍ se repone", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "La puso el CSE", { source: "HUMAN" })])];
    const { phases } = rescatarProgreso(reales, [prop("f1", "Setup", 0, [])]);
    expect(phases[0].tasks).toHaveLength(1);
  });

  /* ── LA TRAMPA 1: mover no es borrar ─────────────────────────────────────── */
  it("una tarea con progreso MOVIDA a otra fase no se duplica", () => {
    const reales = [
      fase("f1", "Origen", 0, [tarea("t1", "Construir dashboards", { status: "DONE" })]),
      fase("f2", "Destino", 1, []),
    ];
    // El saneador de la ruta ya le quitó el id al moverla de fase.
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Origen", 0, []),
      prop("f2", "Destino", 1, [{ title: "Construir dashboards", weekIndex: 0, order: 0 }]),
    ]);
    const titulos = phases.flatMap((p) => (p.tasks ?? []).map((t) => t.title));
    expect(titulos.filter((t) => t === "Construir dashboards")).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("la huella ignora tildes y mayúsculas al detectar la movida", () => {
    const reales = [
      fase("f1", "Origen", 0, [tarea("t1", "Migración de datos", { status: "IN_PROGRESS" })]),
      fase("f2", "Destino", 1, []),
    ];
    const { phases } = rescatarProgreso(reales, [
      prop("f1", "Origen", 0, []),
      prop("f2", "Destino", 1, [{ title: "MIGRACION DE DATOS", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases.flatMap((p) => p.tasks ?? [])).toHaveLength(1);
  });

  /* ── LA TRAMPA 2: solo las propuestas SIN id tapan el rescate ─────────────── */
  it("dos tareas homónimas en fases distintas no se tapan: la que tiene progreso se conserva", () => {
    const reales = [
      fase("f1", "Fase A", 0, [tarea("t1", "Capacitación", { status: "DONE" })]),
      fase("f2", "Fase B", 1, [tarea("t2", "Capacitación")]),
    ];
    // La propuesta conserva la de Fase B (con su id) y se olvida de la de Fase A.
    const { phases } = rescatarProgreso(reales, [
      prop("f1", "Fase A", 0, []),
      prop("f2", "Fase B", 1, [{ id: "t2", title: "Capacitación", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases[0].tasks!.map((t) => t.id)).toEqual(["t1"]);
    expect(phases[1].tasks!.map((t) => t.id)).toEqual(["t2"]);
  });

  /* ── LA TRAMPA 3: la semana tiene que caber ──────────────────────────────── */
  it("recorta el weekIndex a la fase acortada (si no, el PUT devuelve 400)", () => {
    const reales = [
      fase("f1", "Setup", 0, [tarea("t1", "Tarea vieja", { status: "DONE", weekIndex: 3 })], {
        durationWeeks: 4,
      }),
    ];
    const { phases } = rescatarProgreso(reales, [
      { id: "f1", name: "Setup", order: 0, durationWeeks: 1, tasks: [] },
    ]);
    expect(phases[0].tasks![0].weekIndex).toBe(0);
  });

  it("una fase de duración 0 no produce un weekIndex negativo", () => {
    const reales = [
      fase("f1", "Setup", 0, [tarea("t1", "Tarea", { status: "DONE", weekIndex: 2 })]),
    ];
    const { phases } = rescatarProgreso(reales, [
      { id: "f1", name: "Setup", order: 0, durationWeeks: 0, tasks: [] },
    ]);
    expect(phases[0].tasks![0].weekIndex).toBe(0);
  });

  /* ── La fase borrada entera vuelve EN SU LUGAR ───────────────────────────── */
  it("una fase del medio con progreso vuelve al medio, no al final", () => {
    const reales = [
      fase("f1", "Primera", 0, []),
      fase("f2", "Del medio", 1, [tarea("t1", "Hecho", { status: "DONE" })]),
      fase("f3", "Última", 2, []),
    ];
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Primera", 0, []),
      prop("f3", "Última", 1, []),
    ]);
    expect(phases.map((p) => p.name)).toEqual(["Primera", "Del medio", "Última"]);
    expect(phases.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(warnings[0]).toContain("no se borró");
    /* ⭐ Y dice POR QUÉ, que es lo que deja decidir. El mensaje decía siempre «con progreso» y era
       falso la mitad de las veces: `isKept` conserva por DOS motivos —progreso o escrita a mano— y
       Elías pidió borrar una fase cuyas 2 tareas estaban PENDIENTES, escritas por él.
       «Tiene progreso» suena a «no lo toques»; «la escribiste vos» suena a «vos sabrás». */
    expect(warnings[0]).toContain("1 con progreso");
    expect(warnings[0], "el aviso no dice qué hacer al respecto").toContain("a mano");
  });

  it("⛔ y una tarea PENDIENTE escrita a mano no se reporta como «con progreso»", () => {
    /* El caso exacto del 2026-08-20. La edición que la pone en rojo: volver a un mensaje único. */
    const reales = [
      fase("f1", "Con tipeadas", 0, [tarea("t1", "fdsfsf", { source: "HUMAN" })]),
    ];
    const { warnings } = rescatarProgreso(reales, []);
    expect(warnings[0]).toContain("escrita a mano");
    expect(
      warnings[0].includes("con progreso"),
      "una tarea pendiente se sigue reportando como si tuviera progreso",
    ).toBe(false);
  });

  it("una fase NUEVA del modelo se queda donde el modelo la puso", () => {
    const reales = [
      fase("f1", "Primera", 0, []),
      fase("f2", "Del medio", 1, [tarea("t1", "Hecho", { status: "DONE" })]),
      fase("f3", "Última", 2, []),
    ];
    const { phases } = rescatarProgreso(reales, [
      prop("f1", "Primera", 0, []),
      prop(undefined, "Nueva del modelo", 1, []),
      prop("f3", "Última", 2, []),
    ]);
    expect(phases.map((p) => p.name)).toEqual([
      "Primera",
      "Nueva del modelo",
      "Del medio",
      "Última",
    ]);
  });

  it("la fase rescatada conserva su startWeek (paralelismo) y sus datos", () => {
    const reales = [
      fase("f1", "Paralela", 0, [tarea("t1", "Hecho", { status: "DONE" })], {
        startWeek: 3,
        durationWeeks: 5,
        activityType: "CONFIGURACION",
      }),
    ];
    const { phases } = rescatarProgreso(reales, []);
    expect(phases[0].startWeek).toBe(3);
    expect(phases[0].durationWeeks).toBe(5);
    expect(phases[0].activityType).toBe("CONFIGURACION");
  });

  it("una fase borrada SIN progreso no vuelve (borrar sigue siendo posible)", () => {
    const reales = [fase("f1", "Vacía", 0, [tarea("t1", "Pendiente del agente")])];
    const { phases, warnings } = rescatarProgreso(reales, []);
    expect(phases).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("no muta la propuesta que recibe", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "Hecha", { status: "DONE" })])];
    const entrada = [prop("f1", "Setup", 0, [])];
    rescatarProgreso(reales, entrada);
    expect(entrada[0].tasks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La protección en el CAMINO DE ESCRITURA (2026-08-18)
//
// ── EL MODO DE FALLA QUE ESTO CAZA ───────────────────────────────────────────
// Hasta hoy `rescatarProgreso` tenía UN call site: la ruta del assist. El `PUT /timeline` —que es
// quien realmente escribe— borraba por omisión sin mirar `status` ni `source`; su `select` ni
// siquiera CARGABA `status`. O sea: la promesa "no se pierde trabajo hecho" era cierta para un
// camino, no para el dato. Cualquier llamador nuevo del PUT (el asistente que viene, un script, una
// pestaña vieja con un payload stale) la reabría entera, y el borrado es silencioso: sin error, sin
// aviso, sin forma de recuperar.
// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ huellasEnMovimiento", () => {
  it("junta las tareas SIN id de TODAS las fases, no de una", () => {
    /* Una tarea que se mueve sale de una fase y entra en otra: mirar solo el origen no la
       encontraría, y ésa es la trampa 1 vista desde el lado del que borra. */
    const h = huellasEnMovimiento([
      prop("f1", "Origen", 0, [{ id: "t1", title: "Se queda", weekIndex: 0, order: 0, notes: null }]),
      prop("f2", "Destino", 1, [{ title: "Configurar pipeline", weekIndex: 0, order: 0, notes: null }]),
    ]);
    expect(h.has(fingerprintFromTitle("Configurar pipeline"))).toBe(true);
    expect(h.has(fingerprintFromTitle("Se queda")), "una tarea CON id no se está moviendo").toBe(false);
  });

  it("una fase sin `tasks` no aporta nada (undefined = «no tocar»)", () => {
    expect(huellasEnMovimiento([{ id: "f1", name: "X", order: 0, durationWeeks: 2 }]).size).toBe(0);
  });
});

describe("⭐ idsBorrablesPorOmision — lo que el PUT puede borrar", () => {
  const sinMovimiento = new Set<string>();

  it("⛔ una tarea DONE omitida NO se borra", () => {
    const borrables = idsBorrablesPorOmision(
      [tarea("t1", "Configurar pipeline", { status: "DONE" })],
      new Set(),
      sinMovimiento,
    );
    expect(
      borrables,
      "el PUT borró una tarea hecha porque el body no la traía — el agujero que este arreglo cierra",
    ).toEqual([]);
  });

  it("⛔ una tarea cargada a mano (source HUMAN) omitida tampoco", () => {
    const borrables = idsBorrablesPorOmision(
      [tarea("t1", "La puso el CSE", { status: "PENDING", source: "HUMAN" })],
      new Set(),
      sinMovimiento,
    );
    expect(borrables).toEqual([]);
  });

  it("una PENDING de la IA sí se borra — si no, nada se podría sacar nunca", () => {
    const borrables = idsBorrablesPorOmision(
      [tarea("t1", "Propuesta que no va", { status: "PENDING", source: "AGENT" })],
      new Set(),
      sinMovimiento,
    );
    expect(borrables).toEqual(["t1"]);
  });

  it("lo que SÍ viene en el body no se toca, protegido o no", () => {
    const existentes = [
      tarea("t1", "Hecha", { status: "DONE" }),
      tarea("t2", "Pendiente", { status: "PENDING" }),
    ];
    expect(idsBorrablesPorOmision(existentes, new Set(["t1", "t2"]), sinMovimiento)).toEqual([]);
  });

  it("⚠ una DONE que se está MOVIENDO sí se borra — mover es borrar-en-origen + crear-en-destino", () => {
    /* Sin esta excepción quedarían las dos: la vieja DONE en origen y el clon PENDING en destino,
       y el avance la contaría como logro Y como deuda a la vez. */
    const enMovimiento = new Set([fingerprintFromTitle("Configurar pipeline")]);
    const borrables = idsBorrablesPorOmision(
      [tarea("t1", "Configurar pipeline", { status: "DONE" })],
      new Set(),
      enMovimiento,
    );
    expect(borrables, "una tarea movida quedó duplicada en origen y destino").toEqual(["t1"]);
  });

  it("el movimiento no indulta a una homónima que NO se mueve", () => {
    /* La huella coincide, así que ésta es la contracara del caso anterior: la excepción es por
       título, y ése es su precio. Se documenta acá para que el día que muerda se vea el porqué. */
    const enMovimiento = new Set([fingerprintFromTitle("Configurar pipeline")]);
    expect(
      idsBorrablesPorOmision([tarea("t9", "Configurar pipeline", { status: "DONE" })], new Set(), enMovimiento),
    ).toEqual(["t9"]);
  });
});

describe("⭐ el PUT usa la protección — y carga el dato que necesita", () => {
  /* Sin este bloque los tests de arriba son verdes y decorativos: prueban un helper que nadie
     llama. Es exactamente la trampa que este repo ya se comió tres veces. */
  const RUTA = "app/api/projects/[projectId]/timeline/route.ts";
  const src = fs.readFileSync(path.join(process.cwd(), RUTA), "utf8");

  it("el borrado de tareas pasa por `idsBorrablesPorOmision`", () => {
    expect(src, `${RUTA} volvió a borrar por omisión sin filtrar`).toContain("idsBorrablesPorOmision(");
    expect(src).toContain("huellasEnMovimiento(");
  });

  it("⛔ no quedó el filtro crudo que borraba todo lo omitido", () => {
    /* La forma exacta que había antes. Si vuelve, la protección quedó de adorno al lado. */
    expect(src).not.toMatch(/existingTasks\s*\n?\s*\.filter\(\(t\) => !incomingTaskIds\.has\(t\.id\)\)\s*\n?\s*\.map/);
  });

  it("⚠ el `select` de tareas DEL PUT trae `status`", () => {
    /* No es cosmético: sin `status` en el select, `isKept` ve `undefined`, toda tarea parece
       PENDING y la protección deja pasar TODO sin fallar ni avisar. Era literalmente el estado del
       código antes de este arreglo.

       ⚠ El ancla es `tx.timelinePhase.findMany` y no `tasks: {`: hay DOS selects de tareas en este
       archivo (el del GET y el del PUT) y el del GET ya traía `status`. Anclado al primero, este
       test salía VERDE con el select del PUT roto — se cazó rompiéndolo a propósito. */
    const i = src.indexOf("const existingPhases = await tx.timelinePhase.findMany(");
    expect(i, "cambió el ancla: no se encontró la carga de fases del PUT").toBeGreaterThan(-1);
    const bloque = src.slice(i, src.indexOf("const existingById", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    expect(bloque, "no es el select correcto").toContain("dueDateOverride: true");
    expect(bloque, "el select de tareas del PUT dejó de traer `status`").toContain("status: true");
  });
});
