/**
 * lib/canvas/diagnostico-por-equipo.test.ts — el diagnóstico lee por equipo del cliente (L5 etapa 1, 2026-10-25).
 */
import { describe, expect, it } from "vitest";
import { bloqueDelDiagnosticoPorEquipo, rotuloDelEquipo, type EquipoParaElDiagnostico } from "./diagnostico-por-equipo";

const E = (clave: string, nombre: string, area: EquipoParaElDiagnostico["area"]): EquipoParaElDiagnostico => ({ clave, nombre, area });
const VENTAS = E("ventas", "Ventas", "1");
const MARKETING = E("marketing", "Marketing", "2");
const OPERACIONES = E("operaciones", "Operaciones", null);
const TECNOLOGIA = E("tecnologia", "Tecnología", null);
const TODOS = [E("direccion", "Dirección", null), VENTAS, MARKETING, E("servicio", "Servicio al cliente", "3"), OPERACIONES, TECNOLOGIA];

describe("el diagnóstico por equipo", () => {
  // CEMACO el 23 oct: cinco sesiones con equipos distintos (comercial, datos, operaciones, marketing dos veces).
  const leidas = [
    { id: "a", titulo: "Sesión comercial" },
    { id: "b", titulo: "Marketing 1" },
    { id: "c", titulo: "Marketing 2" },
    { id: "d", titulo: "Operaciones" },
    { id: "e", titulo: "Alineación" },
  ];
  const equipos = new Map([
    ["a", VENTAS],
    ["b", MARKETING],
    ["c", MARKETING],
    ["d", OPERACIONES],
    ["fuera", TECNOLOGIA],
  ]);

  it("dice qué equipos hablaron, con su área, y cuáles no", () => {
    const b = bloqueDelDiagnosticoPorEquipo(leidas, equipos, TODOS);
    expect(b).toContain("Ventas (área 1 de la escala: Ventas): 1 reunión — «Sesión comercial»");
    expect(b).toContain("Marketing (área 2 de la escala: Marketing): 2 reuniones");
    expect(b).toContain("Operaciones: 1 reunión");
    expect(b).toContain("Sin equipo: 1 reunión");
    // Tecnología tiene equipo en una reunión que NO se lee: no habló.
    expect(b).toMatch(/Equipos sin ninguna reunión: .*Tecnología/);
    expect(b).toMatch(/No le atribuyas a un equipo lo que dijo otro/);
  });

  it("sin ninguna reunión con equipo, nada (el mensaje queda como antes)", () => {
    expect(bloqueDelDiagnosticoPorEquipo(leidas, new Map(), TODOS)).toBe("");
  });

  it("el rótulo del encabezado", () => {
    expect(rotuloDelEquipo(MARKETING)).toBe("Equipo del cliente: Marketing");
  });
});
