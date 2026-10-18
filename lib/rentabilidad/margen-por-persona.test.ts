import { describe, expect, it } from "vitest";
import { filaDeMargen, horasDeLaCuenta, margenPorPersona, type CuentaParaMargen } from "./margen";

const cuenta = (o: Partial<CuentaParaMargen>): CuentaParaMargen => ({
  clienteId: "c",
  nombre: "C",
  cse: null,
  ingreso: 0,
  fuenteDelIngreso: null,
  horas: { reuniones: 0, preparacion: 0, entrega: 0 },
  reuniones: 0,
  plan: null,
  ...o,
});

describe("las horas de una cuenta suman las tareas internas", () => {
  it("reuniones + preparación + entrega + tareas; sin tareas (una foto v1) como antes", () => {
    expect(horasDeLaCuenta({ reuniones: 10, preparacion: 2, entrega: 5, tareas: 3, tareasAgenda: 2 })).toBe(20);
    expect(horasDeLaCuenta({ reuniones: 10, preparacion: 2, entrega: 5 })).toBe(17);
  });
  it("el margen cargado cuesta también las horas de tareas, y una cuenta solo con tareas no es «sin entrega»", () => {
    const f = filaDeMargen(cuenta({ ingreso: 1000, horas: { reuniones: 0, preparacion: 0, entrega: 0, tareas: 4 } }), 50, 1);
    expect(f.horas).toBe(4);
    expect(f.costo).toBe(200);
    expect(f.sinEntregaEstimada).toBe(false);
  });
});

describe("margenPorPersona: lo que generaron sus horas menos lo que costaron", () => {
  const cuentas = [
    cuenta({ clienteId: "a", ingreso: 1000, porPersona: [{ email: "lu@x", horas: 3 }, { email: "pe@x", horas: 1 }] }),
    cuenta({ clienteId: "b", ingreso: 0, porPersona: [{ email: "pe@x", horas: 2 }] }),
  ];
  const costo = (e: string) => (e === "lu@x" ? 40 : 60);
  const m = new Map(margenPorPersona(cuentas, costo).map((x) => [x.email, x]));

  it("el ingreso de una cuenta se reparte por la parte de horas de cada persona", () => {
    expect(m.get("lu@x")).toMatchObject({ horas: 3, ingreso: 750, costo: 120, margen: 630, cuentas: 1 });
  });
  it("una cuenta sin cobros no le suma a nadie, pero sus horas cuestan", () => {
    expect(m.get("pe@x")).toMatchObject({ horas: 3, ingreso: 250, costo: 180, margen: 70, cuentas: 2 });
  });
});
