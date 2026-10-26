/**
 * lib/planificacion/lo-de-afuera.test.ts — lo que la Planificación lee de afuera (2026-10-27): la cuenta de licencias
 * contra lo comprado en HubSpot y las fechas del Cronograma.
 */
import { describe, it, expect } from "vitest";
import { asientoDeLaLicencia, fechasDelCronograma, licenciasContraLoComprado } from "./brief";

describe("las licencias contra lo comprado", () => {
  it("reconoce el asiento de una licencia escrita a mano", () => {
    expect(asientoDeLaLicencia("Sales Hub Pro")).toBe("sales");
    expect(asientoDeLaLicencia("Servicio")).toBe("service");
    expect(asientoDeLaLicencia("Core seat")).toBe("core");
    expect(asientoDeLaLicencia("Sin licencia")).toBeNull();
    expect(asientoDeLaLicencia("")).toBeNull();
  });

  it("avisa solo si se planificaron más de los comprados", () => {
    const usuarios = [
      { nombre: "Ana", licencia: "Sales Hub Pro" },
      { nombre: "Luis", licencia: "Sales Hub Pro" },
      { nombre: "Marta", licencia: "Service Hub" },
      { nombre: "", correo: "", licencia: "Sales" }, // sin nombre ni correo: no cuenta
    ];
    const r = licenciasContraLoComprado(usuarios, { sales: { limit: 1 }, service: { limit: 3 }, core: { limit: null } });
    expect(r.filas).toEqual([
      { asiento: "Sales Hub", planificados: 2, comprados: 1 },
      { asiento: "Service Hub", planificados: 1, comprados: 3 },
    ]);
    expect(r.avisos).toEqual(["Planificaste 2 asientos de Sales Hub; en HubSpot hay 1 comprado."]);
    // Sin datos de HubSpot, no hay con qué comparar: no avisa.
    expect(licenciasContraLoComprado(usuarios, null).avisos).toEqual([]);
  });
});

describe("las fechas del Cronograma", () => {
  it("el cierre estimado es el arranque más las semanas", () => {
    expect(fechasDelCronograma({ arranqueISO: "2026-11-02", semanas: 8 })).toEqual({ inicio: "2026-11-02", cierre: "2026-12-28" });
    expect(fechasDelCronograma({ arranqueISO: "2026-11-02", semanas: null })).toEqual({ inicio: "2026-11-02", cierre: null });
    expect(fechasDelCronograma({ arranqueISO: null, semanas: 8 })).toEqual({ inicio: null, cierre: null });
  });
});
