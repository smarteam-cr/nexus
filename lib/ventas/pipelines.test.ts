/**
 * lib/ventas/pipelines.test.ts
 *
 * Estos casos existen por un bug que ya ocurrió: la detección de "trato perdido" era una
 * regex sobre el id de la etapa (/lost|perdid/i), y el id de la etapa Perdido de un
 * pipeline es "1373937255" — un número, sin una sola letra. Un trato perdido de ahí se
 * marcaba REABIERTA, que dice exactamente lo contrario.
 *
 * La lección es más general que ese pipeline: los ids de HubSpot son opacos y no se
 * pueden interpretar por su forma. Si mañana alguien agrega un pipeline y lo declara acá,
 * estos casos verifican que lo haya declarado ENTERO.
 */
import { describe, expect, it } from "vitest";
import {
  ETAPAS_GANADAS,
  ETAPAS_PERDIDAS,
  labelDePipeline,
  PIPELINES,
  PIPELINES_VENTA_PROPIA,
} from "./pipelines";

describe("los pipelines declarados", () => {
  it("cada uno tiene ganada y perdida, y son distintas entre sí", () => {
    for (const p of PIPELINES) {
      expect(p.etapaGanada, `${p.label} sin etapa ganada`).toBeTruthy();
      expect(p.etapaPerdida, `${p.label} sin etapa perdida`).toBeTruthy();
      expect(p.etapaGanada).not.toBe(p.etapaPerdida);
    }
  });

  it("ninguna etapa se repite entre pipelines", () => {
    // Un id repetido haría que un trato de un pipeline se leyera con el estado de otro.
    const todas = [...ETAPAS_GANADAS, ...ETAPAS_PERDIDAS];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("EL BUG QUE MOTIVA ESTE ARCHIVO: hay una etapa perdida que es solo números", () => {
    // Si esto deja de ser cierto algún día, genial — pero mientras lo sea, ninguna
    // heurística sobre el TEXTO del id puede clasificar etapas.
    expect(ETAPAS_PERDIDAS.some((e) => /^\d+$/.test(e))).toBe(true);
    // Y la prueba de que la regex vieja fallaba con ella:
    const regexVieja = /lost|perdid/i;
    expect(ETAPAS_PERDIDAS.filter((e) => !regexVieja.test(e))).not.toEqual([]);
  });

  it("una etapa ganada nunca se confunde con una perdida", () => {
    for (const g of ETAPAS_GANADAS) expect(ETAPAS_PERDIDAS).not.toContain(g);
    for (const p of ETAPAS_PERDIDAS) expect(ETAPAS_GANADAS).not.toContain(p);
  });

  it("los ids de pipeline son únicos", () => {
    const ids = PIPELINES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("qué cuenta como venta propia", () => {
  it("la venta compartida con HubSpot NO cuenta", () => {
    // Es registro de oportunidad, no facturación de la casa. Si algún día se decide que
    // cuenta, es cambiar este flag — y este caso se va a poner rojo para avisar que el
    // vendido del año cambió de definición.
    const compartida = PIPELINES.find((p) => p.label.includes("Shared Selling"))!;
    expect(compartida.esVentaPropia).toBe(false);
    expect(PIPELINES_VENTA_PROPIA).not.toContain(compartida.id);
  });

  it("hay al menos un pipeline que sí cuenta: si no, el vendido siempre daría cero", () => {
    expect(PIPELINES_VENTA_PROPIA.length).toBeGreaterThan(0);
  });
});

describe("labelDePipeline", () => {
  it("traduce el id al nombre que se lee en HubSpot", () => {
    expect(labelDePipeline("default")).toBe("Pipeline de ventas");
  });

  it("un pipeline que nadie declaró devuelve su id crudo, no vacío ni «desconocido»", () => {
    // Mostrar el id feo es lo correcto: se puede buscar en HubSpot. Un "desconocido"
    // obliga a ir al código para saber de qué se está hablando.
    expect(labelDePipeline("pipeline-nuevo-123")).toBe("pipeline-nuevo-123");
  });
});
