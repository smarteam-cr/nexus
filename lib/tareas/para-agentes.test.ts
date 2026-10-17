/**
 * lib/tareas/para-agentes.test.ts — la puerta de los agentes internos a Tareas (DECISIONS «La lectura de cada reunión
 * es durable…», la frontera Tareas ↔ agentes). Lo que el vigía puede saber de una tarea, y lo que nunca le llega.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ tarea: { findMany: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const disponible = vi.hoisted(() => ({ si: true }));
vi.mock("./servidor", () => ({ tareasDisponible: vi.fn(async () => disponible.si) }));

import { ABIERTAS_PARA_AGENTES, TOPE_DEL_TITULO, aTareaParaAgente, compromisosAbiertosParaAgentes, lineaParaElVigia, pendientesVencidosParaElVigia } from "./para-agentes";

const fila = (o: Partial<{ titulo: string; venceEl: Date | null; estado: string; datos: unknown; lado: string }> = {}) => ({
  titulo: o.titulo ?? "Recordarle a Ana que envíe la base",
  venceEl: o.venceEl === undefined ? new Date("2026-10-01T00:00:00Z") : o.venceEl,
  estado: o.estado ?? "propuesta",
  lado: o.lado ?? "smarteam",
  eventos: o.datos === undefined ? [] : [{ datos: o.datos as never }],
});

beforeEach(() => {
  db.tarea.findMany.mockReset();
  disponible.si = true;
});

describe("⭐ lo que el agente sabe de una tarea", () => {
  it("título, fecha, estado en palabras y lado", () => {
    expect(aTareaParaAgente(fila({ datos: { lado: "cliente", seguimiento: true } }))).toEqual({
      titulo: "Recordarle a Ana que envíe la base",
      venceEl: "2026-10-01",
      estado: "sin decidir",
      lado: "cliente",
    });
    expect(aTareaParaAgente(fila({ estado: "en_curso", datos: { lado: "smarteam" } })).estado).toBe("en curso");
    expect(aTareaParaAgente(fila({ estado: "pendiente" })).estado).toBe("pendiente");
    // Desde el 2026-10-16 el lado vive en su columna; el evento sigue valiendo para lo de antes.
    expect(aTareaParaAgente(fila({ lado: "cliente" })).lado).toBe("cliente");
  });

  it("sin el evento de la lectura, la tarea es trabajo de Smarteam (toda tarea la hace alguien del equipo)", () => {
    expect(aTareaParaAgente(fila()).lado).toBe("smarteam");
    expect(aTareaParaAgente(fila({ datos: { para: "ana@smarteamcr.com" } })).lado).toBe("smarteam");
    expect(aTareaParaAgente(fila({ datos: ["cliente"] })).lado).toBe("smarteam");
  });

  it("el título se recorta y la fecha puede faltar", () => {
    const largo = "x".repeat(400);
    const t = aTareaParaAgente(fila({ titulo: largo, venceEl: null }));
    expect(t.titulo.length).toBe(TOPE_DEL_TITULO);
    expect(t.titulo.endsWith("…")).toBe(true);
    expect(t.venceEl).toBeNull();
    expect(lineaParaElVigia(t)).toContain("[venció —]");
  });

  it("la línea del vigía dice de quién es y cómo está", () => {
    expect(lineaParaElVigia({ titulo: "Enviar la base", venceEl: "2026-10-01", estado: "sin decidir", lado: "cliente" })).toBe(
      "- [venció 2026-10-01] Enviar la base (lo prometió el cliente · sin decidir)",
    );
  });
});

describe("⛔ lo que nunca le llega", () => {
  it("la consulta pide solo título, fecha, estado y el evento de nacimiento", async () => {
    db.tarea.findMany.mockResolvedValue([fila({ datos: { lado: "cliente" } })]);
    const out = await pendientesVencidosParaElVigia("p1", new Date("2026-10-10T15:00:00Z"));
    expect(out).toHaveLength(1);
    const arg = db.tarea.findMany.mock.calls[0][0];
    expect(Object.keys(arg.select).sort()).toEqual(["estado", "eventos", "lado", "titulo", "venceEl"]);
    expect(Object.keys(arg.select.eventos.select)).toEqual(["datos"]);
    expect(arg.where.projectId).toBe("p1");
    expect(arg.where.privada).toBe(false);
    expect(arg.where.archivadaAt).toBeNull();
    // Vencida = antes de HOY en Costa Rica (a las 15:00 UTC del 10 ya es 10 allá).
    expect(arg.where.venceEl.lt.toISOString().slice(0, 10)).toBe("2026-10-10");
    expect(arg.take).toBeLessThanOrEqual(10);
  });

  it("sin privadas, sin espacios de «solo miembros» y sin el borrador de un plan", () => {
    expect(ABIERTAS_PARA_AGENTES.privada).toBe(false);
    expect(ABIERTAS_PARA_AGENTES.estado.in).toEqual(["propuesta", "pendiente", "en_curso"]);
    const texto = JSON.stringify(ABIERTAS_PARA_AGENTES);
    expect(texto).toContain('"visibilidad":"miembros"');
    expect(texto).toContain('"origen":{"in":["chat","plantilla"]}');
    // Las tareas sin proyecto entran (un NOT a secas sobre la relación las dejaría afuera).
    expect(texto).toContain('{"proyectoId":null}');
  });

  it("los abiertos del proyecto usan el mismo filtro y la misma proyección, con tope", async () => {
    db.tarea.findMany.mockResolvedValue([]);
    await compromisosAbiertosParaAgentes("p2", 500);
    const arg = db.tarea.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ projectId: "p2", privada: false, archivadaAt: null });
    expect(arg.where.venceEl).toBeUndefined();
    expect(Object.keys(arg.select).sort()).toEqual(["estado", "eventos", "lado", "titulo", "venceEl"]);
    expect(arg.take).toBe(30);
  });

  it("sin las tablas de Tareas no consulta nada y devuelve vacío", async () => {
    disponible.si = false;
    expect(await pendientesVencidosParaElVigia("p1")).toEqual([]);
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("la proyección no lee el texto de la reunión, el contexto, las notas ni los pasos", () => {
    const src = readFileSync(join(__dirname, "para-agentes.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
    for (const campo of ["cita", "contexto", "notas", "pasos", "origenTitulo", "pedidaPorTexto"]) {
      expect(src, `para-agentes.ts no puede pedir «${campo}»`).not.toMatch(new RegExp(`\\b${campo}\\s*:`));
    }
  });
});
