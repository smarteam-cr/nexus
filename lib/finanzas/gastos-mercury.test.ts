/**
 * lib/finanzas/gastos-mercury.test.ts — los gastos de Nexus contra los cargos de Mercury (2026-10-06).
 *
 * Los casos salen de la copia real de Mercury del 2026-10-06 (tarjeta de herramientas).
 */
import { describe, expect, it } from "vitest";
import { cargoDeTarjeta, gastosContraMercury, parecido, type CargoDeTarjeta, type RecurrenteDeNexus } from "./gastos-mercury";

let n = 0;
const cargo = (comercio: string, fechaISO: string, monto: number, medio: CargoDeTarjeta["medio"] = "CREDITO"): CargoDeTarjeta => ({
  id: `c${++n}`,
  comercio,
  fechaISO,
  monto,
  medio,
});
const recurrente = (nombre: string, monto: number, p: Partial<RecurrenteDeNexus> = {}): RecurrenteDeNexus => ({
  id: nombre,
  nombre,
  categoria: "HERRAMIENTA",
  monto,
  moneda: "USD",
  frecuencia: "MENSUAL",
  ...p,
});

const HOY = "2026-10-06";
const CARGOS = [
  cargo("Hubspot", "2026-08-01", 766.92),
  cargo("Hubspot", "2026-09-01", 794.99),
  cargo("Hubspot", "2026-10-01", 281.86),
  cargo("Canva", "2026-08-03", 6.49),
  cargo("Canva", "2026-09-03", 6.49),
  cargo("Canva", "2026-10-03", 6.49),
  cargo("Adobe", "2026-08-13", 29.99),
  cargo("Adobe", "2026-09-13", 29.99),
  cargo("Anthropic", "2026-09-10", 315.53),
  cargo("Anthropic", "2026-10-02", 460.97),
  cargo("Mercury Technologies, Inc.", "2026-09-01", 35, "MERCURY"),
  cargo("Mercury Technologies, Inc.", "2026-10-01", 35, "MERCURY"),
  // Un viaje dos meses seguidos con la de débito NO es una suscripción.
  cargo("Airbnb", "2026-08-12", 1960.67, "DEBITO"),
  cargo("Airbnb", "2026-09-01", 134.57, "DEBITO"),
  cargo("Avianca", "2026-10-04", 577.16, "DEBITO"),
  cargo("LinkedIn", "2026-10-05", 110),
  cargo("OpenAI", "2026-07-16", 20),
];
const RECURRENTES = [
  recurrente("HubSpot", 535),
  recurrente("Canva", 6.49),
  recurrente("Claude (licencia Elías)", 200),
  recurrente("Mercury", 6),
  recurrente("Chat GPT", 20),
  recurrente("Atom Chat", 100),
  recurrente("Hostinger", 371.88, { frecuencia: "ANUAL" }),
  recurrente("Alquiler de Oficina", 200, { categoria: "FIJO_OPERACION" }),
];
const r = () => gastosContraMercury({ cargos: CARGOS, recurrentes: RECURRENTES, gastos: [], hoyISO: HOY, desde: "2026-10" });
const de = (comercio: string) => r().recurrentes.find((x) => x.comercio === comercio);

describe("qué cargo cuenta", () => {
  it("salidas de tarjeta o la suscripción de Mercury; ni transferencias, ni entradas, ni fallidos", () => {
    const base = { id: "m", contraparteNombre: "Miro", fechaISO: HOY, estado: "sent" };
    expect(cargoDeTarjeta({ ...base, monto: -91.89, tipo: "creditCardTransaction" })).toMatchObject({ monto: 91.89, medio: "CREDITO" });
    expect(cargoDeTarjeta({ ...base, monto: -5000, tipo: "outgoingPayment" })).toBeNull();
    expect(cargoDeTarjeta({ ...base, monto: -10, tipo: "internalTransfer" })).toBeNull();
    expect(cargoDeTarjeta({ ...base, monto: 10, tipo: "creditCardTransaction" })).toBeNull();
    expect(cargoDeTarjeta({ ...base, monto: -10, tipo: "creditCardTransaction", estado: "failed" })).toBeNull();
    expect(cargoDeTarjeta({ ...base, contraparteNombre: null, monto: -35, tipo: "billingEngineSubscriptionFee" })?.comercio).toBe("Mercury");
  });
});

describe("los nombres", () => {
  it("el mismo nombre, uno dentro del otro, o un alias conocido", () => {
    expect(parecido("HubSpot", "Hubspot")).toBe(3);
    expect(parecido("SUPA BASE", "Supabase")).toBe(3);
    expect(parecido("Claude (licencia Elías)", "Anthropic")).toBe(3);
    expect(parecido("Chat GPT", "OpenAI")).toBe(3);
    expect(parecido("AWS", "Amazon Web Services")).toBe(3);
    expect(parecido("Mercury", "Mercury Technologies, Inc.")).toBe(2);
    expect(parecido("Userback.io", "Userback")).toBe(2);
    expect(parecido("Atom Chat", "Hubspot")).toBe(0);
  });
});

describe("lo que la tarjeta cobra todos los meses", () => {
  it("con su recurrente de Nexus, y el precio del último mes COMPLETO (octubre todavía no cerró)", () => {
    expect(de("Hubspot")).toMatchObject({ estado: "PRECIO_DISTINTO", precio: 794.99, enNexus: { nombre: "HubSpot", monto: 535 } });
    expect(de("Canva")).toMatchObject({ estado: "AL_DIA" });
    expect(de("Anthropic")).toMatchObject({ estado: "PRECIO_DISTINTO", enNexus: { nombre: "Claude (licencia Elías)" } });
    expect(de("Mercury Technologies, Inc.")).toMatchObject({ estado: "PRECIO_DISTINTO", medio: "MERCURY", precio: 35 });
  });

  it("lo que Nexus no tiene sale primero, como «sin registrar»", () => {
    expect(r().recurrentes[0]).toMatchObject({ comercio: "Adobe", estado: "SIN_REGISTRAR" });
  });

  it("un cargo de un solo mes no es recurrente, y la tarjeta de débito nunca", () => {
    expect(de("LinkedIn")).toBeUndefined();
    expect(de("Airbnb")).toBeUndefined();
  });

  it("los tres meses van del más viejo al de hoy, con 0 donde no cobró", () => {
    expect(de("Adobe")!.meses).toEqual([
      { periodo: "2026-08", monto: 29.99 },
      { periodo: "2026-09", monto: 29.99 },
      { periodo: "2026-10", monto: 0 },
    ]);
  });
});

describe("lo que Nexus tiene y la tarjeta no cobra", () => {
  it("herramientas mensuales en dólares sin cargo en 60 días; ni las anuales ni los fijos", () => {
    expect(r().nexusSinCargo.map((x) => x.nombre)).toEqual(["Atom Chat", "Chat GPT"]);
  });
});

describe("desde octubre: cargos sueltos contra gastos", () => {
  it("un cargo suelto sin su gasto aparece; con el gasto (±5 días, mismo monto) no", () => {
    expect(r().sueltosSinRegistrar.map((c) => c.comercio)).toEqual(["Avianca", "LinkedIn"]);
    const conGasto = gastosContraMercury({
      cargos: CARGOS,
      recurrentes: RECURRENTES,
      gastos: [{ id: "g1", nombre: "Pasaje a Guatemala", monto: 577.16, moneda: "USD", fechaISO: "2026-10-02" }],
      hoyISO: HOY,
      desde: "2026-10",
    });
    expect(conGasto.sueltosSinRegistrar.map((c) => c.comercio)).toEqual(["LinkedIn"]);
    expect(conGasto.gastosSinCargo).toEqual([]);
  });

  it("un gasto en dólares sin cargo aparece; uno en colones solo se cuenta", () => {
    const x = gastosContraMercury({
      cargos: [],
      recurrentes: [],
      gastos: [
        { id: "g1", nombre: "Almuerzo con cliente", monto: 48, moneda: "USD", fechaISO: "2026-10-03" },
        { id: "g2", nombre: "Parqueo", monto: 3000, moneda: "CRC", fechaISO: "2026-10-03" },
        { id: "g3", nombre: "De septiembre (del Excel)", monto: 10, moneda: "USD", fechaISO: "2026-09-20" },
      ],
      hoyISO: HOY,
      desde: "2026-10",
    });
    expect(x.gastosSinCargo.map((g) => g.id)).toEqual(["g1"]);
    expect(x.gastosEnColones).toBe(1);
  });
});
