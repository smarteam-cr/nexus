/**
 * lib/servicios/kickoff-del-servicio.test.ts — el kickoff que sabe que es SmartLoop (M1 del roadmap, 2026-10-24/25).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { servicioDelCatalogo, servicioParaElKickoff } from "./catalogo";
import { tipoDeServicioDelEspejo, tipoQueContradiceAlPipeline } from "./tipo-de-servicio";

const SMARTLOOP_PIPELINE = "942509592";
const CS_PIPELINE = "826270797";

describe("el kickoff lee el servicio (etapa 1)", () => {
  const smartloop = servicioDelCatalogo("smartloop")!;

  it("el bloque dice que es recurrente, la cadencia, las reuniones fijas, el ciclo y el nivel de servicio", () => {
    const b = servicioParaElKickoff(smartloop, { numero: 1, etapa: "Diagnóstico" });
    expect(b).toMatch(/servicio RECURRENTE, no un proyecto temporal/);
    expect(b).toContain(smartloop.cadencia);
    expect(b).toContain("Seguimiento semanal del ciclo");
    expect(b).toMatch(/Se trabaja por CICLOS/);
    expect(b).toMatch(/explorando con cada equipo del cliente/);
    expect(b).toContain("ciclo 1, etapa Diagnóstico");
    expect(b).toContain("Crítica: 4 h");
  });

  it("un servicio sin ciclos no habla de ciclos", () => {
    const b = servicioParaElKickoff(servicioDelCatalogo("sitio-web")!);
    expect(b).not.toMatch(/CICLOS/);
  });

  it("el runner del kickoff ya no le dice el `serviceType` a un recurrente", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/canvas/kickoff-generate.ts"), "utf8");
    expect(src).toContain("const serviceTypeLabel = servicio ? null");
    expect(src).toContain("servicioParaElKickoff(");
  });
});

describe("el tipo de servicio de un proyecto de SmartLoop (etapa 4)", () => {
  it("en el pipeline de SmartLoop, «proyecto_temporal» queda vacío; un tipo de catálogo se respeta", () => {
    expect(tipoDeServicioDelEspejo("proyecto_temporal", SMARTLOOP_PIPELINE)).toBeNull();
    expect(tipoDeServicioDelEspejo("loop_sales", SMARTLOOP_PIPELINE)).toBe("loop_sales");
  });

  it("fuera de un pipeline recurrente, nada cambia", () => {
    expect(tipoDeServicioDelEspejo("proyecto_temporal", CS_PIPELINE)).toBe("proyecto_temporal");
    expect(tipoDeServicioDelEspejo("proyecto_temporal", null)).toBe("proyecto_temporal");
  });

  it("la contradicción que lista el script y vigila INV55", () => {
    expect(tipoQueContradiceAlPipeline({ serviceType: "proyecto_temporal", hubspotPipelineId: SMARTLOOP_PIPELINE })).toBe(true);
    expect(tipoQueContradiceAlPipeline({ serviceType: null, hubspotPipelineId: SMARTLOOP_PIPELINE })).toBe(false);
    expect(tipoQueContradiceAlPipeline({ serviceType: "proyecto_temporal", hubspotPipelineId: CS_PIPELINE })).toBe(false);
  });

  it("el espejo de HubSpot usa la regla (no la repite)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/hubspot/sync-projects.ts"), "utf8");
    expect(src).toContain("tipoDeServicioDelEspejo(deducido.serviceType, pipelineId)");
  });
});
