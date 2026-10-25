/**
 * lib/clients/lo-que-le-falta-comprar.test.ts — la venta cruzada de cada empresa (R12): los casos que la moverían y no
 * tiene, y el que va primero.
 */
import { describe, expect, it } from "vitest";
import type { Letra } from "@/lib/escala/documento/tipos";
import type { AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { casoPorId } from "@/lib/casos-de-uso/catalogo";
import { loQueLeFaltaComprar } from "./lo-que-le-falta-comprar";

const OCHO = [1, 2, 3, 4, 5, 6, 7, 8];
function area(id: "1" | "2" | "3", nombre: string, l: Letra, frenan: string[]): AreaParaElCamino {
  return {
    id,
    nombre,
    nivel: l,
    objetivo: "F",
    frena: { capa: "base", nivel: l, dimensiones: frenan },
    capas: { base: { nombre: "Base operativa", nivel: l }, produccion: { nombre: "Producción", nivel: l } },
    dimensiones: OCHO.map((n) => ({ id: `${id}.${n}`, nombre: `D${id}.${n}`, aplica: true, nivel: l, clase: "evidencia" as const })),
  };
}

describe("con la escala", () => {
  it("el área más baja pone su caso primero, y ese es el siguiente caso", () => {
    const r = loQueLeFaltaComprar({ escala: [area("1", "Ventas", "F", ["1.1"]), area("2", "Marketing", "I", ["2.1", "2.2"])], casos: [], hubsQueLeFaltan: [] });
    expect(r.conEscala).toBe(true);
    expect(r.casos.length).toBeGreaterThan(1);
    expect(r.siguiente?.areaId).toBe("2");
    expect(r.casos.length).toBeLessThanOrEqual(5);
  });

  it("lo que ya tiene (en el plan, en un ciclo o cumplido) y lo descartado no se sugieren; lo sugerido sí, marcado", () => {
    const base = loQueLeFaltaComprar({ escala: [area("1", "Ventas", "I", ["1.1", "1.2"])], casos: [], hubsQueLeFaltan: [] });
    const primero = base.siguiente!;
    const conEse = loQueLeFaltaComprar({ escala: [area("1", "Ventas", "I", ["1.1", "1.2"])], casos: [{ titulo: primero.titulo, estado: "en_ciclo" }], hubsQueLeFaltan: [] });
    expect(conEse.casos.some((c) => c.casoId === primero.casoId)).toBe(false);
    expect(conEse.yaTiene).toBe(1);
    const descartado = loQueLeFaltaComprar({ escala: [area("1", "Ventas", "I", ["1.1", "1.2"])], casos: [{ titulo: ` ${primero.titulo.toUpperCase()} `, estado: "descartado" }], hubsQueLeFaltan: [] });
    expect(descartado.casos.some((c) => c.casoId === primero.casoId)).toBe(false);
    const sugerido = loQueLeFaltaComprar({ escala: [area("1", "Ventas", "I", ["1.1", "1.2"])], casos: [{ titulo: primero.titulo, estado: "sugerido" }], hubsQueLeFaltan: [] });
    expect(sugerido.siguiente).toMatchObject({ casoId: primero.casoId, yaSugerido: true });
  });

  it("nunca sugiere un complementario (la escala no lo mide)", () => {
    const r = loQueLeFaltaComprar({ escala: [area("1", "Ventas", "D", ["1.1"]), area("2", "Marketing", "D", ["2.1"]), area("3", "Servicio", "D", ["3.1"])], casos: [], hubsQueLeFaltan: [] });
    expect(r.casos.every((c) => casoPorId(c.casoId)?.tipo !== "complementario")).toBe(true);
  });
});

describe("sin la escala", () => {
  it("lo que aterriza el área de cada hub que le falta; Content Hub no tiene área", () => {
    const r = loQueLeFaltaComprar({ escala: null, casos: [], hubsQueLeFaltan: [{ hub: "content" }, { hub: "marketing" }, { hub: "sales" }] });
    expect(r.conEscala).toBe(false);
    expect(r.casos.map((c) => c.casoId)).toEqual(["sistematiza-marketing", "sistematiza-ventas"]);
    expect(r.siguiente?.casoId).toBe("sistematiza-marketing");
    expect(r.porQue).toContain("no está posicionada");
  });

  it("sin escala ni hubs, nada que sugerir y lo dice", () => {
    const r = loQueLeFaltaComprar({ escala: null, casos: [], hubsQueLeFaltan: [] });
    expect(r.casos).toEqual([]);
    expect(r.siguiente).toBeNull();
    expect(r.porQue).toContain("no hay qué sugerir");
  });
});
