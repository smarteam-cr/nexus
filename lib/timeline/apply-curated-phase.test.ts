import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { normalizeCuratedTasks, repartoDeBorrado, type ExistingTaskRow } from "./apply-curated-phase";

/**
 * ── LO QUE ESTE BLOQUE IMPIDE ────────────────────────────────────────────────
 * Hasta 2026-08-11 el servidor borraba TODO lo que no viniera en el payload curado, sin mirar
 * si tenía progreso. La promesa de "regenerar nunca borra lo hecho" la sostenía únicamente el
 * cliente (`regen-columnas.ts` pre-siembra esas tareas en la columna que se conserva, así que
 * normalmente viajan). Un payload incompleto —una sección del acordeón que no montó, un request
 * viejo, cualquier caller que no fuera ese modal— borraba trabajo real sin dejar rastro.
 */
const fila = (over: Partial<ExistingTaskRow> & { id: string }): ExistingTaskRow => ({
  title: "T", weekIndex: 0, order: 0, notes: null, party: null, type: null,
  source: "AGENT", status: "PENDING", actualStart: null,
  ...over,
});

describe("repartoDeBorrado", () => {
  it("una tarea PENDING de la IA omitida del payload SÍ se borra (es material reemplazable)", () => {
    const r = repartoDeBorrado([fila({ id: "a" })], new Set());
    expect(r.aBorrar).toEqual(["a"]);
    expect(r.preservadas).toEqual([]);
  });

  it("⛔ una tarea HECHA omitida del payload NO se borra", () => {
    const r = repartoDeBorrado([fila({ id: "a", status: "DONE" })], new Set());
    expect(r.aBorrar, "una tarea hecha jamás se borra por omisión").toEqual([]);
    expect(r.preservadas.map((t) => t.id)).toEqual(["a"]);
  });

  it("⛔ tampoco se borran las iniciadas, las suspendidas ni las cargadas a mano", () => {
    const filas = [
      fila({ id: "curso", status: "IN_PROGRESS" }),
      fila({ id: "susp", status: "SUSPENDED" }),
      fila({ id: "mano", source: "HUMAN" }), // PENDING pero humana
    ];
    const r = repartoDeBorrado(filas, new Set());
    expect(r.aBorrar).toEqual([]);
    expect(r.preservadas.map((t) => t.id)).toEqual(["curso", "susp", "mano"]);
  });

  it("lo que SÍ viene en el payload no entra en ninguna de las dos listas (se actualiza aparte)", () => {
    const r = repartoDeBorrado([fila({ id: "a" }), fila({ id: "b", status: "DONE" })], new Set(["a", "b"]));
    expect(r.aBorrar).toEqual([]);
    expect(r.preservadas).toEqual([]);
  });

  it("payload VACÍO sobre una fase mixta: se borra solo lo reemplazable", () => {
    // El caso real: la sección del acordeón no montó y llegó `tasks: []` para esa fase.
    const filas = [
      fila({ id: "ia-pend" }),
      fila({ id: "hecha", status: "DONE" }),
      fila({ id: "humana", source: "HUMAN" }),
    ];
    const r = repartoDeBorrado(filas, new Set());
    expect(r.aBorrar).toEqual(["ia-pend"]);
    expect(r.preservadas.map((t) => t.id)).toEqual(["hecha", "humana"]);
  });

  it("sin tareas existentes no revienta", () => {
    expect(repartoDeBorrado([], new Set())).toEqual({ aBorrar: [], preservadas: [] });
  });
});

describe("normalizeCuratedTasks", () => {
  it("descarta entradas sin título", () => {
    const out = normalizeCuratedTasks([{ title: "" }, { title: "  " }, {}], 3, new Set());
    expect(out).toEqual([]);
  });

  it("clampea weekIndex al rango [0, durationWeeks)", () => {
    const out = normalizeCuratedTasks(
      [
        { title: "A", weekIndex: -5 },
        { title: "B", weekIndex: 99 },
      ],
      3,
      new Set(),
    );
    expect(out.map((t) => t.weekIndex)).toEqual([0, 2]);
  });

  it("order incremental por semana (recalculado desde la posición del array)", () => {
    const out = normalizeCuratedTasks(
      [
        { title: "A", weekIndex: 0 },
        { title: "B", weekIndex: 0 },
        { title: "C", weekIndex: 1 },
      ],
      2,
      new Set(),
    );
    expect(out.map((t) => [t.weekIndex, t.order])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it("descarta el id si no pertenece a esta fase (anti-alucinación)", () => {
    const out = normalizeCuratedTasks(
      [{ id: "ajena-a-otra-fase", title: "A" }, { id: "propia", title: "B" }],
      1,
      new Set(["propia"]),
    );
    expect(out.map((t) => t.id)).toEqual([undefined, "propia"]);
  });

  it("party/type/status inválidos caen a su fallback (null/null/PENDING)", () => {
    const out = normalizeCuratedTasks(
      [{ title: "A", party: "inventado", type: "inventado", status: "inventado" }],
      1,
      new Set(),
    );
    expect(out[0].party).toBeNull();
    expect(out[0].type).toBeNull();
    expect(out[0].status).toBe("PENDING");
  });

  it("party/type/status válidos se normalizan a mayúscula", () => {
    const out = normalizeCuratedTasks(
      [{ title: "A", party: "cliente", type: "session", status: "done" }],
      1,
      new Set(),
    );
    expect(out[0].party).toBe("CLIENTE");
    expect(out[0].type).toBe("SESSION");
    expect(out[0].status).toBe("DONE");
  });

  it("notes vacías o solo whitespace se guardan como null", () => {
    const out = normalizeCuratedTasks([{ title: "A", notes: "   " }, { title: "B", notes: "algo" }], 1, new Set());
    expect(out.map((t) => t.notes)).toEqual([null, "algo"]);
  });
});

/**
 * ── «POR VALIDAR» LLEGA HASTA LA TAREA (hueco 5 de la crítica, decisión de Elías 2026-09-23) ───
 * Sin handoff, el agente marca con `porValidar` las tareas típicas que ninguna fuente respalda
 * (lib/contexto/detalle-cronograma.ts, SIN_HANDOFF_CON_MATERIAL). El preview la calculaba
 * (`needsValidation` de compute-detail-tasks), pero la curación no la acarreaba y el apply creaba
 * TODO con `needsValidation: false`: la marca se perdía en el camino y la firmeza del baseline
 * contaba como firmes tareas inventadas. Tres eslabones, tres guardas.
 */
describe("⭐ la marca «por validar» llega hasta la tarea creada", () => {
  it("una tarea NUEVA marcada llega marcada; sin marca, no", () => {
    const out = normalizeCuratedTasks(
      [
        { title: "Típica", needsValidation: true },
        { title: "Del material" },
        { title: "Basura", needsValidation: "sí" },
      ],
      1,
      new Set(),
    );
    expect(out.map((t) => t.needsValidation)).toEqual([true, false, false]);
  });

  it("⛔ una tarea que YA existe no vuelve a «por validar» desde el payload", () => {
    /* La marca solo nace con la tarea: en el update manda la regla del PUT (tocar el contenido de
       una de la IA la da por revisada). Un payload no puede re-marcar trabajo ya revisado. */
    const out = normalizeCuratedTasks([{ id: "propia", title: "A", needsValidation: true }], 1, new Set(["propia"]));
    expect(out[0].needsValidation).toBe(false);
  });

  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el apply CREA con la marca (no con un false fijo)", () => {
    const src = leer("lib/timeline/apply-curated-phase.ts");
    const i = src.indexOf("toCreate.push({");
    expect(i, "se movió el ancla: revisa esta guarda").toBeGreaterThan(0);
    const alta = src.slice(i, src.indexOf("});", i));
    expect(alta, "el apply volvió a crear todo como validado: la marca del agente se pierde").toContain(
      "needsValidation: c.needsValidation",
    );
  });

  it("la curación la acarrea: de la propuesta al ítem y del ítem al payload", () => {
    const panel = leer("components/canvas/PhaseRegenPanel.tsx");
    expect(panel, "el panel dejó de leer la marca de la propuesta").toContain(
      "needsValidation: t.needsValidation === true",
    );
    expect(panel, "el panel dejó de mandar la marca al apply").toContain("needsValidation: i.isNew && i.needsValidation");
  });
});
