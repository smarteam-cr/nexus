import { describe, it, expect } from "vitest";
import { phaseNamesLikelySameWork, findBestOrphanMatch } from "./phase-identity";

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

describe("findBestOrphanMatch", () => {
  it("sin huérfanas → null", () => {
    expect(findBestOrphanMatch("Integraciones", [])).toBeNull();
  });

  it("una huérfana que matchea → la devuelve", () => {
    const orphans = [{ id: "e1", name: "Desarrollo / Integración" }];
    expect(findBestOrphanMatch("Integraciones", orphans)).toEqual(orphans[0]);
  });

  it("ninguna huérfana matchea → null", () => {
    const orphans = [{ id: "e1", name: "Sales Hub" }];
    expect(findBestOrphanMatch("Service Hub", orphans)).toBeNull();
  });

  it("empate de puntaje → gana la primera del array (determinístico)", () => {
    // "Revisión Circle" comparte exactamente 1 token con cada huérfana (ambas vía "circle") —
    // empate genuino, ninguna gana por mayor puntaje.
    const tied = [
      { id: "a", name: "Circle Integración" },
      { id: "b", name: "Otra sesión de Circle" },
    ];
    expect(findBestOrphanMatch("Revisión Circle", tied)).toEqual(tied[0]);
  });

  it("mayor puntaje gana sobre un match parcial", () => {
    const orphans = [
      { id: "e1", name: "Marketing Hub" },
      { id: "e2", name: "Configuración Marketing" },
    ];
    expect(findBestOrphanMatch("Configuración Marketing Hub", orphans)).toEqual(orphans[1]);
  });
});
