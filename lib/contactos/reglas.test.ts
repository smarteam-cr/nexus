import { describe, expect, it } from "vitest";
import { huellaDe, invitadosDeLaReunion, planDeCopia, ticketAbierto } from "./reglas";

describe("el plan de la copia", () => {
  const e = (clientId: string, hubspotId: string, huella = "h", vigente = true) => ({ clientId, hubspotId, huella, vigente });
  const n = (clientId: string, hubspotId: string, huella = "h") => ({ clientId, hubspotId, huella });

  it("crea lo nuevo, actualiza lo que cambió y deja lo igual", () => {
    const p = planDeCopia([e("c1", "1"), e("c1", "2", "vieja")], [n("c1", "1"), n("c1", "2", "nueva"), n("c1", "3")], new Set(["c1"]));
    expect(p.crear.map((x) => x.hubspotId)).toEqual(["3"]);
    expect(p.actualizar.map((x) => x.hubspotId)).toEqual(["2"]);
    expect(p.sinCambio).toBe(1);
    expect(p.bajas).toEqual([]);
  });

  it("da de baja lo que no volvió, solo si el cliente se leyó entero", () => {
    const existentes = [e("c1", "1"), e("c2", "9")];
    const p = planDeCopia(existentes, [], new Set(["c1"]));
    expect(p.bajas).toEqual([{ clientId: "c1", hubspotId: "1" }]);
  });

  it("reactiva una fila dada de baja que vuelve", () => {
    const p = planDeCopia([e("c1", "1", "h", false)], [n("c1", "1")], new Set(["c1"]));
    expect(p.actualizar.map((x) => x.hubspotId)).toEqual(["1"]);
  });

  it("un contacto de dos clientes es dos filas", () => {
    const p = planDeCopia([], [n("c1", "1"), n("c2", "1"), n("c1", "1")], new Set());
    expect(p.crear).toHaveLength(2);
  });
});

describe("la huella", () => {
  it("no depende del orden de los campos y ve las fechas", () => {
    const d = new Date("2026-10-16T00:00:00Z");
    expect(huellaDe({ a: 1, b: d })).toBe(huellaDe({ b: d, a: 1 }));
    expect(huellaDe({ a: 1, b: null })).not.toBe(huellaDe({ a: 1, b: d }));
  });
});

describe("¿el ticket está abierto?", () => {
  it("cerrado por fecha o por la etapa", () => {
    expect(ticketAbierto(null, false)).toBe(true);
    expect(ticketAbierto(null, null)).toBe(true);
    expect(ticketAbierto(new Date(), false)).toBe(false);
    expect(ticketAbierto(null, true)).toBe(false);
  });
});

describe("los invitados de una reunión", () => {
  it("el equipo, los contactos del cliente con cargo y el resto con su correo", () => {
    const r = invitadosDeLaReunion(
      ["Ana@Smarteamcr.com", "luis@cliente.com", "x@otro.com", "luis@cliente.com"],
      new Map([["ana@smarteamcr.com", "Ana Pérez"]]),
      new Map([["luis@cliente.com", { nombre: "Luis Mora", cargo: "Gerente de ventas" }]]),
    );
    expect(r).toEqual([
      { email: "ana@smarteamcr.com", nombre: "Ana Pérez", cargo: null, lado: "smarteam" },
      { email: "luis@cliente.com", nombre: "Luis Mora", cargo: "Gerente de ventas", lado: "cliente" },
      { email: "x@otro.com", nombre: null, cargo: null, lado: "otro" },
    ]);
  });
});
