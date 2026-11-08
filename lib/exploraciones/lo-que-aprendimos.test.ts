import { describe, expect, it } from "vitest";
import type { DestinoDePropuesta } from "./contenido";
import { dondeQuedoLoUsado, grupoDelDestino, ordenarPorGrupo } from "./lo-que-aprendimos";
import { MARCO_DE_VENTA } from "./marco";

describe("grupoDelDestino", () => {
  it("cada casilla es su grupo, con el nombre de su tarjeta", () => {
    expect(grupoDelDestino({ tipo: "casilla", clave: "retos" }, MARCO_DE_VENTA)).toEqual({ clave: "casilla:retos", nombre: "Retos" });
  });

  it("todo lo de la escala va junto", () => {
    const destinos: DestinoDePropuesta[] = [
      { tipo: "nivel", dimensionId: "d1" },
      { tipo: "aExplorar", dimensionId: "d2" },
      { tipo: "falta", criterioId: "k1" },
      { tipo: "area", areaId: "a1" },
      { tipo: "edicion" },
      { tipo: "perfil" },
    ];
    expect(new Set(destinos.map((d) => grupoDelDestino(d, MARCO_DE_VENTA).clave))).toEqual(new Set(["escala"]));
  });
});

describe("ordenarPorGrupo", () => {
  it("junta lo del mismo grupo en el orden de su primera aparición, sin desordenar dentro del grupo", () => {
    const xs = ["metas:1", "retos:1", "metas:2", "escala:1", "retos:2", "escala:2"];
    const grupo = (x: string) => ({ clave: x.split(":")[0], nombre: x });
    expect(ordenarPorGrupo(xs, grupo)).toEqual(["metas:1", "metas:2", "retos:1", "retos:2", "escala:1", "escala:2"]);
  });

  it("no toca la lista que recibe", () => {
    const xs = ["b:1", "a:1", "b:2"];
    ordenarPorGrupo(xs, (x) => ({ clave: x[0], nombre: x }));
    expect(xs).toEqual(["b:1", "a:1", "b:2"]);
  });
});

describe("dondeQuedoLoUsado", () => {
  it("los grupos con más van primero, en minúscula", () => {
    const nombres = ["Retos", "La escala", "La escala", "Metas", "Retos", "La escala"];
    expect(dondeQuedoLoUsado(nombres)).toBe("3 en la escala, 2 en retos y 1 en metas");
  });

  it("pasados tres grupos, el resto se cuenta junto", () => {
    const nombres = ["La escala", "La escala", "La escala", "Retos", "Retos", "Metas", "Tiempos", "Presupuesto", "Presupuesto"];
    expect(dondeQuedoLoUsado(nombres)).toBe("3 en la escala, 2 en retos, 2 en presupuesto y 2 en otros 2 lugares");
  });

  it("con cuatro grupos los nombra a los cuatro (no dice «otros 1 lugares»)", () => {
    expect(dondeQuedoLoUsado(["Retos", "Metas", "Tiempos", "La escala"])).toBe("1 en retos, 1 en metas, 1 en tiempos y 1 en la escala");
  });

  it("una sigla no se pasa a minúscula", () => {
    expect(dondeQuedoLoUsado(["CRM de hoy"])).toBe("1 en CRM de hoy");
  });

  it("sin nada, nada", () => {
    expect(dondeQuedoLoUsado([])).toBe("");
  });
});
