/**
 * lib/nexus-chat/sin-notas-en-la-preventa.test.ts — en la preventa, el chat de la cuenta no ofrece «nota.crear» (23 nov,
 * etapa 2 del plan maestro de «Hablar con Nexus»: las notas de la cuenta van a HubSpot, y lo que se le cuenta a Nexus no).
 * Mira las herramientas que de verdad recibe el modelo, no el texto del código.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { nombreDeHerramienta } from "@/lib/operaciones/herramientas";
import { herramientasDelChat, NOTA_DE_LA_CUENTA as OPERACION } from "./herramientas-server";

/** Como la ve el modelo (el nombre de la herramienta, no el de la operación). */
const NOTA_DE_LA_CUENTA = nombreDeHerramienta(OPERACION);
const nombres = (o?: { sinNotasDeLaCuenta?: boolean }) => herramientasDelChat(o).map((t) => t.name);

describe("las herramientas del chat de la cuenta", () => {
  it("en la ficha ofrece las notas de la cuenta", () => {
    expect(nombres()).toContain(NOTA_DE_LA_CUENTA);
    expect(nombres({ sinNotasDeLaCuenta: false })).toContain(NOTA_DE_LA_CUENTA);
  });

  it("en la preventa no las ofrece, y todo lo demás sigue igual y en el mismo orden", () => {
    const todas = nombres();
    const sin = nombres({ sinNotasDeLaCuenta: true });
    expect(sin).not.toContain(NOTA_DE_LA_CUENTA);
    expect(sin).toEqual(todas.filter((n) => n !== NOTA_DE_LA_CUENTA));
  });
});
