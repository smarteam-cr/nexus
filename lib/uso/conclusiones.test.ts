import { describe, expect, it } from "vitest";
import { concluir, type EntradaDeConclusiones } from "./conclusiones";
import { sumaVacia, type IaPorProceso } from "./ia";
import { agruparLoPropuesto, decisionesPorEquipo } from "./agrupar";
import { usoPorEquipo } from "./por-equipo";
import type { ItemParaContar } from "@/lib/lo-propuesto/conteo";
import type { ClaveDeTipo } from "@/lib/lo-propuesto/tipos";

const base: EntradaDeConclusiones = { equipo: null, propuesto: [], ia: null };

const proceso = (x: Partial<IaPorProceso> & Pick<IaPorProceso, "clave">): IaPorProceso => ({
  ...sumaVacia(),
  corridas: 0,
  clientes: 0,
  slugs: [],
  ...x,
});

describe("concluir", () => {
  it("señala al equipo que entra menos de un día por semana, y no habla de personas", () => {
    const c = concluir({
      ...base,
      equipo: {
        diasMedidos: 28,
        personas: [
          { equipo: "Marketing", diasConUso: 1, diasEstaSemana: 0 },
          { equipo: "Marketing", diasConUso: 2, diasEstaSemana: 1 },
          { equipo: "Ventas", diasConUso: 20, diasEstaSemana: 4 },
        ],
      },
    });
    expect(c.map((x) => x.id)).toEqual(["equipo:Marketing"]);
    expect(c[0].detalle).toContain("Esta semana entraron 1 de 2");
  });

  it("con menos de una semana medida no concluye sobre equipos", () => {
    const c = concluir({ ...base, equipo: { diasMedidos: 3, personas: [{ equipo: "Marketing", diasConUso: 0, diasEstaSemana: 0 }] } });
    expect(c.map((x) => x.id)).toEqual(["equipo:poco-medido"]);
  });

  it("una propuesta que casi nunca se usa pide atención, una que se usa va bien, y con pocas no se dice nada", () => {
    const c = concluir({
      ...base,
      propuesto: [
        { tipo: "tarea-propuesta", nombre: "Tarea propuesta", nacieron: 30, usados: 1, desestimados: 2, vencidos: 20, pendientes: 7 },
        { tipo: "minuta", nombre: "Minuta de la reunión", nacieron: 10, usados: 9, desestimados: 0, vencidos: 1, pendientes: 0 },
        { tipo: "campo-de-ficha", nombre: "Campo", nacieron: 3, usados: 0, desestimados: 3, vencidos: 0, pendientes: 0 },
      ],
    });
    expect(c[0].id).toBe("propuesta:casi-nunca:tarea-propuesta");
    expect(c[0].detalle).toContain("vencen sin que nadie las mire");
    expect(c.at(-1)?.id).toBe("propuesta:se-usa:minuta");
    expect(c.some((x) => x.id.includes("campo-de-ficha"))).toBe(false);
  });

  it("un proceso que se lleva mucho del gasto y cuyo resultado casi no se usa pide atención", () => {
    const total = { ...sumaVacia(), costo: 100, llamadas: 100 };
    const c = concluir({
      ...base,
      ia: {
        dias: 30,
        total,
        sinCliente: sumaVacia(),
        porProceso: [
          proceso({ clave: "vigia", costo: 40, llamadas: 50, conError: 10 }),
          proceso({ clave: "chat", costo: 30, llamadas: 30 }),
          proceso({ clave: "avance", costo: 20, llamadas: 20 }),
        ],
        propuestoPorProceso: { vigia: { nacieron: 60, usados: 2, desestimados: 3, vencidos: 40, pendientes: 15 } },
        corridasConError: { vigia: 2 },
        llegoAlTope: false,
      },
    });
    const ids = c.map((x) => x.id);
    expect(ids).toContain("proceso:caro:vigia");
    expect(ids).toContain("proceso:falla:vigia");
    expect(ids).toContain("proceso:sin-propuestas:chat");
    expect(ids).toContain("proceso:avance");
  });
});

describe("agrupar lo propuesto", () => {
  const ventana = { desde: new Date("2026-10-01T00:00:00Z"), hasta: new Date("2026-10-31T00:00:00Z") };
  const item = (x: Partial<ItemParaContar>): ItemParaContar => ({
    estado: "pendiente",
    sinFirma: false,
    decididoPor: null,
    decididoEn: null,
    nacioEn: "2026-10-10T00:00:00Z",
    ...x,
  });
  const porTipo = new Map<ClaveDeTipo, ItemParaContar[]>([
    [
      "tarea-propuesta",
      [
        item({ clientId: "c1", estado: "usado", decididoPor: "Ana@X.com", fuente: "chat" }),
        item({ clientId: "c1", estado: "desestimado", decididoPor: "luis@x.com", fuente: "reunion" }),
        item({ clientId: "c2", nacioEn: "2026-09-01T00:00:00Z", estado: "usado", decididoPor: "ana@x.com" }),
      ],
    ],
  ]);

  it("cuenta solo lo nacido en la ventana", () => {
    const m = agruparLoPropuesto(porTipo, ventana, (_t, it) => it.clientId ?? null);
    expect(m.get("c1")).toMatchObject({ nacieron: 2, usados: 1, desestimados: 1 });
    expect(m.has("c2")).toBe(false);
  });

  it("por equipo, cuenta quién decidió", () => {
    const equipos = decisionesPorEquipo(porTipo, ventana, (e) => (e === "ana@x.com" ? "Ventas" : e === "luis@x.com" ? "Customer Success" : null), [
      "Customer Success",
      "Ventas",
    ]);
    expect(equipos.map((e) => e.equipo)).toEqual(["Customer Success", "Ventas"]);
    expect(equipos[1].porModulo.tareas).toEqual({ usados: 1, desestimados: 0 });
  });
});

describe("usoPorEquipo", () => {
  it("cuenta cuántas personas de cada equipo abrieron cada sección", () => {
    const r = usoPorEquipo([
      { equipo: "Ventas", secciones: [{ clave: "ventas", nombre: "Ventas", aperturas: 3, dias: 2 }] },
      { equipo: "Ventas", secciones: [] },
      { equipo: "Marketing", secciones: [{ clave: "marketing", nombre: "Marketing", aperturas: 1, dias: 1 }] },
    ]);
    expect(r.equipos[0]).toMatchObject({ equipo: "Ventas", personas: 2, porSeccion: { ventas: { personas: 1, dias: 2 } } });
    expect(r.secciones.map((s) => s.clave).sort()).toEqual(["marketing", "ventas"]);
  });
});
