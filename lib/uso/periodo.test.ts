/**
 * lib/uso/periodo.test.ts — «Uso de Nexus» › Equipo por período (2026-11-07). Correr: `npm test -- lib/uso`.
 */
import { describe, expect, it } from "vitest";
import { esPeriodo, rangoDelPeriodo, usoDelPeriodo } from "./periodo";

describe("el período en curso", () => {
  it("el mes empieza el 1 y termina hoy", () => {
    const r = rangoDelPeriodo("mes", "2026-11-07");
    expect(r).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-07", nombre: "noviembre 2026" });
    // Medianoche de Costa Rica (UTC−6).
    expect(r.desdeInstante.toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });

  it("trimestre, semestre y año arrancan en su primer mes", () => {
    expect(rangoDelPeriodo("trimestre", "2026-11-07")).toMatchObject({ desde: "2026-10-01", nombre: "oct – dic 2026" });
    expect(rangoDelPeriodo("trimestre", "2026-03-31")).toMatchObject({ desde: "2026-01-01", nombre: "ene – mar 2026" });
    expect(rangoDelPeriodo("semestre", "2026-11-07")).toMatchObject({ desde: "2026-07-01", nombre: "jul – dic 2026" });
    expect(rangoDelPeriodo("semestre", "2026-06-30")).toMatchObject({ desde: "2026-01-01" });
    expect(rangoDelPeriodo("anio", "2026-11-07")).toMatchObject({ desde: "2026-01-01", nombre: "2026" });
  });

  it("solo acepta los cuatro períodos", () => {
    expect(esPeriodo("trimestre")).toBe(true);
    expect(esPeriodo("semana")).toBe(false);
    expect(esPeriodo(undefined)).toBe(false);
  });
});

describe("el uso de cada persona en el período", () => {
  const personas = [
    { email: "ana@x.com", nombre: "Ana", equipo: "Customer Success", activo: true },
    { email: "luis@x.com", nombre: "Luis", equipo: "Customer Success", activo: true },
    { email: "marco@x.com", nombre: "Marco", equipo: "Ventas", activo: true },
  ];
  const nombre = (slug: string | null) => (slug === "nexus-chat" ? "Chat de Nexus" : (slug ?? "Sin agente"));

  it("cuenta días distintos y suma las llamadas que disparó cada persona", () => {
    const r = usoDelPeriodo(
      personas,
      [
        { personaEmail: "ana@x.com", dia: "2026-11-02" },
        { personaEmail: "ANA@x.com", dia: "2026-11-02" },
        { personaEmail: "ana@x.com", dia: "2026-11-03" },
        { personaEmail: "marco@x.com", dia: "2026-11-03" },
        { personaEmail: "test@x.com", dia: "2026-11-03" },
      ],
      [
        { triggeredByEmail: "Ana@x.com", agentSlug: "nexus-chat", origen: null, llamadas: 5, costo: 0.5, sinTarifa: 0 },
        { triggeredByEmail: "ana@x.com", agentSlug: "agent-handoff", origen: null, llamadas: 2, costo: 1, sinTarifa: 0 },
        { triggeredByEmail: "marco@x.com", agentSlug: null, origen: null, llamadas: 1, costo: 0.1, sinTarifa: 0 },
      ],
      nombre,
    );
    expect(r.equipos.map((e) => e.equipo)).toEqual(["Customer Success", "Ventas"]);
    const [ana, luis] = r.equipos[0].personas;
    expect(ana).toMatchObject({ dias: 2, llamadas: 7, costo: 1.5, sinTarifa: 0 });
    expect(ana.agentes).toEqual([
      { nombre: "Chat de Nexus", llamadas: 5 },
      { nombre: "agent-handoff", llamadas: 2 },
    ]);
    expect(luis).toMatchObject({ dias: 0, llamadas: 0, costo: 0, agentes: [] });
    expect(r.equipos[0].total).toEqual({ dias: 2, llamadas: 7, costo: 1.5, sinTarifa: 0, conUso: 1 });
    expect(r.maximo).toEqual({ dias: 2, llamadas: 7 });
  });

  it("el avance que corre solo tras una reunión no es de nadie, y lo del sistema tampoco", () => {
    const r = usoDelPeriodo(
      personas,
      [],
      [
        { triggeredByEmail: "luis@x.com", agentSlug: "agent-timeline-progress", origen: "post-process › avance", llamadas: 9, costo: 3, sinTarifa: 0 },
        { triggeredByEmail: null, agentSlug: "agent-post-session", origen: null, llamadas: 40, costo: 8, sinTarifa: 0 },
      ],
      nombre,
    );
    expect(r.equipos[0].personas[1]).toMatchObject({ nombre: "Luis", llamadas: 0 });
    expect(r.maximo.llamadas).toBe(0);
  });

  it("solo muestra los 3 agentes que más usó", () => {
    const r = usoDelPeriodo(
      [personas[0]],
      [],
      ["a", "b", "c", "d"].map((slug, i) => ({ triggeredByEmail: "ana@x.com", agentSlug: slug, origen: null, llamadas: i + 1, costo: 0, sinTarifa: 0 })),
      nombre,
    );
    expect(r.equipos[0].personas[0].agentes.map((a) => a.nombre)).toEqual(["d", "c", "b"]);
  });

  it("las llamadas sin tarifa se cuentan aparte: no suman US$ 0 al costo y el total las dice", () => {
    const r = usoDelPeriodo(
      personas,
      [],
      [
        { triggeredByEmail: "ana@x.com", agentSlug: "nexus-chat", origen: null, llamadas: 4, costo: 0.8, sinTarifa: 1 },
        { triggeredByEmail: "luis@x.com", agentSlug: "nexus-chat", origen: null, llamadas: 2, costo: 0, sinTarifa: 2 },
      ],
      nombre,
    );
    const [ana, luis] = r.equipos[0].personas;
    expect(ana).toMatchObject({ llamadas: 4, costo: 0.8, sinTarifa: 1 });
    expect(luis).toMatchObject({ llamadas: 2, costo: 0, sinTarifa: 2 });
    expect(r.equipos[0].total).toMatchObject({ llamadas: 6, costo: 0.8, sinTarifa: 3 });
  });

  it("quien ya no está entra si tuvo uso, al final de su equipo y con «(ya no está)»; sin uso, no aparece", () => {
    const r = usoDelPeriodo(
      [
        { email: "ana@x.com", nombre: "Ana", equipo: "Customer Success", activo: true },
        { email: "beto@x.com", nombre: "Beto", equipo: "Customer Success", activo: false },
        { email: "luis@x.com", nombre: "Luis", equipo: "Customer Success", activo: true },
        { email: "carla@x.com", nombre: "Carla", equipo: "Customer Success", activo: false },
        { email: "dani@x.com", nombre: "Dani", equipo: "Marketing", activo: false },
        { email: "marco@x.com", nombre: "Marco", equipo: "Ventas", activo: true },
      ],
      [
        { personaEmail: "beto@x.com", dia: "2026-10-02" },
        { personaEmail: "dani@x.com", dia: "2026-10-03" },
      ],
      [{ triggeredByEmail: "beto@x.com", agentSlug: "nexus-chat", origen: null, llamadas: 3, costo: 0.3, sinTarifa: 0 }],
      nombre,
    );
    // Marketing solo tiene a Dani, que ya no está: conserva su lugar entre los equipos.
    expect(r.equipos.map((e) => e.equipo)).toEqual(["Customer Success", "Marketing", "Ventas"]);
    expect(r.equipos[0].personas.map((p) => p.nombre)).toEqual(["Ana", "Luis", "Beto (ya no está)"]);
    expect(r.equipos[0].total).toMatchObject({ dias: 1, llamadas: 3, costo: 0.3, conUso: 1 });
    expect(r.equipos[1].personas.map((p) => p.nombre)).toEqual(["Dani (ya no está)"]);
  });
});
