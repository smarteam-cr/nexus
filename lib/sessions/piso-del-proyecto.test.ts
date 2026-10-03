/**
 * lib/sessions/piso-del-proyecto.test.ts
 *
 * Correr: `npx vitest run lib/sessions/piso-del-proyecto.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pisoDelProyecto, quedaAntesDelPiso } from "./piso-del-proyecto";

const d = (s: string) => new Date(s);

describe("el piso de fecha de un proyecto", () => {
  const shp = { createdAt: d("2026-08-25"), hubspotCreatedAt: d("2026-08-25") };

  it("caso CAV SHP: con un proyecto anterior, una reunión de 2025 queda fuera", () => {
    const piso = pisoDelProyecto(shp, true);
    expect(quedaAntesDelPiso(d("2025-10-30").getTime(), piso, "agent")).toBe(true);
  });

  it("la venta reciente (dentro de los 90 días previos) sí entra", () => {
    const piso = pisoDelProyecto(shp, true);
    expect(quedaAntesDelPiso(d("2026-07-17").getTime(), piso, "agent")).toBe(false);
  });

  it("una reunión vieja agregada A MANO entra: alguien decidió que sí", () => {
    const piso = pisoDelProyecto(shp, true);
    expect(quedaAntesDelPiso(d("2025-10-30").getTime(), piso, "manual")).toBe(false);
  });

  it("primer proyecto del cliente (caso kamalio): sin piso, entra todo su historial", () => {
    const piso = pisoDelProyecto({ createdAt: d("2026-08-10"), hubspotCreatedAt: null }, false);
    expect(piso).toBeNull();
    expect(quedaAntesDelPiso(d("2025-03-01").getTime(), piso, "agent")).toBe(false);
  });

  it("un proyecto importado tarde a Nexus mide desde su fecha de HubSpot, no desde la importación", () => {
    const piso = pisoDelProyecto({ createdAt: d("2026-07-10"), hubspotCreatedAt: d("2026-01-15") }, true);
    expect(quedaAntesDelPiso(d("2026-02-01").getTime(), piso, "agent")).toBe(false);
  });

  it("la membresía del proyecto aplica el piso (el chokepoint que leen todos los documentos)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/sessions/project-sources.ts"), "utf8");
    const i = src.indexOf("export async function getProjectMemberSessions");
    const tramo = src.slice(i, src.indexOf("export async function getProjectHandoffSessions"));
    expect(tramo.length, "la guarda no mira nada").toBeGreaterThan(500);
    expect(tramo, "getProjectMemberSessions dejó de aplicar el piso").toContain("quedaAntesDelPiso(");
  });
});
