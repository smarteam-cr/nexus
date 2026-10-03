/**
 * lib/kickoff/nombre-con-un-apellido.test.ts — el equipo del kickoff muestra nombre + primer
 * apellido (2026-10-02). Los dos casos reales que la motivaron van primero.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { nombreConUnApellido, nombreParaElKickoff, unidadesDelNombre } from "./nombre-con-un-apellido";
import { normalizeEquipo } from "@/components/canvas/kickoff-sections/types";

describe("nombre + primer apellido", () => {
  it("⭐ el caso de Cemaco: «Liliana Moreno Salgado» se ve «Liliana Moreno»", () => {
    expect(nombreConUnApellido("Liliana Moreno Salgado")).toBe("Liliana Moreno");
  });

  it("⭐ un nombre compuesto con UN apellido queda entero (está en 8 kickoffs)", () => {
    /* La edición que lo pone en rojo: «3 palabras → las dos primeras» sin mirar los compuestos.
       «Juan Carlos» no tiene apellido: se le borraría el único. */
    expect(nombreConUnApellido("Juan Carlos Armijos")).toBe("Juan Carlos Armijos");
  });

  it.each([
    ["Elías", "Elías"],
    ["Elías González", "Elías González"],
    ["  Elías   González  Ugalde ", "Elías González"],
    ["Ana Lucía Gómez Ruiz", "Ana Lucía Gómez"],
    ["Andrea Paola Gómez Ruiz", "Andrea Gómez"],
    ["Juan Carlos Armijos Pérez", "Juan Carlos Armijos"],
    ["José Luis Rodríguez", "José Luis Rodríguez"],
    ["MARÍA JOSÉ VARGAS SOLÍS", "MARÍA JOSÉ VARGAS"],
  ])("%s → %s", (entrada, esperado) => {
    expect(nombreConUnApellido(entrada)).toBe(esperado);
  });

  it("las partículas viajan con el apellido", () => {
    expect(unidadesDelNombre("Juan de la Cruz Pérez")).toEqual(["Juan", "de la Cruz", "Pérez"]);
    expect(nombreConUnApellido("Juan de la Cruz Pérez")).toBe("Juan de la Cruz");
    expect(nombreConUnApellido("Laura del Valle Mora Soto")).toBe("Laura Mora");
  });

  it("el nombre visible escrito a mano manda; vacío vuelve a la regla", () => {
    expect(nombreParaElKickoff({ name: "Liliana Moreno Salgado", nombreVisible: "Lili Moreno" })).toBe("Lili Moreno");
    expect(nombreParaElKickoff({ name: "Liliana Moreno Salgado", nombreVisible: "  " })).toBe("Liliana Moreno");
    expect(nombreParaElKickoff({ name: "Liliana Moreno Salgado" })).toBe("Liliana Moreno");
  });
});

describe("el kickoff pinta el nombre corto y conserva el escrito a mano", () => {
  const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

  it("la tarjeta del equipo pinta `nombreParaElKickoff`, no el nombre completo", () => {
    /* La edición que lo pone en rojo: volver a `{m.name}` en la tarjeta. Es el ÚNICO punto de
       render del equipo (editor, enlace del cliente y PDF). */
    const src = leer("components/canvas/kickoff-sections/EquipoSection.tsx");
    expect(src).toContain("nombreParaElKickoff(m)");
    expect(src).not.toMatch(/fontWeight:\s*700,\s*color:\s*"var\(--text\)"\s*\}\}>\{m\.name\}/);
  });

  it("el normalizador no tira el nombre visible (si no, se pierde al primer guardado)", () => {
    /* La edición que lo pone en rojo: sacar la línea que lo conserva en `normalizeEquipo`. Cada
       tecla del editor pasa por ahí, así que el nombre escrito a mano duraría hasta el próximo
       guardado. Se prueba la función, no el texto: el campo también está declarado en el tipo. */
    const m = { teamMemberId: "t1", name: "Liliana Moreno Salgado", role: "CSE", photoUrl: null };
    expect(normalizeEquipo({ members: [{ ...m, nombreVisible: "Lili Moreno" }] }).members[0].nombreVisible).toBe(
      "Lili Moreno",
    );
    expect("nombreVisible" in normalizeEquipo({ members: [m] }).members[0]).toBe(false);
  });
});
