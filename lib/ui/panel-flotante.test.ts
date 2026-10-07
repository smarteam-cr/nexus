/**
 * lib/ui/panel-flotante.test.ts — un desplegable (Menu, CeldaSelect, el selector de ícono) queda DENTRO de la ventana.
 *
 * El 2026-10-06 el «Elegir a alguien» de Feedback › Encuestas, abierto desde la columna de la derecha, se salía por
 * el borde derecho y por abajo: la mecánica compartida (components/ui/usePanelFlotante.ts) anclaba el panel al botón
 * y nunca miraba la ventana.
 */
import { describe, expect, it } from "vitest";
import { posicionarPanel } from "@/components/ui/usePanelFlotante";

const VENTANA = { ancho: 1160, alto: 760 };
/** Un botón en la columna de la derecha, como «Elegir a alguien». */
const BOTON = { top: 208, bottom: 244, left: 856, right: 996 };

describe("posicionarPanel", () => {
  it("antes de medir el panel, lo ancla al botón", () => {
    expect(posicionarPanel(BOTON, "bottom", "start", null, VENTANA)).toEqual({ top: 250, maxHeight: 502, left: 856 });
    expect(posicionarPanel(BOTON, "bottom", "end", null, VENTANA)).toMatchObject({ right: VENTANA.ancho - 996 });
  });

  it("un panel que se saldría por la derecha se corre hasta que entra", () => {
    const pos = posicionarPanel(BOTON, "bottom", "start", { ancho: 330, alto: 400 }, VENTANA);
    expect(pos.left).toBe(VENTANA.ancho - 8 - 330);
    expect(pos.right).toBeUndefined();
  });

  it("y uno que se saldría por la izquierda, también", () => {
    const pos = posicionarPanel({ top: 100, bottom: 130, left: 20, right: 60 }, "bottom", "end", { ancho: 300, alto: 100 }, VENTANA);
    expect(pos.left).toBe(8);
  });

  it("el alto máximo es lo que queda de su lado: lo que sobra scrollea adentro", () => {
    const pos = posicionarPanel(BOTON, "bottom", "start", { ancho: 288, alto: 900 }, VENTANA);
    expect(pos.top).toBe(250);
    expect(pos.maxHeight).toBe(VENTANA.alto - 244 - 6 - 8);
  });

  it("si abajo no cabe y arriba hay más lugar, abre hacia arriba", () => {
    const abajo = { top: 680, bottom: 712, left: 100, right: 200 };
    const pos = posicionarPanel(abajo, "bottom", "start", { ancho: 224, alto: 300 }, VENTANA);
    expect(pos.top).toBeUndefined();
    expect(pos.bottom).toBe(VENTANA.alto - 680 + 6);
    expect(pos.maxHeight).toBe(680 - 6 - 8);
  });

  it("si cabe de su lado, no se da vuelta aunque del otro haya más lugar", () => {
    const abajo = { top: 500, bottom: 532, left: 100, right: 200 };
    const pos = posicionarPanel(abajo, "bottom", "start", { ancho: 224, alto: 120 }, VENTANA);
    expect(pos.top).toBe(538);
  });
});
