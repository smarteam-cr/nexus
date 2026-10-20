import { describe, expect, it } from "vitest";
import { lineaDeLasTareasNuevas } from "./tareas-nuevas";

const r = (sessionId: string, fecha: string, conAcceso = true) => ({ sessionId, fecha, conAcceso });

describe("las tareas nuevas de tus reuniones, en una sola línea a Tareas (2026-10-20)", () => {
  it("nombra las cuentas y lleva a Tareas", () => {
    const p = lineaDeLasTareasNuevas([
      { r: r("s1", "2026-10-19"), partes: { tareas: 2 }, empresa: "Cayalá" },
      { r: r("s2", "2026-10-20"), partes: { tareas: 1 }, empresa: "CEMACO" },
      { r: r("s3", "2026-10-18"), partes: { tareas: 1 }, empresa: "Cayalá" },
    ]);
    expect(p.titulo).toBe("Tienes tareas nuevas de las reuniones con Cayalá y CEMACO");
    expect(p.detalle).toContain("4 tareas");
    expect(p.href).toBe("/tareas");
    expect(p.accion).toBe("Revisar en Tareas");
    expect(p.desde).toBe("2026-10-20");
  });

  it("de una reunión que no puedes abrir no nombra la cuenta", () => {
    const p = lineaDeLasTareasNuevas([
      { r: r("s1", "2026-10-19"), partes: { tareas: 1 }, empresa: "Honda" },
      { r: r("s2", "2026-10-19", false), partes: { tareas: 1 }, empresa: "" },
    ]);
    expect(p.titulo).toBe("Tienes tareas nuevas de las reuniones con Honda y otras");
    const sola = lineaDeLasTareasNuevas([{ r: r("s2", "2026-10-19", false), partes: { tareas: 3 }, empresa: "" }]);
    expect(sola.titulo).toBe("Tienes tareas nuevas de tus reuniones");
  });
});
