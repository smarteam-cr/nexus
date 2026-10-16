import { describe, expect, it } from "vitest";
import { diaEnCostaRica, esSeccionValida, hayQueContar, seccionDeLaRuta, SECCION_OTRA } from "./secciones";

describe("la sección de una ruta", () => {
  it("sale del ítem del menú", () => {
    expect(seccionDeLaRuta("/para-ti")).toBe("para-ti");
    expect(seccionDeLaRuta("/clients/abc123?pieza=handoff")).toBe("clients");
    expect(seccionDeLaRuta("/tareas/delegadas")).toBe("tareas");
    expect(seccionDeLaRuta("/sales/exploraciones/x")).toBe("sales");
    expect(seccionDeLaRuta("/cobranza")).toBe("finanzas");
  });

  it("un hijo con ruta de otro módulo cuenta para el ítem del menú que lo lleva (el prefijo más largo)", () => {
    expect(seccionDeLaRuta("/customer-success/rentabilidad")).toBe("finanzas");
    expect(seccionDeLaRuta("/customer-success/abc")).toBe("customer-success");
  });

  it("el resumen antes de una reunión se mide aparte de «Para ti»", () => {
    expect(seccionDeLaRuta("/para-ti/reunion/abc123?cliente=c1")).toBe("preparar");
    expect(seccionDeLaRuta("/para-ti")).toBe("para-ti");
    expect(esSeccionValida("preparar")).toBe(true);
  });

  it("no confunde un prefijo con otra palabra", () => {
    expect(seccionDeLaRuta("/clientsx")).toBe(SECCION_OTRA);
  });

  it("lo que no está en el menú es «otra», y la pantalla de la medición no se cuenta", () => {
    expect(seccionDeLaRuta("/tu-carga")).toBe(SECCION_OTRA);
    expect(seccionDeLaRuta("/para-ti/uso")).toBeNull();
    expect(seccionDeLaRuta("/para-ti/uso?vista=equipo")).toBeNull();
  });

  it("valida solo claves del menú y «otra»", () => {
    expect(esSeccionValida("clients")).toBe(true);
    expect(esSeccionValida(SECCION_OTRA)).toBe(true);
    expect(esSeccionValida("cualquier-cosa")).toBe(false);
  });
});

describe("cuándo una visita es una apertura", () => {
  const T = Date.UTC(2026, 9, 16, 15, 0);
  it("la primera, y al cambiar de sección", () => {
    expect(hayQueContar(null, "clients", T)).toBe(true);
    expect(hayQueContar({ seccion: "clients", at: T }, "para-ti", T + 1000)).toBe(true);
  });
  it("en la misma sección, solo después de 30 minutos", () => {
    expect(hayQueContar({ seccion: "clients", at: T }, "clients", T + 29 * 60_000)).toBe(false);
    expect(hayQueContar({ seccion: "clients", at: T }, "clients", T + 30 * 60_000)).toBe(true);
  });
});

describe("el día en Costa Rica", () => {
  it("a las 23:30 de Costa Rica sigue siendo ese día", () => {
    expect(diaEnCostaRica(new Date("2026-10-17T05:30:00Z"))).toBe("2026-10-16");
    expect(diaEnCostaRica(new Date("2026-10-17T06:00:00Z"))).toBe("2026-10-17");
  });
});
