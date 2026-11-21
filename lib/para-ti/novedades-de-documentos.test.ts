/**
 * «Las novedades de tus documentos» en «Para ti» (2026-11-20): un renglón por documento de tus proyectos con novedades,
 * solo de los que puedes decidir, con el enlace al documento abierto. Las novedades van simuladas.
 */
import { describe, expect, it, vi } from "vitest";
import type { Alcance } from "./alcance-server";
import type { NovedadDeLaPieza, NovedadesDeLaPieza } from "@/lib/seguimiento/novedades";

const base = vi.hoisted(() => ({ porProyecto: {} as Record<string, Record<string, unknown>> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/seguimiento/novedades-server", () => ({
  novedadesDelProyecto: async (projectId: string) => ({ activas: true, porPieza: base.porProyecto[projectId] ?? {} }),
  novedadesPorDecidirPorReunion: async () => new Map(),
}));

const { NOVEDADES_DE_TUS_DOCUMENTOS } = await import("./fuentes/novedades-de-documentos");

const ctx = { ahora: new Date("2026-11-20T15:00:00Z"), hoyISO: "2026-11-20" };
const conPermiso = { sections: { planificacion: { generate: true } } };
const alcance = (p: Partial<Alcance> = {}): Alcance =>
  ({ email: "cse@smarteamcr.com", nombre: "CSE", rol: "CSE", teamMemberId: "tm", frentes: [], permisos: conPermiso, proyectos: [proyecto("p1")], ...p }) as unknown as Alcance;
function proyecto(id: string) {
  return { id, name: `Proyecto ${id}`, clientId: `c-${id}`, empresa: `Empresa ${id}`, altaEstado: null, multiproyecto: false, encargado: true };
}
const novedad = (id: string, frase: string): NovedadDeLaPieza =>
  ({ hechoId: id, mismos: [], pieza: "planning", secciones: [], tipo: "acuerdo", tema: "pipeline", frase, cita: "x", quienLoDijo: "cliente", reunion: { id: "s1", titulo: "Seguimiento", fecha: "2026-11-18" }, publicaEnVivo: false, propuestaEn: "2026-11-18T12:00:00.000Z" }) as NovedadDeLaPieza;
const dePieza = (n: number, mas = 0): NovedadesDeLaPieza => {
  const items = Array.from({ length: n }, (_, i) => novedad(`h${i}`, `Cambio ${i}`));
  return { items, grupos: [{ clave: "s1", reunion: items[0].reunion, items }], mas };
};

describe("las novedades de tus documentos", () => {
  it("un renglón por documento, con cuántas reuniones y el enlace al documento", async () => {
    base.porProyecto = { p1: { planning: dePieza(3, 1) } };
    const [r, ...resto] = await NOVEDADES_DE_TUS_DOCUMENTOS.medir(alcance(), ctx);
    expect(resto).toEqual([]);
    expect(r).toMatchObject({
      clave: "novedades-de-documentos:p1:planning",
      fuente: "novedades-de-documentos",
      delAgente: true,
      clientId: "c-p1",
      titulo: "Planificación de Proyecto p1: 2 reuniones con novedades",
      href: "/clients/c-p1?tab=p1&canvas=planning",
      cantidad: 3,
    });
    expect(r.detalle).toContain("3 cosas para cambiar en el documento. La primera: «Cambio 0»");
  });

  it("⛔ solo los documentos que puedes decidir (la celda de generarlo)", async () => {
    base.porProyecto = { p1: { planning: dePieza(2) } };
    const sinPermiso = alcance({ permisos: { sections: { planificacion: { generate: false } } } } as unknown as Partial<Alcance>);
    expect(await NOVEDADES_DE_TUS_DOCUMENTOS.medir(sinPermiso, ctx)).toEqual([]);
    expect(NOVEDADES_DE_TUS_DOCUMENTOS.aplica?.(sinPermiso)).toBe(false);
  });

  it("los de más novedades primero, como mucho 8", async () => {
    base.porProyecto = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, { planning: dePieza(i + 1) }]));
    const r = await NOVEDADES_DE_TUS_DOCUMENTOS.medir(alcance({ proyectos: Array.from({ length: 10 }, (_, i) => proyecto(`p${i}`)) }), ctx);
    expect(r).toHaveLength(8);
    expect(r[0].cantidad).toBe(10);
  });
});
