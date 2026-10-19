import { describe, expect, it } from "vitest";
import { problemasDeLicencia, type LicenciaDeContrato } from "./licencias";
import { datosDelFormulario, FORMULARIO_VACIO, formularioDeContrato } from "./licencias-formulario";

/** El contrato de kölbi en dólares, como está en la base el 2026-10-19 (sin costo cargado). */
const KOLBI: LicenciaDeContrato = {
  id: "licencia-kolbi-usd",
  cuentaId: "cuenta-kolbi",
  cuentaNombre: "kölbi",
  moneda: "USD",
  montoContrato: 161700,
  montoServicio: 26700,
  proveedor: "HubSpot",
  costoMonto: null,
  costoMoneda: null,
  costoCadaMeses: null,
  desde: null,
  hasta: null,
  fuente: "kölbi, Anexo 1.0, p. 17",
  notas: "Licencias HubSpot + Infobip US$135.000.",
};

describe("el formulario de un contrato con licencias", () => {
  it("abrir y guardar sin tocar nada deja el contrato igual y sin costo", () => {
    const d = datosDelFormulario(formularioDeContrato(KOLBI));
    expect(problemasDeLicencia(d)).toEqual([]);
    expect(d).toMatchObject({ montoContrato: 161700, montoServicio: 26700, costoMonto: null, costoMoneda: null, costoCadaMeses: null });
  });

  it("prueba 33: escribir solo «70.000» en «Lo que se le paga» se puede guardar, en la moneda del contrato y cada mes", () => {
    const f = { ...formularioDeContrato(KOLBI), costoMonto: "70.000" };
    const d = datosDelFormulario(f);
    expect(problemasDeLicencia(d)).toEqual([]);
    expect(d).toMatchObject({ costoMonto: 70000, costoMoneda: "USD", costoCadaMeses: 1 });
  });

  it("la moneda y la frecuencia elegidas se respetan", () => {
    const d = datosDelFormulario({ ...formularioDeContrato(KOLBI), costoMonto: "1.500.000", costoMoneda: "CRC", costoCadaMeses: "12" });
    expect(d).toMatchObject({ costoMonto: 1500000, costoMoneda: "CRC", costoCadaMeses: 12 });
  });

  it("un costo guardado vuelve tal cual: la moneda igual a la del contrato se ve como «la del contrato»", () => {
    const conCosto = { ...KOLBI, costoMonto: 9000, costoMoneda: "USD", costoCadaMeses: 3 };
    const f = formularioDeContrato(conCosto);
    expect(f).toMatchObject({ costoMonto: "9000", costoMoneda: "", costoCadaMeses: "3" });
    expect(datosDelFormulario(f)).toMatchObject({ costoMonto: 9000, costoMoneda: "USD", costoCadaMeses: 3 });
  });

  it("un monto que no es un número no se guarda como cero", () => {
    const d = datosDelFormulario({ ...formularioDeContrato(KOLBI), costoMonto: "mucho" });
    expect(problemasDeLicencia(d)).toContain("Lo que se le paga no es un número.");
  });

  it("un contrato nuevo sin costo no manda moneda ni frecuencia", () => {
    const d = datosDelFormulario({ ...FORMULARIO_VACIO, cuentaId: "c", montoContrato: "1000", montoServicio: "300", fuente: "anexo" });
    expect(problemasDeLicencia(d)).toEqual([]);
    expect(d).toMatchObject({ costoMonto: null, costoMoneda: null, costoCadaMeses: null });
  });
});
