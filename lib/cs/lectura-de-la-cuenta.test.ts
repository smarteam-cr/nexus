/**
 * lib/cs/lectura-de-la-cuenta.test.ts — cómo está una cuenta: el color y hasta tres motivos (2026-10-16, fase 1.2 de
 * docs/nexus-sistema-de-trabajo-plan.md).
 */
import { describe, expect, it } from "vitest";
import type { AlertaDeCuenta, SaludConPorque } from "./cartera-reglas";
import { lecturaDeLaCuenta, MAX_MOTIVOS, pideAtencion } from "./lectura-de-la-cuenta";

const alerta = (o: Partial<AlertaDeCuenta> & { id: string }): AlertaDeCuenta => ({
  severidad: "MEDIUM",
  categoria: "ADOPTION_RISK",
  titulo: `Alerta ${o.id}`,
  razon: "Porque sí.",
  accion: null,
  proyecto: null,
  estado: "OPEN",
  delAgente: true,
  detectadaEn: "2026-10-10T12:00:00.000Z",
  cita: null,
  ...o,
});

const rojo: SaludConPorque = {
  salud: "en-riesgo",
  porque: "«Implementación» está bloqueado.",
  razones: [
    { clave: "bloqueado", texto: "«Implementación» está bloqueado.", roja: true },
    { clave: "uso", texto: "Uso bajo: 30 de 100" },
  ],
};

describe("⭐ primero lo que pinta el color, después lo que vio el vigía", () => {
  it("las razones van primero y en su orden; después las alertas, la más grave y la más reciente primero", () => {
    const l = lecturaDeLaCuenta(rojo, [
      alerta({ id: "a", categoria: "CHURN_RISK", severidad: "MEDIUM", detectadaEn: "2026-10-12T00:00:00Z" }),
      alerta({ id: "b", categoria: "SUPPORT_TICKETS", severidad: "HIGH", detectadaEn: "2026-10-01T00:00:00Z" }),
    ]);
    expect(l.motivos.map((m) => m.texto)).toEqual(["«Implementación» está bloqueado.", "Uso bajo: 30 de 100", "Alerta b"]);
    expect(l.motivos[0].roja).toBe(true);
    expect(l.mas).toBe(1);
  });

  it("como mucho tres; el resto se cuenta", () => {
    const l = lecturaDeLaCuenta({ salud: "sin-datos", porque: "", razones: [] }, ["a", "b", "c", "d", "e"].map((id) => alerta({ id, categoria: "CHURN_RISK" })));
    expect(l.motivos).toHaveLength(MAX_MOTIVOS);
    expect(l.mas).toBe(2);
  });

  it("una alerta que una razón ya dice no se repite", () => {
    const l = lecturaDeLaCuenta(rojo, [alerta({ id: "uso", categoria: "ADOPTION_RISK" }), alerta({ id: "bloq", categoria: "PROJECT_BLOCKED" })]);
    expect(l.motivos.map((m) => m.alertaId).filter(Boolean)).toEqual([]);
  });

  it("una queja o un retraso con la frase verificada ya es una razón del color", () => {
    const conFrase = alerta({ id: "q", categoria: "QUEJA", cita: { texto: "No nos responden", fuente: "reunion", id: "s1", fecha: null, titulo: null } });
    expect(lecturaDeLaCuenta({ salud: "saludable", porque: "", razones: [] }, [conFrase]).motivos).toEqual([]);
  });

  it("el mismo texto se dice una vez (los avisos de renovación por hub, antes de juntarse)", () => {
    const igual = { categoria: "RENEWAL_RISK", titulo: "Renovación en 88 días · Aditec JCB" };
    const l = lecturaDeLaCuenta({ salud: "en-friccion", porque: "", razones: [] }, [alerta({ id: "h1", ...igual }), alerta({ id: "h2", ...igual })]);
    expect(l.motivos.map((m) => m.texto)).toEqual(["Renovación en 88 días · Aditec JCB"]);
    expect(l.mas).toBe(0);
  });

  it("las sugerencias del vigía no son motivos del color: se cuentan aparte", () => {
    const l = lecturaDeLaCuenta({ salud: "saludable", porque: "Va bien", razones: [] }, [
      alerta({ id: "op", categoria: "EXPANSION_OPPORTUNITY" }),
      alerta({ id: "pa", categoria: "PROACTIVE_ACTION" }),
    ]);
    expect(l.motivos).toEqual([]);
    expect(l.sugerencias).toBe(2);
  });
});

describe("⛔ para el CSE, nada que hable de plata", () => {
  it("una alerta sobre facturas no le llega; una razón con monto en el detalle pierde el detalle", () => {
    const l = lecturaDeLaCuenta(
      { salud: "en-friccion", porque: "", razones: [] },
      [
        alerta({ id: "fac", categoria: "CHURN_RISK", titulo: "Facturas vencidas hace 40 días" }),
        alerta({ id: "ren", categoria: "RENEWAL_RISK", titulo: "Renovación en 40 días · Wherex", razon: "Sales Hub renueva · 6.520 USD al mes" }),
      ],
      { sinPlata: true },
    );
    expect(l.motivos.map((m) => m.alertaId)).toEqual(["ren"]);
    expect(l.motivos[0].detalle).toBeNull();
  });

  it("el porqué se arma con las razones que ve: sin la que trae un monto", () => {
    const conMonto: SaludConPorque = {
      salud: "en-riesgo",
      porque: "Facturas vencidas por US$4.000 · y 1 señal más.",
      razones: [
        { clave: "cancelacion", texto: "Facturas vencidas por US$4.000.", roja: true },
        { clave: "uso", texto: "Uso bajo: 30 de 100" },
      ],
    };
    expect(lecturaDeLaCuenta(conMonto, [], { sinPlata: true }).porque).toBe("Uso bajo: 30 de 100.");
    expect(lecturaDeLaCuenta(conMonto, []).porque).toBe(conMonto.porque);
    const soloMonto = { ...conMonto, razones: [conMonto.razones[0]] };
    expect(lecturaDeLaCuenta(soloMonto, [], { sinPlata: true }).porque).not.toMatch(/US\$/);
  });

  it("la nota de la corrección que habla de plata no se dice; la que no, sí", () => {
    const corr = { id: "c", salud: "en-riesgo" as const, porEmail: "avanegas@smarteamcr.com", porNombre: "Alex Vanegas", en: "", vence: "2026-11-01", saludDeNexus: null, razonesDeNexus: [] };
    const base: SaludConPorque = {
      salud: "en-riesgo",
      porque: "Corregido por Alex: debe US$9.000 de comisión. Nexus diría: va bien.",
      razones: [],
      nexus: { salud: "saludable", porque: "Va bien." },
      correccion: { ...corr, nota: "Debe US$9.000 de comisión" },
    };
    expect(lecturaDeLaCuenta(base, [], { sinPlata: true }).porque).toBe("Corregido por Alex. Nexus diría: va bien.");
    const limpia = { ...base, porque: "Corregido por Alex: no contesta. Nexus diría: va bien.", correccion: { ...corr, nota: "No contesta" } };
    expect(lecturaDeLaCuenta(limpia, [], { sinPlata: true }).porque).toBe(limpia.porque);
  });
});

describe("pide atención hoy solo en rojo", () => {
  it("rojo sí; amarillo, gris y verde no", () => {
    expect(pideAtencion({ salud: "en-riesgo" })).toBe(true);
    for (const s of ["en-friccion", "en-espera", "saludable", "sin-datos"] as const) expect(pideAtencion({ salud: s })).toBe(false);
  });
});
