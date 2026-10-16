import { describe, expect, it } from "vitest";
import { cuentasSinCse } from "./sin-cse";

const proyecto = (nombre: string, cse: { nombre: string; email: string } | null, extra: Record<string, unknown> = {}) =>
  ({ nombre, activo: true, cseNombre: cse?.nombre ?? null, cseEmail: cse?.email ?? null, ...extra }) as never;

const ANA = { email: "ana@smarteamcr.com", nombre: "Ana", esCse: true };
const LUIS = { email: "luis@smarteamcr.com", nombre: "Luis", esCse: true };
const CSL = { email: "csl@smarteamcr.com", nombre: "Alex", esCse: false };

describe("las cuentas sin CSE y a quién propone Nexus", () => {
  it("sin proyectos sin CSE, no aparece", () => {
    expect(cuentasSinCse([{ clientId: "c1", nombre: "A", proyectos: [proyecto("Impl", ANA)] }], [ANA], new Map())).toEqual([]);
  });

  it("propone al CSE que ya lleva otros proyectos de la cuenta", () => {
    const r = cuentasSinCse(
      [{ clientId: "c1", nombre: "A", proyectos: [proyecto("Impl", ANA), proyecto("Fase 2", null)] }],
      [ANA, LUIS],
      new Map([["c1", [[LUIS.email], [LUIS.email]]]]),
    );
    expect(r).toHaveLength(1);
    expect(r[0].proyectos).toEqual(["Fase 2"]);
    expect(r[0].propuesta).toMatchObject({ email: ANA.email, motivo: "Ya lleva otros proyectos de esta cuenta." });
  });

  it("si nadie lleva la cuenta, propone a quien más estuvo en sus reuniones", () => {
    const r = cuentasSinCse(
      [{ clientId: "c1", nombre: "A", proyectos: [proyecto("Impl", null, { cseDeBaja: "Lorena" })] }],
      [ANA, LUIS],
      new Map([["c1", [["cliente@a.com", "Luis@smarteamcr.com"], [LUIS.email, ANA.email], [ANA.email]]]]),
    );
    expect(r[0].deBaja).toEqual(["Lorena"]);
    expect(r[0].propuesta?.email).toBe(ANA.email);
    expect(r[0].propuesta?.motivo).toContain("2 reuniones");
  });

  it("por reuniones solo propone a quien tiene el rol CSE", () => {
    const r = cuentasSinCse(
      [{ clientId: "c1", nombre: "A", proyectos: [proyecto("Impl", null)] }],
      [CSL, LUIS],
      new Map([["c1", [[CSL.email], [CSL.email], [LUIS.email]]]]),
    );
    expect(r[0].propuesta?.email).toBe(LUIS.email);
    expect(r[0].propuesta?.motivo).toContain("1 reunión ");
  });

  it("si el CSE de la cuenta ya no está en el equipo, no lo propone", () => {
    const r = cuentasSinCse(
      [{ clientId: "c1", nombre: "A", proyectos: [proyecto("Impl", { nombre: "Ex", email: "ex@smarteamcr.com" }), proyecto("Otro", null)] }],
      [ANA],
      new Map(),
    );
    expect(r[0].propuesta).toBeNull();
  });

  it("primero las cuentas con más proyectos sin CSE", () => {
    const r = cuentasSinCse(
      [
        { clientId: "c1", nombre: "B", proyectos: [proyecto("x", null)] },
        { clientId: "c2", nombre: "A", proyectos: [proyecto("x", null), proyecto("y", null)] },
      ],
      [],
      new Map(),
    );
    expect(r.map((c) => c.clientId)).toEqual(["c2", "c1"]);
  });
});
