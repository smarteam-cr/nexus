import { describe, it, expect } from "vitest";
import { isKept, repartoInicial, phaseHasChanges } from "./regen-columnas";

const pendienteIA = { id: "a", status: "PENDING", source: "AGENT" };
const pendienteHumana = { id: "b", status: "PENDING", source: "HUMAN" };
const hecha = { id: "c", status: "DONE", source: "AGENT" };
const enCurso = { id: "d", status: "IN_PROGRESS", source: "AGENT" };
const suspendida = { id: "e", status: "SUSPENDED", source: "AGENT" };

describe("isKept — qué se preserva sí o sí", () => {
  it("preserva lo que tiene progreso humano encima o es manual", () => {
    expect(isKept(hecha)).toBe(true);
    expect(isKept(enCurso)).toBe(true);
    expect(isKept(suspendida)).toBe(true);
    expect(isKept(pendienteHumana)).toBe(true);
  });

  it("una pendiente de la IA es reemplazable", () => {
    expect(isKept(pendienteIA)).toBe(false);
  });
});

describe("repartoInicial", () => {
  it("con propuesta: las pendientes de la IA van a descartables, el resto se preserva", () => {
    const { descartables, preservadas } = repartoInicial(
      [pendienteIA, pendienteHumana, hecha, enCurso, suspendida],
      3,
    );
    expect(descartables.map((t) => t.id)).toEqual(["a"]);
    expect(preservadas.map((t) => t.id)).toEqual(["b", "c", "d", "e"]);
  });

  it("SIN propuesta: no se descarta NADA — la fase queda intacta", () => {
    const { descartables, preservadas } = repartoInicial(
      [pendienteIA, pendienteHumana, hecha],
      0,
    );
    expect(descartables).toEqual([]);
    expect(preservadas.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("sin propuesta y todo pendiente-IA: igual se preserva (aplicar NO vacía la fase)", () => {
    // El modo de falla que esto evita: el agente deja en paz una fase que las instrucciones
    // dan por resuelta → sin esta regla, "Aplicar todo" borraba sus 9 tareas en silencio.
    const actuales = [pendienteIA, { id: "f", status: "PENDING", source: "AGENT" }];
    const { descartables, preservadas } = repartoInicial(actuales, 0);
    expect(descartables).toEqual([]);
    expect(preservadas).toHaveLength(2);
  });

  it("sin tareas actuales: ambas columnas vacías, con o sin propuesta", () => {
    expect(repartoInicial([], 0)).toEqual({ descartables: [], preservadas: [] });
    expect(repartoInicial([], 5)).toEqual({ descartables: [], preservadas: [] });
  });
});

describe("phaseHasChanges", () => {
  it("hay cambios ⇔ el agente propuso algo", () => {
    expect(phaseHasChanges(0)).toBe(false);
    expect(phaseHasChanges(1)).toBe(true);
  });
});
