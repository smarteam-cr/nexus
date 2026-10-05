import { describe, expect, it } from "vitest";
import { idDeReporteDePipeline, reportesDeLaFoto } from "./reportes";
import { fotoDePrueba, inventarioDePrueba } from "./__fixtures__/foto";

/**
 * lib/auditoria-portal/reportes.test.ts — CADA REPORTE DE LA PANTALLA TIENE UN ID, Y SOLO SI HAY DATOS.
 * El análisis escribe una lectura por id: un reporte sin datos no se le pide (interpretaría un hueco).
 */

const ids = (f = fotoDePrueba()) => reportesDeLaFoto(f).map((r) => r.id);

describe("reportesDeLaFoto", () => {
  it("una foto completa trae un reporte por gráfico o tabla, uno por pipeline", () => {
    const r = ids();
    expect(r).toEqual(
      expect.arrayContaining([
        "portal.hoy",
        "portal.configuracion",
        "ciclo.contactos",
        "ciclo.embudo",
        "ciclo.empresas",
        "ciclo.workflows",
        "propietarios.asignacion",
        "propietarios.reparto",
        "propietarios.doce_meses",
        "propiedades.por_objeto",
        "propiedades.creadores",
        idDeReporteDePipeline("p1"),
        idDeReporteDePipeline("p2"),
        idDeReporteDePipeline("p3"),
        "workflows.panorama",
        "workflows.disparadores",
        "workflows.choques",
        "usuarios.acceso",
        "usuarios.dominios",
      ]),
    );
    expect(new Set(r).size).toBe(r.length);
  });

  it("sin la Planificación del cliente no hay reporte de comparación; con ella, sí", () => {
    expect(ids()).not.toContain("pipelines.planificacion");
    const conCliente = fotoDePrueba({ contextoDelCliente: { fuentes: [{ documento: "Planificación", proyecto: "Implementación" }], pipelinesPlaneados: [{ nombre: "Ventas", tipo: "ventas", etapas: ["Nuevo"] }], texto: "…" } });
    expect(ids(conCliente)).toContain("pipelines.planificacion");
  });

  it("lo que no se pudo leer no tiene reporte", () => {
    const inv = { ...inventarioDePrueba(), pipelines: null, workflows: null, equipos: null };
    const r = ids(fotoDePrueba({ inventario: inv }));
    expect(r.some((x) => x.startsWith("pipeline.") || x.startsWith("workflows."))).toBe(false);
    expect(r).not.toContain("usuarios.equipos");
    expect(r).not.toContain("ciclo.workflows");
  });

  it("los reportes de cruces solo aparecen si el cruce encontró algo", () => {
    // El fixture no tiene cadenas, avisos ni workflows con versiones.
    const r = ids();
    expect(r).not.toContain("workflows.cadenas");
    expect(r).not.toContain("workflows.avisos");
    expect(r).not.toContain("workflows.mas_editados");
  });
});
