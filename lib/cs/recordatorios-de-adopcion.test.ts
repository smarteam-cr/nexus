import { describe, expect, it } from "vitest";
import { recordatoriosDeHoy, recordatoriosDelProyecto, textoDelRecordatorio, urlDeLaAdopcion } from "./recordatorios-de-adopcion";

const BASE = { projectId: "p1", clientId: "c1", inicio: null, entrega: null, recurrente: false };

describe("cuándo se recuerda revisar la adopción", () => {
  it("a los 30 días del inicio, durante una semana, y nunca antes ni después", () => {
    const p = { ...BASE, inicio: "2026-09-01" };
    expect(recordatoriosDelProyecto(p, "2026-09-30")).toEqual([]);
    expect(recordatoriosDelProyecto(p, "2026-10-01").map((r) => r.clave)).toEqual(["adopcion:inicio:p1"]);
    expect(recordatoriosDelProyecto(p, "2026-10-07")).toHaveLength(1);
    // No es retroactivo: pasada la ventana, nada.
    expect(recordatoriosDelProyecto(p, "2026-10-08")).toEqual([]);
  });

  it("en la semana antes de la entrega, y la fecha nueva si la entrega se mueve", () => {
    const p = { ...BASE, entrega: "2026-10-20" };
    expect(recordatoriosDelProyecto(p, "2026-10-12")).toEqual([]);
    expect(recordatoriosDelProyecto(p, "2026-10-13").map((r) => r.clave)).toEqual(["adopcion:entrega:p1:2026-10-20"]);
    expect(recordatoriosDelProyecto(p, "2026-10-20")).toHaveLength(1);
    expect(recordatoriosDelProyecto(p, "2026-10-21")).toEqual([]);
    expect(recordatoriosDelProyecto({ ...p, entrega: "2026-10-27" }, "2026-10-21")[0].clave).toBe("adopcion:entrega:p1:2026-10-27");
  });

  it("una vez al mes en las cuentas recurrentes, en la primera semana, una sola por cuenta", () => {
    const a = { ...BASE, recurrente: true };
    const b = { ...BASE, projectId: "p2", recurrente: true };
    expect(recordatoriosDeHoy([a, b], "2026-11-03").map((r) => r.clave)).toEqual(["adopcion:mes:c1:2026-11"]);
    expect(recordatoriosDeHoy([a, b], "2026-11-12")).toEqual([]);
    expect(recordatoriosDeHoy([{ ...a, recurrente: false }], "2026-11-03")).toEqual([]);
  });

  it("lleva a la pestaña Adopción y lo dice en palabras", () => {
    expect(urlDeLaAdopcion("c1")).toBe("/customer-success/c1?pestana=adopcion");
    const [mensual] = recordatoriosDeHoy([{ ...BASE, recurrente: true }], "2026-11-03");
    expect(textoDelRecordatorio(mensual, "Wherex", null).titulo).toBe("Revisa la adopción de Wherex (noviembre)");
  });
});
