/**
 * lib/ui/breadcrumbs.test.ts — el crumb de módulo depende del ORDEN de APP_NAV.
 *
 * `moduleCrumb` devuelve el PRIMER ítem cuyo `match`/`href` sea prefijo del
 * pathname. Ese "primero" es un contrato implícito del array: reordenar entradas
 * —o agregar una con un `match` que solape a otra— cambia los breadcrumbs de un
 * módulo entero sin que nada avise. Estos casos lo hacen explícito.
 */
import { describe, it, expect } from "vitest";
import { moduleCrumb } from "./breadcrumbs";

describe("moduleCrumb", () => {
  it("las rutas de Finanzas resuelven a Finanzas (los dos prefijos del match)", () => {
    // El grupo declara match ["/cobranza", "/finanzas"]: ambos lados del menú
    // tienen que caer en el mismo módulo o las migas se contradicen entre hojas.
    for (const p of [
      "/cobranza",
      "/cobranza/importar",
      "/finanzas/costos",
      "/finanzas/caja-neta",
    ]) {
      expect(moduleCrumb(p), `${p} no resolvió a Finanzas`).toEqual({
        label: "Finanzas",
        href: "/cobranza",
      });
    }
  });

  it("Marketing no le roba rutas a nadie pese a estar antes en el array", () => {
    expect(moduleCrumb("/marketing/temas")?.label).toBe("Marketing");
    expect(moduleCrumb("/contenido")?.label).toBe("Marketing");
  });

  it("los módulos de primer nivel resuelven a sí mismos", () => {
    expect(moduleCrumb("/clients/abc123")?.label).toBe("Clientes");
    expect(moduleCrumb("/roles/xyz")?.label).toBe("Roles");
    expect(moduleCrumb("/business-cases/1")?.label).toBe("Ventas");
  });

  it("un pathname que no pertenece a ningún módulo devuelve null", () => {
    expect(moduleCrumb("/no-existe")).toBeNull();
    expect(moduleCrumb("/")).toBeNull();
  });
});
