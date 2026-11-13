import { describe, expect, it } from "vitest";
import { DIAS_DE_MORA_PARA_DESACTIVAR, conectoresEnMora, esperanDecision, situacionDelConector, type ConectorParaMora } from "./conectores-en-mora";
import { DIAS_DE_DEUDA_GRAVE } from "@/lib/cs/cartera-reglas";

const conector = (p: Partial<ConectorParaMora> = {}): ConectorParaMora => ({
  servicioId: "s1",
  cuentaId: "k1",
  clienteNombre: "Iberorutas",
  descripcion: "Hub & SAP",
  tipoServicio: "CONECTOR",
  estado: "ACTIVO",
  creditoDias: null,
  desactivacionConfirmadaPor: null,
  desactivacionConfirmadaEn: null,
  cobros: [{ estado: "POR_COBRAR", fechaEmision: "2026-07-30", promesaPago: null }],
  ...p,
});

describe("conectores en mora (punto 14, 2026-11-13)", () => {
  it("el plazo es el de la deuda grave de la cartera: 30 días después de vencer", () => {
    expect(DIAS_DE_MORA_PARA_DESACTIVAR).toBe(DIAS_DE_DEUDA_GRAVE);
  });

  it("⭐ facturado el 1-sep vence el 16-sep: el 16-oct (30 días) todavía no; el 17-oct se propone desactivar", () => {
    const c = conector({ cobros: [{ estado: "POR_COBRAR", fechaEmision: "2026-09-01", promesaPago: null }] });
    expect(situacionDelConector(c, "2026-10-16")).toBeNull();
    expect(situacionDelConector(c, "2026-10-17")).toEqual({ clave: "proponer-desactivar", diasDeMora: 31, cuotas: 1 });
  });

  it("Iberorutas (facturado el 30-jul, sin pagar): Nexus propone, no desactiva", () => {
    expect(situacionDelConector(conector(), "2026-11-13")?.clave).toBe("proponer-desactivar");
  });

  it("una promesa de pago vigente frena la propuesta hasta su fecha", () => {
    const c = conector({ cobros: [{ estado: "POR_COBRAR", fechaEmision: "2026-07-30", promesaPago: "2026-11-20" }] });
    expect(situacionDelConector(c, "2026-11-13")).toMatchObject({ clave: "con-promesa", promesa: "2026-11-20" });
    expect(situacionDelConector(c, "2026-11-21")?.clave).toBe("proponer-desactivar");
  });

  it("confirmado: queda desactivado con quién y cuándo; si paga, Nexus propone reactivarlo", () => {
    const desactivado = conector({ desactivacionConfirmadaPor: "mzamora@smarteamcr.com", desactivacionConfirmadaEn: "2026-11-13T15:00:00.000Z" });
    expect(situacionDelConector(desactivado, "2026-11-14")).toMatchObject({ clave: "desactivado", por: "mzamora@smarteamcr.com" });
    const pago = { ...desactivado, cobros: [{ estado: "COBRADO", fechaEmision: "2026-07-30", promesaPago: null }] };
    expect(situacionDelConector(pago, "2026-11-20")?.clave).toBe("proponer-reactivar");
  });

  it("solo conectores activos; al día, nada", () => {
    expect(situacionDelConector(conector({ tipoServicio: "SOPORTE" }), "2026-11-13")).toBeNull();
    expect(situacionDelConector(conector({ estado: "PAUSADO" }), "2026-11-13")).toBeNull();
    expect(situacionDelConector(conector({ cobros: [] }), "2026-11-13")).toBeNull();
  });

  it("la lista: lo que pide una decisión primero, y solo eso espera a una persona", () => {
    const xs = conectoresEnMora(
      [
        conector({ servicioId: "a", clienteNombre: "B", desactivacionConfirmadaPor: "x@y.com", desactivacionConfirmadaEn: "2026-11-01T00:00:00Z" }),
        conector({ servicioId: "b", clienteNombre: "A" }),
        conector({ servicioId: "c", cobros: [] }),
      ],
      "2026-11-13",
    );
    expect(xs.map((x) => x.servicioId)).toEqual(["b", "a"]);
    expect(esperanDecision(xs).map((x) => x.servicioId)).toEqual(["b"]);
  });
});
