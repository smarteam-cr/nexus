import { describe, expect, it } from "vitest";
import { armarIcp, armarPersonas } from "./audiencia";

describe("el ICP para la base de conocimiento", () => {
  const icp = armarIcp([
    { section: "SIGNAL_ANTI", label: "Compradores tácticos", order: 1 },
    { section: "FIRMOGRAFICA_DESCRIPTOR", label: "Más de 80 empleados", order: 1 },
    { section: "FIRMOGRAFICA_DESCRIPTOR", label: "Empresa mediana o grande", order: 0 },
    { section: "SIGNAL_ANTI", label: "  ", order: 0 },
  ]);

  it("agrupa en el orden de Marketing y ordena los ítems", () => {
    expect(icp.map((g) => g.titulo)).toEqual(["Cómo es la empresa", "Señales para calificar"]);
    expect(icp[0].secciones[0]).toEqual({
      titulo: "Firmográfica",
      items: ["Empresa mediana o grande", "Más de 80 empleados"],
    });
  });

  it("no muestra grupos ni secciones vacías, ni ítems en blanco", () => {
    expect(icp.find((g) => g.titulo === "Cómo piensa y se comporta")).toBeUndefined();
    expect(icp[1].secciones).toEqual([{ titulo: "Anti-ICP", items: ["Compradores tácticos"] }]);
  });
});

describe("las buyer personas para la base de conocimiento", () => {
  it("van en su orden, y lo que falta queda vacío en vez de inventarse", () => {
    const personas = armarPersonas([
      { name: "Gerente de Marketing", role: null, description: "Lidera marketing.", pains: null, goals: "ROI", order: 2 },
      { name: "Director de Ventas", role: "Punta de lanza", description: "Lidera ventas.", pains: "Presión", goals: null, order: 0 },
    ]);
    expect(personas.map((p) => p.nombre)).toEqual(["Director de Ventas", "Gerente de Marketing"]);
    expect(personas[1]).toMatchObject({ arquetipo: null, dolores: null, objetivos: "ROI" });
  });
});
