import { describe, it, expect } from "vitest";
import { phaseNamesLikelySameWork, fasesProbablementeRepetidas } from "./phase-identity";

describe("phaseNamesLikelySameWork", () => {
  // Los 3 pares reales de Wherex (2026-08) — el problema que esto existe para resolver.
  it("detecta los 3 pares duplicados reales de Wherex", () => {
    expect(phaseNamesLikelySameWork("Integraciones", "Desarrollo / Integración")).toBe(true);
    expect(phaseNamesLikelySameWork("Configuración Marketing Hub", "Marketing Hub")).toBe(true);
    expect(phaseNamesLikelySameWork("Capacitación y cierre Service", "Service Hub")).toBe(true);
  });

  // Los 2 negativos obligatorios: "Hub" es un token de 3 chars (queda afuera del umbral), y
  // "Sales"/"Service" no comparten prefijo — si esto matcheara, el sistema fusionaría fases
  // genuinamente distintas del mismo cronograma real.
  it("NO confunde fases genuinamente distintas que comparten una palabra corta ('Hub')", () => {
    expect(phaseNamesLikelySameWork("Sales Hub", "Service Hub")).toBe(false);
  });

  it("NO matchea fases sin ninguna relación", () => {
    expect(phaseNamesLikelySameWork("Semana 0", "Cierre y entrega")).toBe(false);
  });

  it("es case-insensitive y tolera acentos distintos", () => {
    expect(phaseNamesLikelySameWork("INTEGRACIONES", "desarrollo / integracion")).toBe(true);
  });

  it("nombre sin tokens útiles (todo corto) no matchea nada", () => {
    expect(phaseNamesLikelySameWork("QA", "Sales Hub")).toBe(false);
  });
});

describe("fasesProbablementeRepetidas — el aviso sobre las fases QUE YA EXISTEN", () => {
  const f = (id: string, name: string) => ({ id, name });

  it("los tres pares reales de Wherex se marcan, en las DOS filas de cada par", () => {
    const aviso = fasesProbablementeRepetidas([
      f("a", "Integraciones"),
      f("b", "Desarrollo / Integración"),
    ]);
    expect(aviso.get("a")).toBe("Desarrollo / Integración");
    expect(aviso.get("b")).toBe("Integraciones");
  });

  it("Sales Hub y Service Hub NO se marcan (el falso positivo que volvería ruido el aviso)", () => {
    const aviso = fasesProbablementeRepetidas([f("a", "Sales Hub"), f("b", "Service Hub")]);
    expect(aviso.size).toBe(0);
  });

  it("una lista sin repetidas no marca nada", () => {
    const aviso = fasesProbablementeRepetidas([
      f("a", "Kickoff"),
      f("b", "Relevamiento"),
      f("c", "Capacitación"),
    ]);
    expect(aviso.size).toBe(0);
  });

  it("cero y una fase no revientan", () => {
    expect(fasesProbablementeRepetidas([]).size).toBe(0);
    expect(fasesProbablementeRepetidas([f("a", "Integraciones")]).size).toBe(0);
  });
});
