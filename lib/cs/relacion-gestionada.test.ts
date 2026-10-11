import { describe, expect, it } from "vitest";
import { pideTrabajoEnElPortal, relacionConHubspot } from "./relacion-gestionada";

const HOY = "2026-10-09";
const base = {
  activa: true,
  gestionada: false,
  vendida: true,
  portalBorrado: false,
  relacionGestionadaVence: null as string | null,
  relacionGestionadaTermino: null as string | null,
  ultimaActividadDeSmarteam: null as string | null,
  ultimoQueTrabajo: null as string | null,
};

describe("relacionConHubspot", () => {
  it("sin HubSpot Partner no hay nada que hacer", () => {
    const r = relacionConHubspot(null, HOY);
    expect(r.estado).toBe("sin-partner");
    expect(r.queHacer).toBeNull();
  });

  it("gestionada con vencimiento lejano: al día, en verde", () => {
    const r = relacionConHubspot({ ...base, gestionada: true, relacionGestionadaVence: "2026-12-07" }, HOY);
    expect(r.estado).toBe("gestionada");
    expect(r.tono).toBe("verde");
    expect(r.queHacer).toBeNull();
    expect(r.diasParaVencer).toBe(59);
  });

  it("vence en 30 días o menos: por vencer, con qué hacer y antes de cuándo", () => {
    const r = relacionConHubspot({ ...base, gestionada: true, relacionGestionadaVence: "2026-11-03" }, HOY);
    expect(r.estado).toBe("por-vencer");
    expect(r.corto).toBe("Vence en 25 días");
    expect(r.queHacer).toContain("cree o edite algo en su portal");
    expect(pideTrabajoEnElPortal(r)).toBe(false);
  });

  it("vence en 14 días o menos: urgente, y le llega al CSE", () => {
    const r = relacionConHubspot(
      { ...base, gestionada: true, relacionGestionadaVence: "2026-10-23", ultimaActividadDeSmarteam: "2026-08-24T15:00:00Z", ultimoQueTrabajo: "Ana" },
      HOY,
    );
    expect(r.estado).toBe("urgente");
    expect(r.porque).toContain("(Ana)");
    expect(pideTrabajoEnElPortal(r)).toBe(true);
  });

  it("terminada en una cuenta activa: se recupera trabajando en el portal", () => {
    const r = relacionConHubspot({ ...base, relacionGestionadaTermino: "2026-09-27" }, HOY);
    expect(r.estado).toBe("terminada");
    expect(r.diasDesdeQueTermino).toBe(12);
    expect(r.queHacer).toContain("vuelve a empezar");
    expect(r.tono).toBe("ambar");
    expect(pideTrabajoEnElPortal(r)).toBe(true);
  });

  it("terminada hace mucho, o con la cuenta inactiva: no pide nada", () => {
    expect(pideTrabajoEnElPortal(relacionConHubspot({ ...base, relacionGestionadaTermino: "2026-05-01" }, HOY))).toBe(false);
    const inactiva = relacionConHubspot({ ...base, activa: false, relacionGestionadaTermino: "2026-10-01" }, HOY);
    expect(inactiva.queHacer).toBeNull();
    expect(inactiva.tono).toBe("gris");
  });

  it("solo vendida: HubSpot no comparte el uso", () => {
    const r = relacionConHubspot(base, HOY);
    expect(r.estado).toBe("vendida");
    expect(r.porque).toContain("no comparte su uso");
  });
});
