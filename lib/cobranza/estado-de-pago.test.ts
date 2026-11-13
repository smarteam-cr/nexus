import { describe, expect, it } from "vitest";
import { estadoDePago, primeraCuota, primeraCuotaVencida, serviciosDelProyecto, textoDelEstado, type ServicioParaEstado } from "./estado-de-pago";
import { DEFAULT_CREDITO_DIAS } from "./engine";

const servicio = (p: Partial<ServicioParaEstado> = {}): ServicioParaEstado => ({
  id: "s1",
  nombre: "Implementación",
  projectId: "p1",
  estado: "ACTIVO",
  creditoDias: null,
  cobros: [],
  ...p,
});

const cuota = (numCuota: number, p: Partial<ServicioParaEstado["cobros"][number]> = {}) => ({
  numCuota,
  estado: "POR_COBRAR",
  fechaProgramada: `2026-${String(9 + numCuota).padStart(2, "0")}-01`,
  fechaEmision: `2026-${String(9 + numCuota).padStart(2, "0")}-01`,
  fechaCobro: null,
  ...p,
});

describe("la regla de los 15 días (punto 13, 2026-11-13)", () => {
  it("los 15 días son el crédito estándar de Cobranza, no una vara nueva", () => {
    expect(DEFAULT_CREDITO_DIAS).toBe(15);
  });

  it("⭐ facturada el 1-oct: el día 16 todavía está en plazo; el 17 ya avisa (vence el 16)", () => {
    const s = servicio({ cobros: [cuota(1, { fechaProgramada: "2026-10-01", fechaEmision: "2026-10-01" })] });
    expect(primeraCuotaVencida(s, "2026-10-16")).toBeNull();
    expect(primeraCuotaVencida(s, "2026-10-17")).toBe(1);
  });

  it("sin factura no cuenta: el atraso es nuestro, no del cliente", () => {
    const s = servicio({ cobros: [cuota(1, { fechaEmision: null, fechaProgramada: "2026-08-01" })] });
    expect(primeraCuotaVencida(s, "2026-11-13")).toBeNull();
  });

  it("pagada, no avisa; una cuenta con más crédito usa el suyo", () => {
    expect(primeraCuotaVencida(servicio({ cobros: [cuota(1, { estado: "COBRADO", fechaCobro: "2026-10-05" })] }), "2026-11-13")).toBeNull();
    const conCredito = servicio({ creditoDias: 30, cobros: [cuota(1, { fechaEmision: "2026-10-01" })] });
    expect(primeraCuotaVencida(conCredito, "2026-10-20")).toBeNull();
    expect(primeraCuotaVencida(conCredito, "2026-11-01")).toBe(1);
  });

  it("la primera es la de menor número, aunque llegue en otro orden", () => {
    expect(primeraCuota([cuota(3), cuota(1), cuota(2)])?.numCuota).toBe(1);
    expect(primeraCuota([])).toBeNull();
  });

  it("Construtecho: la primera cuota de marzo sigue sin pagarse → «primera-sin-pagar»", () => {
    const s = servicio({
      nombre: "Construtecho I Guatemala",
      projectId: null,
      cobros: [cuota(1, { fechaProgramada: "2026-03-15", fechaEmision: "2026-03-15" }), cuota(2, { fechaProgramada: "2026-04-15", fechaEmision: "2026-04-15" })],
    });
    const e = estadoDePago([s], "2026-11-13");
    expect(e).toMatchObject({ clave: "primera-sin-pagar", servicio: "Construtecho I Guatemala", cuotas: 2 });
  });

  it("vencida que no es la primera → «vencido»; todo pagado → al día; sin cobros → sin cobranza", () => {
    const vencida = servicio({ cobros: [cuota(1, { estado: "COBRADO", fechaCobro: "2026-10-10" }), cuota(2, { fechaEmision: "2026-10-01" })] });
    expect(estadoDePago([vencida], "2026-11-13").clave).toBe("vencido");
    const alDia = servicio({ cobros: [cuota(1, { estado: "COBRADO", fechaCobro: "2026-10-10" })] });
    expect(estadoDePago([alDia], "2026-11-13")).toEqual({ clave: "al-dia", ultimoPago: "2026-10-10" });
    expect(estadoDePago([servicio()], "2026-11-13")).toEqual({ clave: "sin-cobranza" });
  });

  it("un proyecto cuenta sus servicios y los de la cuenta sin proyecto; no los de otro proyecto ni los finalizados", () => {
    const xs = [
      servicio({ id: "a", projectId: "p1" }),
      servicio({ id: "b", projectId: null }),
      servicio({ id: "c", projectId: "p2" }),
      servicio({ id: "d", projectId: "p1", estado: "FINALIZADO" }),
    ];
    expect(serviciosDelProyecto("p1", xs).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("⛔ los textos no hablan de plata (los lee el CSE)", () => {
    for (const e of [
      { clave: "al-dia", ultimoPago: null },
      { clave: "vencido", cuotas: 2, diasMax: 40 },
      { clave: "primera-sin-pagar", servicio: "X", dias: 3, cuotas: 1, diasMax: 3 },
    ] as const) {
      const t = textoDelEstado(e)!;
      expect(`${t.titulo} ${t.detalle ?? ""}`).not.toMatch(/\$|US\$|₡|\d+[.,]\d{2}/);
    }
    expect(textoDelEstado({ clave: "sin-cobranza" })).toBeNull();
    expect(textoDelEstado({ clave: "primera-sin-pagar", servicio: "X", dias: 3, cuotas: 1, diasMax: 3 })?.detalle).toMatch(/pausar/);
  });
});
