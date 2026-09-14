/**
 * lib/documentacion/equipo.test.ts — el directorio del equipo de la base de conocimiento.
 *
 * Correr: `npx vitest run lib/documentacion/equipo.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import { armarEquipo, esCuentaDePrueba, iniciales, type FilaDeEquipo } from "./equipo";

const fila = (over: Partial<FilaDeEquipo>): FilaDeEquipo => ({
  name: "Persona",
  email: "persona@smarteamcr.com",
  area: "CSE",
  roleEnum: "CSE",
  photoUrl: null,
  ...over,
});

describe("armarEquipo", () => {
  it("agrupa por área con el nombre del departamento, en el orden de «Departamentos»", () => {
    const equipo = armarEquipo([
      fila({ name: "Elías González", area: "RevOps", roleEnum: "SUPER_ADMIN" }),
      fila({ name: "Jerson Escudero", area: "CSE", roleEnum: "CSE" }),
      fila({ name: "Andrés Pinzón", area: "Ventas", roleEnum: "VENTAS" }),
      fila({ name: "Alexander Vanegas", area: "CSE", roleEnum: "CSL" }),
    ]);
    expect(equipo.map((g) => g.area)).toEqual(["Customer Success", "Ventas", "Revenue Operations"]);
    expect(equipo[0].personas.map((p) => p.nombre)).toEqual(["Alexander Vanegas", "Jerson Escudero"]);
    expect(equipo[0].personas[0].rol).toBe("Customer Success Lead");
    expect(equipo[2].personas[0].rol).toBe("Dirección");
  });

  it("⛔ una cuenta de prueba no aparece en el directorio de la empresa", () => {
    const equipo = armarEquipo([fila({ name: "Test CSE (vista Heiver)" }), fila({ name: "Heiver Gomez" })]);
    expect(equipo.flatMap((g) => g.personas.map((p) => p.nombre))).toEqual(["Heiver Gomez"]);
    expect(esCuentaDePrueba("Testa Rossi")).toBe(false);
  });

  it("un área o un rol que no conoce se muestran tal cual, y sin área va al final", () => {
    const equipo = armarEquipo([
      fila({ name: "A", area: null }),
      fila({ name: "B", area: "Legal", roleEnum: "OTRO" }),
      fila({ name: "C", area: "Admin", roleEnum: "ADMIN" }),
    ]);
    expect(equipo.map((g) => g.area)).toEqual(["Finanzas y Administración", "Legal", "Sin área"]);
    expect(equipo[1].personas[0].rol).toBe("OTRO");
  });
});

describe("iniciales", () => {
  it("dos letras, del nombre y el apellido", () => {
    expect(iniciales("Alejandra Ortega")).toBe("AO");
    expect(iniciales("Dinia")).toBe("D");
  });
});
