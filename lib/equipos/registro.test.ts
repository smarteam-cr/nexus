import { describe, expect, it } from "vitest";
import { EQUIPOS, type ClaveDeEquipoFijo } from "@/lib/tareas/equipos";
import { EQUIPOS_DEL_SIGUIENTE_PASO } from "@/lib/siguiente-paso/propiedades";
import { equipoDeRol, EQUIPOS_DE_NEXUS, siguientesPasosDelRol, veLaAgenda } from "./registro";

describe("el registro de equipos", () => {
  it("cada rol está en un solo equipo, y dirección en ninguno", () => {
    const roles = EQUIPOS_DE_NEXUS.flatMap((e) => e.roles);
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles).not.toContain("SUPER_ADMIN");
    expect(equipoDeRol("SUPER_ADMIN")).toBeNull();
    expect(equipoDeRol("CSL")?.clave).toBe("cs");
  });

  it("cada sprint existe en Tareas y cada siguiente paso existe en HubSpot", () => {
    const sprints = new Set<string>(EQUIPOS.map((e) => e.clave));
    for (const e of EQUIPOS_DE_NEXUS) if (e.sprint) expect(sprints.has(e.sprint as ClaveDeEquipoFijo)).toBe(true);
    const pasos = new Set<string>(EQUIPOS_DEL_SIGUIENTE_PASO.map((e) => e.clave));
    for (const e of EQUIPOS_DE_NEXUS) if (e.siguientePaso) expect(pasos.has(e.siguientePaso)).toBe(true);
    // Todo siguiente paso de HubSpot lo lleva algún equipo.
    expect([...pasos].sort()).toEqual(EQUIPOS_DE_NEXUS.flatMap((e) => (e.siguientePaso ? [e.siguientePaso] : [])).sort());
  });

  it("el siguiente paso que escribe cada rol (lo mismo que antes del registro)", () => {
    expect(siguientesPasosDelRol("SUPER_ADMIN")).toEqual(["ventas", "cs", "dev"]);
    expect(siguientesPasosDelRol("VENTAS")).toEqual(["ventas"]);
    expect(siguientesPasosDelRol("CSE")).toEqual(["cs"]);
    expect(siguientesPasosDelRol("CSL")).toEqual(["cs"]);
    expect(siguientesPasosDelRol("DEV")).toEqual(["dev"]);
    expect(siguientesPasosDelRol("MARKETING")).toEqual([]);
    expect(siguientesPasosDelRol("ADMIN")).toEqual([]);
    expect(siguientesPasosDelRol(null)).toEqual([]);
  });

  it("la agenda del día: Ventas, CS, Dev y dirección", () => {
    expect(["VENTAS", "CSE", "CSL", "DEV", "SUPER_ADMIN"].every(veLaAgenda)).toBe(true);
    expect(veLaAgenda("MARKETING")).toBe(false);
  });
});
